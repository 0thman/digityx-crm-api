// supabase/functions/analyze-quick-note/index.ts
// Analyse une note rapide avec IA et détermine le type (Interaction/Action/Idée)

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Types pour la requête et la réponse
interface AnalyzeRequest {
  note: string;
  project_id: string;
  client_id: string;
  project_context?: {
    project_name: string;
    client_name: string;
    project_type?: string;
    stack_technique?: string[];
  };
}

interface InteractionSuggestion {
  type: "interaction";
  date: string;
  interaction_type: string;
  sujet: string;
  notes: string;
  actions_suivantes?: string;
}

interface ActionSuggestion {
  type: "action";
  titre: string;
  description: string;
  action_type: string;
  priorite: string;
  date_echeance?: string;
}

interface IdeaSuggestion {
  type: "idea";
  titre: string;
  description: string;
  categorie: string;
  priorite: string;
  impact_client: string;
  estimation_montant?: number;
  estimation_jours?: number;
}

type SuggestedData = InteractionSuggestion | ActionSuggestion | IdeaSuggestion;

interface SuggestedItem {
  type: "interaction" | "action" | "idea";
  confidence: number;
  reasoning: string;
  data: SuggestedData;
}

interface AnalyzeResponse {
  success: boolean;
  items: SuggestedItem[];
}

// Prompt système pour la classification
const SYSTEM_PROMPT = `Tu es un assistant CRM intelligent pour Digityx Studios, une agence de développement Fullstack et IA.

Ton rôle est d'analyser une note rapide saisie par l'utilisateur et d'extraire TOUS les éléments CRM distincts qu'elle contient.
Une note peut contenir plusieurs interactions, plusieurs actions et/ou plusieurs idées. Tu dois les identifier et les séparer.

### TYPES D'ÉLÉMENTS :

1. **INTERACTION** - Un échange PASSÉ avec le client
   Indicateurs : verbes au passé, "j'ai appelé", "on a discuté", "réunion de ce matin", "il m'a dit", "envoyé un email"
   Types possibles : Email, Appel, Réunion, Check-in, Démo, Atelier, Autre

2. **ACTION** - Une tâche À FAIRE dans le futur
   Indicateurs : verbes au futur ou infinitif, "à faire", "relancer", "envoyer", "il faut", "penser à", "ne pas oublier"
   Types possibles : Check-in, Proposition commerciale, Demande recommandation, Relance, Contenu, Autre
   Priorités : Basse, Moyenne, Haute, Critique

3. **IDÉE** - Une opportunité d'amélioration ou d'upsell
   Indicateurs : "on pourrait", "suggestion", "amélioration", "nouvelle fonctionnalité", "il serait intéressant", "potentiel"
   Catégories : Performance, UX/UI, Sécurité, IA/Automatisation, Nouvelle fonctionnalité, Refactoring, Intégration, Mobile, Autre
   Priorités : Basse, Moyenne, Haute
   Impact client : Faible, Moyen, Fort

### RÈGLES D'ANALYSE :
- Analyse le ton et le temps des verbes
- Une interaction est toujours un événement passé ou présent
- Une action est toujours orientée futur
- Une idée est une proposition d'amélioration ou d'opportunité commerciale
- En cas de doute entre action et idée, favorise ACTION si c'est une tâche concrète à réaliser
- IMPORTANT : Si la note contient plusieurs éléments distincts, crée un item pour CHAQUE élément

### FORMAT DE SORTIE (JSON strict) :
{
  "items": [
    {
      "type": "interaction" | "action" | "idea",
      "confidence": nombre_0_100,
      "reasoning": "Explication courte de pourquoi ce type a été choisi",
      "data": { ... }
    }
  ]
}

Pour chaque INTERACTION dans data :
{
  "type": "interaction",
  "date": "YYYY-MM-DD",
  "interaction_type": "Email|Appel|Réunion|Check-in|Démo|Atelier|Autre",
  "sujet": "Résumé court (max 60 caractères)",
  "notes": "Contenu détaillé de la note",
  "actions_suivantes": "Si mentionnées dans la note, sinon null"
}

Pour chaque ACTION dans data :
{
  "type": "action",
  "titre": "Titre de l'action (max 60 caractères)",
  "description": "Contexte et détails",
  "action_type": "Check-in|Proposition commerciale|Demande recommandation|Relance|Contenu|Autre",
  "priorite": "Basse|Moyenne|Haute|Critique",
  "date_echeance": "YYYY-MM-DD ou null si non mentionnée"
}

Pour chaque IDÉE dans data :
{
  "type": "idea",
  "titre": "Titre de l'idée (max 60 caractères)",
  "description": "Description détaillée de l'opportunité",
  "categorie": "Performance|UX/UI|Sécurité|IA/Automatisation|Nouvelle fonctionnalité|Refactoring|Intégration|Mobile|Autre",
  "priorite": "Basse|Moyenne|Haute",
  "impact_client": "Faible|Moyen|Fort",
  "estimation_montant": nombre_ou_null,
  "estimation_jours": nombre_ou_null
}

### EXEMPLES :

Note: "Appel avec Pierre ce matin, il veut un chatbot. Lui envoyer un devis demain."
→ 2 items : 1 interaction (l'appel passé) + 1 action (envoyer le devis)

Note: "Réunion avec l'équipe. On pourrait ajouter un dashboard analytics et aussi une API publique."
→ 3 items : 1 interaction (la réunion) + 2 idées (dashboard + API)`;

// Utilitaire pour parser le JSON de Claude
function parseClaudeJSON(rawText: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawText);
  } catch {
    // Nettoyer si Claude entoure le JSON de ```json ... ```
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Calculer la date d'échéance par défaut (J+7)
function getDefaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split("T")[0];
}

// Obtenir la date du jour
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Vérifier l'authentification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Créer le client Supabase avec le contexte utilisateur
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Vérifier l'utilisateur
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parser la requête
    const body: AnalyzeRequest = await req.json();

    if (!body.note || body.note.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "La note ne peut pas être vide" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Vérifier la clé API Anthropic
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Construire le contexte utilisateur
    const context = body.project_context;
    const userMessage = `
CONTEXTE DU PROJET :
- Projet : ${context?.project_name || "Non spécifié"}
- Client : ${context?.client_name || "Non spécifié"}
- Type de projet : ${context?.project_type || "Non spécifié"}
- Stack technique : ${context?.stack_technique?.join(", ") || "Non spécifié"}

NOTE RAPIDE À ANALYSER :
"${body.note}"

Analyse cette note et détermine le type d'élément CRM à créer.
`;

    // Appeler Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response format from Claude");
    }

    const result = parseClaudeJSON(content.text);
    if (!result) {
      throw new Error("Failed to parse Claude response");
    }

    // Parser les items du résultat
    const rawItems = (result.items as Array<Record<string, unknown>>) || [];

    // Si Claude retourne l'ancien format (un seul item), le convertir
    if (rawItems.length === 0 && result.type) {
      rawItems.push({
        type: result.type,
        confidence: result.confidence || 80,
        reasoning: result.reasoning || "",
        data: result.data || {},
      });
    }

    // Construire les items structurés
    const suggestedItems: SuggestedItem[] = rawItems.map((item) => {
      const itemType = item.type as "interaction" | "action" | "idea";
      const data = item.data as Record<string, unknown>;

      let suggestedData: SuggestedData;

      switch (itemType) {
        case "interaction":
          suggestedData = {
            type: "interaction",
            date: (data.date as string) || getTodayDate(),
            interaction_type: (data.interaction_type as string) || "Autre",
            sujet: (data.sujet as string) || "",
            notes: (data.notes as string) || body.note,
            actions_suivantes: (data.actions_suivantes as string) || undefined,
          };
          break;

        case "action":
          suggestedData = {
            type: "action",
            titre: (data.titre as string) || "",
            description: (data.description as string) || body.note,
            action_type: (data.action_type as string) || "Autre",
            priorite: (data.priorite as string) || "Moyenne",
            date_echeance:
              (data.date_echeance as string) || getDefaultDueDate(),
          };
          break;

        case "idea":
          suggestedData = {
            type: "idea",
            titre: (data.titre as string) || "",
            description: (data.description as string) || body.note,
            categorie: (data.categorie as string) || "Autre",
            priorite: (data.priorite as string) || "Moyenne",
            impact_client: (data.impact_client as string) || "Moyen",
            estimation_montant: (data.estimation_montant as number) || undefined,
            estimation_jours: (data.estimation_jours as number) || undefined,
          };
          break;

        default:
          throw new Error(`Unknown classification type: ${itemType}`);
      }

      return {
        type: itemType,
        confidence: (item.confidence as number) || 80,
        reasoning: (item.reasoning as string) || "",
        data: suggestedData,
      };
    });

    if (suggestedItems.length === 0) {
      throw new Error("No items extracted from the note");
    }

    const analyzeResponse: AnalyzeResponse = {
      success: true,
      items: suggestedItems,
    };

    return new Response(JSON.stringify(analyzeResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-quick-note:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
