// supabase/functions/create-action-from-insight/index.ts
// Crée une action CRM à partir d'un insight IA validé par l'utilisateur
// Workflow: Insight (IA) → Validation (Humain) → Action (CRM)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateActionFromInsightRequest {
  insight_id: string;
  // Optional overrides
  titre?: string;
  priorite?: "Basse" | "Moyenne" | "Haute" | "Critique";
  date_echeance?: string;
}

// Mapping des types d'insights vers les types d'actions
const TYPE_MAPPING: Record<string, string> = {
  // Types existants
  "Contact oublié": "Check-in",
  "Moment recommandation": "Demande recommandation",
  "Opportunité extension": "Proposition commerciale",
  "Facture impayée": "Relance",
  "Pipeline faible": "Proposition commerciale",
  "Upsell détecté": "Proposition commerciale",
  "Risque churn": "Check-in",
  "Tendance identifiée": "Autre",
  // Nouveaux types IA
  "Timing upsell": "Proposition commerciale",
  "Stratégie contenu": "Autre",
  "Amélioration process": "Autre",
  "Optimisation pricing": "Autre",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use authenticated user context (passes RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      insight_id,
      titre: titreOverride,
      priorite: prioriteOverride,
      date_echeance: dateEcheanceOverride,
    }: CreateActionFromInsightRequest = await req.json();

    if (!insight_id) {
      throw new Error("insight_id is required");
    }

    // Récupérer l'insight
    const { data: insight, error: insightError } = await supabase
      .from("insights_ia")
      .select("*")
      .eq("id", insight_id)
      .single();

    if (insightError || !insight) {
      throw new Error("Insight not found or access denied");
    }

    // Vérifier que l'insight n'a pas déjà une action associée
    if (insight.statut === "Action créée" && insight.action_id) {
      throw new Error("An action has already been created for this insight");
    }

    // Déterminer le type d'action
    const actionType = TYPE_MAPPING[insight.type] || "Autre";

    // Déterminer la priorité basée sur le score de confiance
    let priorite: "Basse" | "Moyenne" | "Haute" | "Critique" = "Moyenne";
    if (insight.score_confiance >= 90) {
      priorite = "Critique";
    } else if (insight.score_confiance >= 85) {
      priorite = "Haute";
    } else if (insight.score_confiance >= 70) {
      priorite = "Moyenne";
    } else {
      priorite = "Basse";
    }

    // Calculer la date d'échéance par défaut (7 jours)
    const defaultEcheance = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Créer l'action
    const { data: action, error: actionError } = await supabase
      .from("actions")
      .insert({
        user_id: insight.user_id,
        client_id: insight.client_id,
        project_id: insight.project_id,
        titre: titreOverride || insight.action_suggeree || insight.titre,
        description: insight.description,
        type: actionType,
        priorite: prioriteOverride || priorite,
        generee_par_ia: true,
        date_echeance: dateEcheanceOverride || defaultEcheance,
      })
      .select()
      .single();

    if (actionError || !action) {
      throw new Error(`Failed to create action: ${actionError?.message}`);
    }

    // Mettre à jour le statut de l'insight
    const { error: updateError } = await supabase
      .from("insights_ia")
      .update({
        statut: "Action créée",
        action_id: action.id,
        date_action: new Date().toISOString(),
      })
      .eq("id", insight_id);

    if (updateError) {
      console.error("Failed to update insight status:", updateError);
      // Don't throw - action was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        message: "Action created successfully from insight",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in create-action-from-insight:", error);
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
