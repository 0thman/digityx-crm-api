// supabase/functions/update-client-stats/index.ts
// Met à jour les statistiques d'un client (CA total, date dernier contact)
// Appelée après modification d'un projet ou d'une interaction

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UpdateClientStatsRequest {
  client_id: string;
  update_type: "ca" | "contact" | "all";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service role key to bypass RLS for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { client_id, update_type }: UpdateClientStatsRequest =
      await req.json();

    if (!client_id) {
      throw new Error("client_id is required");
    }

    const updates: Record<string, unknown> = {};

    // Recalculer le CA total du client
    // Sources: lots payés (sans échéances) + échéances de lots payées + échéances récurrentes payées
    if (update_type === "ca" || update_type === "all") {
      // Récupérer les projets du client
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", client_id)
        .is("deleted_at", null);

      const projectIds = projects?.map((p) => p.id) || [];

      // 1. CA des lots payés directement (lots sans échéances)
      const { data: lots } = await supabase
        .from("project_lots")
        .select("id, montant_paye, project_id")
        .in("project_id", projectIds)
        .eq("statut_facturation", "Payé");

      // Récupérer les lots qui ont des échéances (pour les exclure du calcul direct)
      const { data: lotEcheances } = await supabase
        .from("project_lot_echeances")
        .select("lot_id")
        .in(
          "lot_id",
          lots?.map((l) => l.id) || []
        );

      const lotsWithEcheances = new Set(lotEcheances?.map((e) => e.lot_id) || []);

      const lotsDirectCA =
        lots
          ?.filter((l) => !lotsWithEcheances.has(l.id))
          .reduce((sum, l) => sum + (l.montant_paye || 0), 0) || 0;

      // 2. CA des échéances de lots payées
      const { data: allLots } = await supabase
        .from("project_lots")
        .select("id")
        .in("project_id", projectIds);

      const allLotIds = allLots?.map((l) => l.id) || [];

      const { data: paidLotEcheances } = await supabase
        .from("project_lot_echeances")
        .select("montant_ht")
        .in("lot_id", allLotIds)
        .eq("statut_facturation", "Payé");

      const lotEcheancesCA =
        paidLotEcheances?.reduce((sum, e) => sum + (e.montant_ht || 0), 0) || 0;

      // 3. CA des échéances récurrentes payées
      const { data: recurrents } = await supabase
        .from("project_recurrents")
        .select("id")
        .in("project_id", projectIds);

      const recurrentIds = recurrents?.map((r) => r.id) || [];

      const { data: paidRecurrentEcheances } = await supabase
        .from("project_recurrent_echeances")
        .select("montant_ht")
        .in("recurrent_id", recurrentIds)
        .eq("statut_facturation", "Payé");

      const recurrentCA =
        paidRecurrentEcheances?.reduce((sum, e) => sum + (e.montant_ht || 0), 0) || 0;

      updates.ca_total_genere = lotsDirectCA + lotEcheancesCA + recurrentCA;
    }

    // Mettre à jour la date du dernier contact
    if (update_type === "contact" || update_type === "all") {
      const { data: lastInteraction } = await supabase
        .from("interactions")
        .select("date")
        .eq("client_id", client_id)
        .order("date", { ascending: false })
        .limit(1)
        .single();

      if (lastInteraction) {
        updates.date_dernier_contact = lastInteraction.date;
      }
    }

    // Appliquer les mises à jour
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", client_id);

      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true, updates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in update-client-stats:", error);
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
