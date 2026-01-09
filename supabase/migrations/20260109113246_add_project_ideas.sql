-- ============================================
-- DIGITYX CRM - Add Project Ideas
-- ============================================
-- Idées de vente / améliorations à proposer aux clients
-- Utilisées pour roadmaps et génération de propositions IA

CREATE TABLE project_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  lot_id UUID REFERENCES project_lots(id) ON DELETE SET NULL,  -- Optionnel: lié à un lot spécifique
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contenu
  titre TEXT NOT NULL,
  description TEXT,

  -- Estimation
  estimation_montant DECIMAL(12,2),
  estimation_jours DECIMAL(5,1),  -- ex: 2.5 jours

  -- Catégorisation
  categorie TEXT CHECK (categorie IN (
    'Performance',
    'UX/UI',
    'Sécurité',
    'IA/Automatisation',
    'Nouvelle fonctionnalité',
    'Refactoring',
    'Intégration',
    'Mobile',
    'Autre'
  )),
  tags TEXT[] DEFAULT '{}',

  -- Priorisation
  priorite TEXT CHECK (priorite IN ('Basse', 'Moyenne', 'Haute')) DEFAULT 'Moyenne',
  impact_client TEXT CHECK (impact_client IN ('Faible', 'Moyen', 'Fort')) DEFAULT 'Moyen',

  -- Statut
  statut TEXT CHECK (statut IN (
    'Idée',           -- Juste notée
    'À proposer',     -- Prête à être proposée
    'Proposé',        -- Proposition envoyée
    'Vendu',          -- Client a accepté
    'Rejeté',         -- Client a refusé
    'Reporté'         -- À reproposer plus tard
  )) DEFAULT 'Idée',

  -- Suivi
  date_proposition DATE,
  date_decision DATE,
  projet_cree_id UUID REFERENCES projects(id),  -- Si vendu, lien vers le nouveau projet créé

  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_project_ideas_project_id ON project_ideas(project_id);
CREATE INDEX idx_project_ideas_lot_id ON project_ideas(lot_id);
CREATE INDEX idx_project_ideas_user_id ON project_ideas(user_id);
CREATE INDEX idx_project_ideas_statut ON project_ideas(statut);
CREATE INDEX idx_project_ideas_categorie ON project_ideas(categorie);

-- RLS
ALTER TABLE project_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own project_ideas" ON project_ideas
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_project_ideas
  BEFORE UPDATE ON project_ideas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER: Get all ideas for a project (for AI context)
-- ============================================

CREATE OR REPLACE FUNCTION get_project_ideas_for_ai(p_project_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'titre', titre,
      'description', description,
      'categorie', categorie,
      'estimation_montant', estimation_montant,
      'priorite', priorite,
      'impact_client', impact_client,
      'lot_nom', pl.nom,
      'tags', tags
    ) ORDER BY
      CASE priorite WHEN 'Haute' THEN 1 WHEN 'Moyenne' THEN 2 ELSE 3 END,
      CASE impact_client WHEN 'Fort' THEN 1 WHEN 'Moyen' THEN 2 ELSE 3 END
  )
  FROM project_ideas pi
  LEFT JOIN project_lots pl ON pi.lot_id = pl.id
  WHERE pi.project_id = p_project_id
    AND pi.statut IN ('Idée', 'À proposer')
  INTO result;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$;

-- ============================================
-- HELPER: Get ideas stats per project
-- ============================================

CREATE OR REPLACE FUNCTION get_project_ideas_stats(p_project_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'a_proposer', COUNT(*) FILTER (WHERE statut IN ('Idée', 'À proposer')),
    'proposes', COUNT(*) FILTER (WHERE statut = 'Proposé'),
    'vendus', COUNT(*) FILTER (WHERE statut = 'Vendu'),
    'potentiel_total', COALESCE(SUM(estimation_montant) FILTER (WHERE statut IN ('Idée', 'À proposer')), 0),
    'vendu_total', COALESCE(SUM(estimation_montant) FILTER (WHERE statut = 'Vendu'), 0)
  )
  FROM project_ideas
  WHERE project_id = p_project_id
  INTO result;

  RETURN result;
END;
$$;
