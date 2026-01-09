// supabase/functions/generate-insights/index.ts
// Génère des insights IA pour tous les utilisateurs
// Peut être appelée via CRON ou manuellement

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Prompt système optimisé - style Directeur Commercial (CSO)
const SYSTEM_PROMPT_CSO = `Tu es l'Intelligence Commerciale de Digityx Studios, une agence experte en développement Fullstack et IA.
Ton rôle est d'analyser les données historiques d'un client pour détecter des opportunités de vente additionnelle (upsell) ou croisée (cross-sell).

### RÈGLES D'ANALYSE :
1. ANALYSE TECHNIQUE : Si le client a une stack spécifique (ex: React), suggère des évolutions cohérentes (ex: migration Next.js 15, optimisation des Core Web Vitals).
2. ANALYSE IA : Identifie où l'IA pourrait automatiser leurs processus actuels mentionnés dans les notes.
3. CYCLE DE VIE : Si un projet est terminé depuis 6 mois, suggère une phase de maintenance ou une V2.
4. SATISFACTION : Ne suggère des opportunités que si la satisfaction est >= 7.

### RECOMMANDATIONS FINANCIÈRES :
- Sois réaliste. Ne suggère pas un projet à 50k€ pour un client qui a un CA total de 5k€.
- Les montants doivent être des estimations HT basées sur la complexité perçue.
- Fourchettes typiques : Formation (2-5k€), Audit (3-8k€), Feature (5-15k€), Refonte (15-40k€), Projet complet (20-80k€).

### FORMAT DE SORTIE :
Tu dois impérativement répondre au format JSON strict suivant :
{
  "opportunite": "Titre court et percutant",
  "montant_estime": nombre_entier,
  "justification": "Explique pourquoi cette offre est pertinente maintenant en 2 phrases max.",
  "confiance": nombre_entre_0_et_100
}

Si aucune opportunité n'est détectée avec un score de confiance > 60, renvoie : {"opportunite": null}`;

// Utilitaire pour tronquer le texte (gestion tokens)
function truncateText(text: string | null, maxLength: number = 500): string {
  if (!text) return "Non renseigné";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "... [tronqué]";
}

// Utilitaire pour parser le JSON de Claude (gère le markdown wrapping)
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

// Types
interface Client {
  id: string;
  user_id: string;
  nom: string;
  contact_principal: string | null;
  satisfaction: number | null;
  ca_total_genere: number;
  notes: string | null;
  date_dernier_contact: string | null;
  idees_vente: string[];
}

interface Project {
  id: string;
  client_id: string;
  nom: string;
  type: string | null;
  montant_ht: number | null;
  stack_technique: string[];
  statut_projet: string;
  extensions_possibles: string[];
  date_facturation?: string | null;
  montant_facture?: number | null;
  deleted_at: string | null;
  client?: Client;
}

interface Interaction {
  date: string;
  sujet: string | null;
  notes: string | null;
}

// ============ DETECTION FUNCTIONS ============

async function detectForgottenContacts(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .eq("statut", "Actif")
    .is("deleted_at", null)
    .lt("date_dernier_contact", thirtyDaysAgo.toISOString());

  let insightsCreated = 0;

  for (const client of clients || []) {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(client.date_dernier_contact).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // Vérifier si insight similaire existe déjà
    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("client_id", client.id)
      .eq("type", "Contact oublié")
      .eq("statut", "Nouveau")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Contact oublié",
        client_id: client.id,
        titre: `Pas de contact avec ${client.nom} depuis ${daysSinceContact} jours`,
        description: `Client actif sans contact depuis ${daysSinceContact} jours. Risque de perte de relation.`,
        score_confiance: Math.min(95, 70 + daysSinceContact),
        action_suggeree: `Planifier check-in avec ${client.contact_principal || client.nom}`,
      });

      if (!error) insightsCreated++;
    }
  }

  return insightsCreated;
}

async function detectRecommendationMoments(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Récupérer les projets terminés et payés avec satisfaction >= 8
  const { data: projects } = await supabase
    .from("projects")
    .select(
      `
      *,
      client:clients(*)
    `
    )
    .eq("user_id", userId)
    .eq("statut_projet", "Terminé")
    .is("deleted_at", null);

  let insightsCreated = 0;

  for (const project of projects || []) {
    const client = project.client;
    if (!client || (client.satisfaction ?? 0) < 8) continue;

    // Vérifier si le projet a des lots payés
    const { data: paidLots } = await supabase
      .from("project_lots")
      .select("id")
      .eq("project_id", project.id)
      .eq("statut_facturation", "Payé")
      .limit(1);

    if (!paidLots?.length) continue;

    // Vérifier dernière demande de recommandation (90 jours)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: recentRequest } = await supabase
      .from("interactions")
      .select("id")
      .eq("client_id", project.client_id)
      .ilike("sujet", "%recommandation%")
      .gte("date", ninetyDaysAgo.toISOString())
      .limit(1);

    if (!recentRequest?.length) {
      const { data: existing } = await supabase
        .from("insights_ia")
        .select("id")
        .eq("client_id", project.client_id)
        .eq("type", "Moment recommandation")
        .eq("statut", "Nouveau")
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("insights_ia").insert({
          user_id: userId,
          type: "Moment recommandation",
          client_id: project.client_id,
          project_id: project.id,
          titre: `Moment idéal pour demander recommandation à ${client.nom}`,
          description: `Projet "${project.nom}" terminé avec succès. Satisfaction: ${client.satisfaction}/10.`,
          score_confiance: (project.montant_ht ?? 0) >= 10000 ? 90 : 75,
          action_suggeree:
            "Envoyer email demande recommandation personnalisé",
        });

        if (!error) insightsCreated++;
      }
    }
  }

  return insightsCreated;
}

async function detectExtensionOpportunities(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  const { data: clients } = await supabase
    .from("clients")
    .select(
      `
      *,
      projects(*),
      interactions(date, notes, sujet)
    `
    )
    .eq("user_id", userId)
    .eq("statut", "Actif")
    .is("deleted_at", null)
    .gte("satisfaction", 7);

  let insightsCreated = 0;

  for (const client of clients || []) {
    const completedProjects = (client.projects as Project[])?.filter(
      (p) => p.statut_projet === "Terminé" && !p.deleted_at
    );

    if (!completedProjects?.length) continue;

    // Vérifier si un insight existe déjà ce mois-ci pour ce client/type
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: existingThisMonth } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("client_id", client.id)
      .eq("type", "Opportunité extension")
      .gte("created_at", startOfMonth.toISOString())
      .limit(1);

    // Autoriser un insight par type par mois par client
    if (existingThisMonth?.length) continue;

    // Construction du contexte avec troncature pour éviter les tokens excessifs
    const interactions = client.interactions as Interaction[] | undefined;
    const userContext = `
DONNÉES DU CLIENT :
- Nom : ${client.nom}
- CA Historique : ${client.ca_total_genere}€
- Satisfaction : ${client.satisfaction}/10
- Dernier contact : ${client.date_dernier_contact || "Non renseigné"}

PROJETS RÉALISÉS :
${completedProjects
  .slice(0, 5)
  .map(
    (p) =>
      `- ${p.nom} (Type: ${p.type}, Montant: ${p.montant_ht}€, Stack: ${p.stack_technique?.slice(0, 5).join(", ") || "N/A"})`
  )
  .join("\n")}

IDÉES DE VENTE NOTÉES : ${client.idees_vente?.slice(0, 5).join(", ") || "Aucune"}

EXTENSIONS POSSIBLES NOTÉES :
${completedProjects.flatMap((p) => p.extensions_possibles || []).slice(0, 5).join(", ") || "Aucune"}

NOTES CLIENT (résumé) : ${truncateText(client.notes, 300)}

DERNIERS ÉCHANGES :
${
  interactions
    ?.slice(0, 3)
    .map(
      (i) =>
        `- ${new Date(i.date).toLocaleDateString("fr-FR")}: ${truncateText(i.sujet, 50)} - ${truncateText(i.notes, 100)}`
    )
    .join("\n") || "Aucun"
}
`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        system: SYSTEM_PROMPT_CSO,
        messages: [{ role: "user", content: userContext }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const result = parseClaudeJSON(content.text);

        if (
          result &&
          result.opportunite &&
          (result.confiance as number) >= 70
        ) {
          const { error } = await supabase.from("insights_ia").insert({
            user_id: userId,
            type: "Opportunité extension",
            client_id: client.id,
            titre: result.opportunite as string,
            description: result.justification as string,
            score_confiance: result.confiance as number,
            action_suggeree: `Proposer ${result.opportunite} (~${result.montant_estime}€)`,
            metadata: {
              montant_estime: result.montant_estime,
              generated_at: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
          });

          if (!error) insightsCreated++;
        }
      }
    } catch (error) {
      console.error(`Error analyzing client ${client.id}:`, error);
    }
  }

  return insightsCreated;
}

async function detectUnpaidInvoices(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Récupérer les lots facturés mais non payés depuis plus de 30 jours
  const { data: lots } = await supabase
    .from("project_lots")
    .select(
      `
      *,
      project:projects(*, client:clients(nom))
    `
    )
    .eq("user_id", userId)
    .eq("statut_facturation", "Facturé")
    .lt("date_facturation", thirtyDaysAgo.toISOString());

  let insightsCreated = 0;

  for (const lot of lots || []) {
    if (!lot.date_facturation || !lot.project) continue;

    const daysSinceInvoice = Math.floor(
      (Date.now() - new Date(lot.date_facturation).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("project_id", lot.project_id)
      .eq("type", "Facture impayée")
      .eq("statut", "Nouveau")
      .maybeSingle();

    if (!existing) {
      const project = lot.project as Project & { client: { nom: string } };
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Facture impayée",
        client_id: project.client_id,
        project_id: lot.project_id,
        titre: `Facture impayée: ${lot.nom} (${daysSinceInvoice}j)`,
        description: `Facture de ${lot.montant_facture}€ non payée depuis ${daysSinceInvoice} jours.`,
        score_confiance: 95,
        action_suggeree: `Relancer ${project.client?.nom} pour paiement`,
      });

      if (!error) insightsCreated++;
    }
  }

  return insightsCreated;
}

async function detectLowPipeline(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Calculer la valeur du pipeline (projets en discussion/proposition)
  const { data: projects } = await supabase
    .from("projects")
    .select("montant_ht, probabilite_closing")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("statut_projet", ["Discussion", "Proposition envoyée"]);

  const pipelineValue =
    projects?.reduce((acc, p) => {
      return acc + ((p.montant_ht ?? 0) * (p.probabilite_closing ?? 50)) / 100;
    }, 0) || 0;

  if (pipelineValue < 10000) {
    // Vérifier si un insight similaire existe déjà cette semaine
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "Pipeline faible")
      .eq("statut", "Nouveau")
      .gte("created_at", oneWeekAgo.toISOString())
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Pipeline faible",
        titre: `Pipeline faible: ${Math.round(pipelineValue)}€`,
        description: `Pipeline actuel sous 50k€. Actions commerciales recommandées.`,
        score_confiance: 80,
        action_suggeree: "Recontacter prospects froids ou lancer prospection",
      });

      if (!error) return 1;
    }
  }

  return 0;
}

// ============ MAIN HANDLER ============

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Récupérer tous les utilisateurs avec des clients actifs
    const { data: users } = await supabase
      .from("clients")
      .select("user_id")
      .eq("statut", "Actif")
      .is("deleted_at", null);

    const uniqueUsers = [...new Set(users?.map((u) => u.user_id))];

    const stats = {
      users_processed: 0,
      forgotten_contacts: 0,
      recommendation_moments: 0,
      extension_opportunities: 0,
      unpaid_invoices: 0,
      low_pipeline: 0,
    };

    for (const userId of uniqueUsers) {
      stats.forgotten_contacts += await detectForgottenContacts(
        supabase,
        userId
      );
      stats.recommendation_moments += await detectRecommendationMoments(
        supabase,
        userId
      );
      stats.extension_opportunities += await detectExtensionOpportunities(
        supabase,
        anthropic,
        userId
      );
      stats.unpaid_invoices += await detectUnpaidInvoices(supabase, userId);
      stats.low_pipeline += await detectLowPipeline(supabase, userId);
      stats.users_processed++;
    }

    const totalInsights =
      stats.forgotten_contacts +
      stats.recommendation_moments +
      stats.extension_opportunities +
      stats.unpaid_invoices +
      stats.low_pipeline;

    console.log("Insights generation completed:", stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${totalInsights} insights for ${stats.users_processed} users`,
        stats,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-insights:", error);
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
