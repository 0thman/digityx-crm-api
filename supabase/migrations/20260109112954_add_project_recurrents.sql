-- ============================================
-- DIGITYX CRM - Add Project Recurrents
-- ============================================
-- Gestion des coûts récurrents (infogérance, maintenance)
-- avec suivi de chaque échéance

-- ============================================
-- 1. PROJECT_RECURRENTS (le contrat récurrent)
-- ============================================

CREATE TABLE project_recurrents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Détails
  nom TEXT NOT NULL DEFAULT 'Infogérance & Maintenance',
  description TEXT,
  montant_ht DECIMAL(12,2) NOT NULL,
  frequence TEXT CHECK (frequence IN ('Mensuel', 'Trimestriel', 'Annuel')) DEFAULT 'Mensuel',

  -- Statut
  statut TEXT CHECK (statut IN ('Actif', 'En pause', 'Résilié')) DEFAULT 'Actif',
  date_debut DATE NOT NULL,
  date_fin DATE,  -- NULL = en cours

  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_project_recurrents_project_id ON project_recurrents(project_id);
CREATE INDEX idx_project_recurrents_user_id ON project_recurrents(user_id);
CREATE INDEX idx_project_recurrents_statut ON project_recurrents(statut);

-- RLS
ALTER TABLE project_recurrents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own project_recurrents" ON project_recurrents
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_project_recurrents
  BEFORE UPDATE ON project_recurrents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. PROJECT_RECURRENT_ECHEANCES (chaque échéance)
-- ============================================

CREATE TABLE project_recurrent_echeances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrent_id UUID REFERENCES project_recurrents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Période
  periode_debut DATE NOT NULL,  -- ex: 2026-01-01
  periode_fin DATE NOT NULL,    -- ex: 2026-01-31
  label TEXT,                   -- ex: "Janvier 2026" (généré ou custom)

  -- Facturation
  montant_ht DECIMAL(12,2) NOT NULL,
  statut_facturation TEXT CHECK (statut_facturation IN ('Non facturé', 'Facturé', 'Payé')) DEFAULT 'Non facturé',
  date_facturation DATE,
  date_paiement DATE,

  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_recurrent_echeances_recurrent_id ON project_recurrent_echeances(recurrent_id);
CREATE INDEX idx_recurrent_echeances_user_id ON project_recurrent_echeances(user_id);
CREATE INDEX idx_recurrent_echeances_periode ON project_recurrent_echeances(periode_debut);
CREATE INDEX idx_recurrent_echeances_statut ON project_recurrent_echeances(statut_facturation);

-- RLS
ALTER TABLE project_recurrent_echeances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own echeances" ON project_recurrent_echeances
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. UPDATE get_dashboard_metrics
-- ============================================
-- Ajoute le MRR (Monthly Recurring Revenue) aux métriques

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
    -- CA du mois (lots facturés ce mois)
    'ca_mois', COALESCE((
      SELECT SUM(pl.montant_facture)
      FROM project_lots pl
      JOIN projects p ON pl.project_id = p.id
      WHERE pl.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pl.statut_facturation IN ('Facturé', 'Payé')
        AND pl.date_facturation >= date_trunc('month', CURRENT_DATE)
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

    -- CA total (lots payés)
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
        CASE frequence
          WHEN 'Mensuel' THEN montant_ht
          WHEN 'Trimestriel' THEN montant_ht / 3
          WHEN 'Annuel' THEN montant_ht / 12
        END
      )
      FROM project_recurrents pr
      JOIN projects p ON pr.project_id = p.id
      WHERE pr.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pr.statut = 'Actif'
    ), 0),

    -- Récurrent du mois (échéances payées ce mois)
    'recurrent_mois', COALESCE((
      SELECT SUM(pre.montant_ht)
      FROM project_recurrent_echeances pre
      JOIN project_recurrents pr ON pre.recurrent_id = pr.id
      JOIN projects p ON pr.project_id = p.id
      WHERE pre.user_id = p_user_id
        AND (p_entreprise_id IS NULL OR p.entreprise_id = p_entreprise_id)
        AND pre.statut_facturation = 'Payé'
        AND pre.date_paiement >= date_trunc('month', CURRENT_DATE)
    ), 0)

  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================
-- 4. HELPER: Generate monthly echeances
-- ============================================
-- Fonction pour générer les échéances d'un contrat récurrent

CREATE OR REPLACE FUNCTION generate_echeances(
  p_recurrent_id UUID,
  p_until_date DATE DEFAULT (CURRENT_DATE + INTERVAL '3 months')::DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recurrent project_recurrents%ROWTYPE;
  v_current_date DATE;
  v_period_end DATE;
  v_interval INTERVAL;
  v_label TEXT;
  v_count INTEGER := 0;
BEGIN
  -- Get recurrent details
  SELECT * INTO v_recurrent FROM project_recurrents WHERE id = p_recurrent_id;

  IF v_recurrent IS NULL THEN
    RETURN 0;
  END IF;

  -- Determine interval based on frequency
  v_interval := CASE v_recurrent.frequence
    WHEN 'Mensuel' THEN INTERVAL '1 month'
    WHEN 'Trimestriel' THEN INTERVAL '3 months'
    WHEN 'Annuel' THEN INTERVAL '1 year'
  END;

  -- Start from date_debut, aligned to month start
  v_current_date := date_trunc('month', v_recurrent.date_debut)::DATE;

  -- Generate echeances until p_until_date
  WHILE v_current_date <= p_until_date LOOP
    -- Calculate period end
    v_period_end := (v_current_date + v_interval - INTERVAL '1 day')::DATE;

    -- Generate label (e.g., "Janvier 2026")
    v_label := to_char(v_current_date, 'TMMonth YYYY');

    -- Insert if not exists
    INSERT INTO project_recurrent_echeances (
      recurrent_id, user_id, periode_debut, periode_fin, label, montant_ht
    )
    SELECT
      p_recurrent_id,
      v_recurrent.user_id,
      v_current_date,
      v_period_end,
      v_label,
      v_recurrent.montant_ht
    WHERE NOT EXISTS (
      SELECT 1 FROM project_recurrent_echeances
      WHERE recurrent_id = p_recurrent_id AND periode_debut = v_current_date
    );

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;

    -- Move to next period
    v_current_date := (v_current_date + v_interval)::DATE;
  END LOOP;

  RETURN v_count;
END;
$$;
