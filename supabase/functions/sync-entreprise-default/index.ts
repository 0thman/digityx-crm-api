// supabase/functions/sync-entreprise-default/index.ts
// Gère la logique "une seule entreprise par défaut par utilisateur"
// Appelée quand l'utilisateur définit une entreprise comme défaut

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncEntrepriseDefaultRequest {
  entreprise_id: string;
}

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

    const { entreprise_id }: SyncEntrepriseDefaultRequest = await req.json();

    if (!entreprise_id) {
      throw new Error("entreprise_id is required");
    }

    // Vérifier que l'entreprise existe et appartient à l'utilisateur
    const { data: entreprise, error: fetchError } = await supabase
      .from("entreprises")
      .select("id, user_id")
      .eq("id", entreprise_id)
      .single();

    if (fetchError || !entreprise) {
      throw new Error("Entreprise not found or access denied");
    }

    // Désactiver is_default sur toutes les autres entreprises de l'utilisateur
    const { error: resetError } = await supabase
      .from("entreprises")
      .update({ is_default: false })
      .eq("user_id", entreprise.user_id)
      .neq("id", entreprise_id);

    if (resetError) throw resetError;

    // Activer is_default sur l'entreprise sélectionnée
    const { error: updateError } = await supabase
      .from("entreprises")
      .update({ is_default: true })
      .eq("id", entreprise_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Default entreprise updated successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in sync-entreprise-default:", error);
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
