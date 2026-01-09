-- ============================================
-- Fix: Use periode_fin as fallback for date_paiement
-- ============================================
-- When date_paiement is NULL, use periode_fin to determine the payment month
-- This ensures recurring payments are correctly counted even if date_paiement is not set

CREATE OR REPLACE FUNCTION get_dashboard_metrics(p_user_id UUID, p_entreprise_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- CA du mois (lots payés ce mois)
    'ca_mois', COALESCE((
      SELECT SUM(pl.montant_paye)
      FROM project_lots pl
      JOIN projects p ON pl.project_id = p.id
      WHERE pl.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pl.statut_facturation IN ('Facturé', 'Payé')
        AND pl.date_paiement >= date_trunc('month', CURRENT_DATE)
    ), 0),

    -- Pipeline (projets en discussion/proposition)
    'pipeline', COALESCE((
      SELECT SUM(p.montant_ht * COALESCE(p.probabilite_closing, 50) / 100)
      FROM projects p
      WHERE p.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND p.statut_projet IN ('Discussion', 'Proposition envoyée')
        AND p.deleted_at IS NULL
    ), 0),

    -- Clients actifs
    'clients_actifs', (
      SELECT COUNT(*)
      FROM clients
      WHERE user_id = p_user_id
        AND (p_entreprise_id IS NULL OR entreprise_id = p_entreprise_id)
        AND statut = 'Actif'
        AND deleted_at IS NULL
    ),

    -- Actions en attente
    'actions_pending', (
      SELECT COUNT(*)
      FROM actions
      WHERE user_id = p_user_id AND statut IN ('À faire', 'En cours')
    ),

    -- Nouveaux insights
    'nouveaux_insights', (
      SELECT COUNT(*)
      FROM insights_ia
      WHERE user_id = p_user_id AND statut = 'Nouveau'
    ),

    -- CA total (lots payés - all time)
    'ca_total', COALESCE((
      SELECT SUM(pl.montant_paye)
      FROM project_lots pl
      JOIN projects p ON pl.project_id = p.id
      WHERE pl.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pl.statut_facturation = 'Payé'
    ), 0),

    -- MRR (Monthly Recurring Revenue) - contrats actifs
    'mrr', COALESCE((
      SELECT SUM(
        CASE pr.frequence
          WHEN 'Mensuel' THEN pr.montant_ht
          WHEN 'Trimestriel' THEN pr.montant_ht / 3
          WHEN 'Annuel' THEN pr.montant_ht / 12
        END
      )
      FROM project_recurrents pr
      JOIN projects p ON pr.project_id = p.id
      WHERE pr.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pr.statut = 'Actif'
    ), 0),

    -- Récurrent du mois (échéances payées ce mois)
    -- Uses COALESCE(date_paiement, periode_fin) as fallback
    'recurrent_mois', COALESCE((
      SELECT SUM(pre.montant_ht)
      FROM project_recurrent_echeances pre
      JOIN project_recurrents pr ON pre.recurrent_id = pr.id
      JOIN projects p ON pr.project_id = p.id
      WHERE pre.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pre.statut_facturation = 'Payé'
        AND COALESCE(pre.date_paiement, pre.periode_fin) >= date_trunc('month', CURRENT_DATE)
    ), 0),

    -- Récurrents en retard - count
    'recurrents_en_retard_count', (
      SELECT COUNT(*)
      FROM project_recurrent_echeances pre
      JOIN project_recurrents pr ON pre.recurrent_id = pr.id
      JOIN projects p ON pr.project_id = p.id
      WHERE pre.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pre.statut_facturation != 'Payé'
        AND pre.periode_fin < CURRENT_DATE
    ),

    -- Récurrents en retard - montant total
    'recurrents_en_retard_montant', COALESCE((
      SELECT SUM(pre.montant_ht)
      FROM project_recurrent_echeances pre
      JOIN project_recurrents pr ON pre.recurrent_id = pr.id
      JOIN projects p ON pr.project_id = p.id
      WHERE pre.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pre.statut_facturation != 'Payé'
        AND pre.periode_fin < CURRENT_DATE
    ), 0)

  ) INTO result;

  RETURN result;
END;
$$;
