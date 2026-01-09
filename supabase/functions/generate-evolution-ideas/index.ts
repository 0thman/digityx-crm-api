// supabase/functions/generate-evolution-ideas/index.ts
// Génère des idées d'évolution pour un projet via Claude AI

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Types pour la requête et la réponse
interface GenerateRequest {
  project_id: string;
  context: {
    project_name: string;
    project_description?: string;
    project_type?: string;
    stack_technique?: string[];
    documentation_md?: string;
    client_name: string;
    client_satisfaction?: number;
    client_potentiel?: string;
    client_ca_total?: number;
    lots: Array<{
      nom: string;
      description?: string;
      montant_ht?: number;
      statut_lot: string;
    }>;
    existing_ideas: Array<{
      titre: string;
      categorie?: string;
      statut: string;
    }>;
  };
}

interface GeneratedIdea {
  titre: string;
  description: string;
  categorie: string;
  priorite: string;
  impact_client: string;
  estimation_montant?: number;
  estimation_jours?: number;
  reasoning: string;
  confidence: number;
}

interface GenerateResponse {
  success: boolean;
  ideas: GeneratedIdea[];
  total_potential: number;
}

// Prompt système pour la génération d'idées
const SYSTEM_PROMPT = `Tu es un Product Strategist expert pour Digityx Studios, une agence de développement Fullstack et IA.

Ton rôle est d'analyser un projet existant et de proposer 3 à 5 idées d'amélioration concrètes et vendables.
Ces idées doivent être des évolutions naturelles du projet, pas des projets séparés.

### RÈGLES D'ANALYSE :
1. COHÉRENCE TECHNIQUE : Les idées doivent être cohérentes avec la stack existante
2. VALEUR CLIENT : Privilégier les idées qui apportent une valeur business mesurable
3. FAISABILITÉ : Les estimations doivent être réalistes (basées sur la complexité)
4. NON-DUPLICATION : Ne jamais proposer d'idées similaires à celles déjà existantes
5. PROGRESSIVITÉ : Proposer un mix d'idées petites (quick wins) et plus ambitieuses
6. CONTEXTE CLIENT : Adapter les propositions au niveau de satisfaction et au potentiel du client

### CATÉGORIES POSSIBLES :
- Performance (optimisation, cache, CDN, lazy loading)
- UX/UI (refonte interface, accessibilité, responsive, animations)
- Sécurité (audit, 2FA, encryption, RGPD)
- IA/Automatisation (chatbot, recommandations, analyse, génération)
- Nouvelle fonctionnalité (feature, module, espace utilisateur)
- Refactoring (dette technique, migration, modernisation, tests)
- Intégration (API tierces, CRM, analytics, paiement)
- Mobile (PWA, app native, responsive avancé, notifications)

### PRIORITÉS :
- Haute : ROI rapide et visible pour le client
- Moyenne : Amélioration significative mais moins urgente
- Basse : Nice-to-have, amélioration de confort

### IMPACT CLIENT :
- Fort : Augmente directement le CA ou les conversions
- Moyen : Améliore l'expérience utilisateur ou l'efficacité
- Faible : Amélioration technique ou de maintenance

### FOURCHETTES DE PRIX TYPIQUES (basées sur la complexité) :
- Petite évolution (2-5 jours) : 1.500€ - 4.000€
- Évolution moyenne (5-15 jours) : 4.000€ - 12.000€
- Évolution importante (15-30 jours) : 12.000€ - 25.000€
- Évolution majeure (30+ jours) : 25.000€ - 50.000€

### FORMAT DE SORTIE (JSON strict) :
{
  "ideas": [
    {
      "titre": "Titre court et vendeur (max 60 caractères)",
      "description": "Description détaillée de l'amélioration, ses bénéfices concrets pour le client, et pourquoi c'est pertinent maintenant. (2-4 phrases)",
      "categorie": "Une des catégories ci-dessus",
      "priorite": "Basse|Moyenne|Haute",
      "impact_client": "Faible|Moyen|Fort",
      "estimation_montant": nombre_entier_en_euros,
      "estimation_jours": nombre_decimal,
      "reasoning": "Pourquoi cette idée est particulièrement pertinente pour ce projet et ce client (1-2 phrases)",
      "confidence": nombre_0_100
    }
  ]
}

### RÈGLES IMPORTANTES :
- Génère exactement entre 3 et 5 idées
- Trie les idées par impact_client décroissant (Fort > Moyen > Faible)
- À impact égal, trie par priorité décroissante
- Assure-toi que chaque idée est UNIQUE et différente des idées existantes
- Le confidence score reflète ta certitude que cette idée sera pertinente et bien reçue
- Ne propose que des idées avec un confidence >= 60`;

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

// Tronquer le texte pour limiter les tokens
function truncateText(text: string | undefined | null, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
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
    const body: GenerateRequest = await req.json();

    if (!body.project_id) {
      return new Response(
        JSON.stringify({ error: "project_id est requis" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!body.context) {
      return new Response(
        JSON.stringify({ error: "Le contexte du projet est requis" }),
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

    const ctx = body.context;

    // Construire la liste des lots
    const lotsContext = ctx.lots && ctx.lots.length > 0
      ? ctx.lots.map((lot, i) =>
          `  ${i + 1}. ${lot.nom} (${lot.statut_lot})${lot.montant_ht ? ` - ${lot.montant_ht}€` : ""}${lot.description ? `\n     ${truncateText(lot.description, 200)}` : ""}`
        ).join("\n")
      : "  Aucun lot défini";

    // Construire la liste des idées existantes
    const existingIdeasContext = ctx.existing_ideas && ctx.existing_ideas.length > 0
      ? ctx.existing_ideas.map((idea) =>
          `  - ${idea.titre}${idea.categorie ? ` [${idea.categorie}]` : ""} (${idea.statut})`
        ).join("\n")
      : "  Aucune idée existante";

    // Construire le message utilisateur avec tout le contexte
    const userMessage = `
ANALYSE CE PROJET ET GÉNÈRE DES IDÉES D'ÉVOLUTION VENDABLES :

═══════════════════════════════════════════════════
INFORMATIONS DU PROJET
═══════════════════════════════════════════════════
Nom : ${ctx.project_name}
Type : ${ctx.project_type || "Non spécifié"}
Stack technique : ${ctx.stack_technique?.join(", ") || "Non spécifiée"}

Description :
${truncateText(ctx.project_description, 1000) || "Pas de description disponible"}

${ctx.documentation_md ? `Documentation technique :
${truncateText(ctx.documentation_md, 1500)}` : ""}

═══════════════════════════════════════════════════
INFORMATIONS DU CLIENT
═══════════════════════════════════════════════════
Nom : ${ctx.client_name}
Satisfaction : ${ctx.client_satisfaction ? `${ctx.client_satisfaction}/10` : "Non évaluée"}
Potentiel d'extension : ${ctx.client_potentiel || "Non évalué"}
CA total généré : ${ctx.client_ca_total ? `${ctx.client_ca_total}€` : "Non disponible"}

═══════════════════════════════════════════════════
LOTS DU PROJET (livrables existants)
═══════════════════════════════════════════════════
${lotsContext}

═══════════════════════════════════════════════════
IDÉES DÉJÀ EXISTANTES (à ne PAS dupliquer)
═══════════════════════════════════════════════════
${existingIdeasContext}

═══════════════════════════════════════════════════

Génère 3 à 5 idées d'évolution NOUVELLES et PERTINENTES pour ce projet.
Assure-toi que les idées sont cohérentes avec la stack technique et apportent une vraie valeur au client.
`;

    // Appeler Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response format from Claude");
    }

    const result = parseClaudeJSON(content.text);
    if (!result || !result.ideas) {
      throw new Error("Failed to parse Claude response");
    }

    // Parser et valider les idées
    const rawIdeas = (result.ideas as Array<Record<string, unknown>>) || [];

    const validIdeas: GeneratedIdea[] = rawIdeas
      .filter((idea) => {
        // Filtrer les idées avec un confidence trop bas
        const confidence = (idea.confidence as number) || 0;
        return confidence >= 60;
      })
      .map((idea) => ({
        titre: (idea.titre as string) || "",
        description: (idea.description as string) || "",
        categorie: (idea.categorie as string) || "Autre",
        priorite: (idea.priorite as string) || "Moyenne",
        impact_client: (idea.impact_client as string) || "Moyen",
        estimation_montant: (idea.estimation_montant as number) || undefined,
        estimation_jours: (idea.estimation_jours as number) || undefined,
        reasoning: (idea.reasoning as string) || "",
        confidence: (idea.confidence as number) || 70,
      }))
      .slice(0, 5); // Maximum 5 idées

    if (validIdeas.length === 0) {
      throw new Error("Aucune idée pertinente n'a pu être générée");
    }

    // Calculer le potentiel total
    const totalPotential = validIdeas.reduce(
      (sum, idea) => sum + (idea.estimation_montant || 0),
      0
    );

    const generateResponse: GenerateResponse = {
      success: true,
      ideas: validIdeas,
      total_potential: totalPotential,
    };

    return new Response(JSON.stringify(generateResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-evolution-ideas:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Une erreur est survenue",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
