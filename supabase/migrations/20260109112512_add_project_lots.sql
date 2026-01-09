-- ============================================
-- DIGITYX CRM - Add Project Lots
-- ============================================
-- La facturation se fait au niveau des lots, pas du projet.
-- Le projet devient un conteneur, les lots sont les unités de facturation.

-- ============================================
-- 1. CREATE PROJECT_LOTS TABLE
-- ============================================

CREATE TABLE project_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identification
  nom TEXT NOT NULL,
  description TEXT,
  ordre INTEGER DEFAULT 1,

  -- Financier
  montant_ht DECIMAL(12,2),
  statut_facturation TEXT CHECK (statut_facturation IN ('Non facturé', 'Facturé', 'Partiellement payé', 'Payé')) DEFAULT 'Non facturé',
  montant_facture DECIMAL(12,2) DEFAULT 0,
  montant_paye DECIMAL(12,2) DEFAULT 0,
  date_facturation DATE,
  date_paiement DATE,

  -- Statut livraison
  statut_lot TEXT CHECK (statut_lot IN ('À faire', 'En cours', 'Livré', 'Annulé')) DEFAULT 'À faire',
  date_debut DATE,
  date_fin_prevue DATE,
  date_fin_reelle DATE,

  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_project_lots_project_id ON project_lots(project_id);
CREATE INDEX idx_project_lots_user_id ON project_lots(user_id);
CREATE INDEX idx_project_lots_statut_facturation ON project_lots(statut_facturation);

-- RLS
ALTER TABLE project_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own project_lots" ON project_lots
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_project_lots
  BEFORE UPDATE ON project_lots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. REMOVE BILLING COLUMNS FROM PROJECTS
-- ============================================
-- Ces colonnes sont maintenant sur les lots

ALTER TABLE projects DROP COLUMN IF EXISTS statut_facturation;
ALTER TABLE projects DROP COLUMN IF EXISTS montant_facture;
ALTER TABLE projects DROP COLUMN IF EXISTS montant_paye;
ALTER TABLE projects DROP COLUMN IF EXISTS date_facturation;
ALTER TABLE projects DROP COLUMN IF EXISTS date_paiement;

-- ============================================
-- 3. UPDATE get_dashboard_metrics FUNCTION
-- ============================================
-- Maintenant les métriques viennent des lots

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
    'ca_mois', COALESCE((
      SELECT SUM(pl.montant_facture)
      FROM project_lots pl
      JOIN projects p ON pl.project_id = p.id
      WHERE pl.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pl.statut_facturation IN ('Facturé', 'Payé')
        AND pl.date_facturation >= date_trunc('month', CURRENT_DATE)
    ), 0),
    'pipeline', COALESCE((
      SELECT SUM(p.montant_ht * COALESCE(p.probabilite_closing, 50) / 100)
      FROM projects p
      WHERE p.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND p.statut_projet IN ('Discussion', 'Proposition envoyée')
        AND p.deleted_at IS NULL
    ), 0),
    'clients_actifs', (
      SELECT COUNT(*)
      FROM clients
      WHERE user_id = p_user_id
        AND (p_entreprise_id IS NULL OR entreprise_id = p_entreprise_id)
        AND statut = 'Actif'
        AND deleted_at IS NULL
    ),
    'actions_pending', (
      SELECT COUNT(*)
      FROM actions
      WHERE user_id = p_user_id AND statut IN ('À faire', 'En cours')
    ),
    'nouveaux_insights', (
      SELECT COUNT(*)
      FROM insights_ia
      WHERE user_id = p_user_id AND statut = 'Nouveau'
    ),
    'ca_total', COALESCE((
      SELECT SUM(pl.montant_paye)
      FROM project_lots pl
      JOIN projects p ON pl.project_id = p.id
      WHERE pl.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pl.statut_facturation = 'Payé'
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================
-- 4. HELPER FUNCTION: Get project totals from lots
-- ============================================

CREATE OR REPLACE FUNCTION get_project_totals(p_project_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'montant_total_ht', COALESCE(SUM(montant_ht), 0),
    'montant_total_facture', COALESCE(SUM(montant_facture), 0),
    'montant_total_paye', COALESCE(SUM(montant_paye), 0),
    'nb_lots', COUNT(*),
    'nb_lots_livres', COUNT(*) FILTER (WHERE statut_lot = 'Livré'),
    'nb_lots_payes', COUNT(*) FILTER (WHERE statut_facturation = 'Payé')
  )
  FROM project_lots
  WHERE project_id = p_project_id
  INTO result;

  RETURN result;
END;
$$;
