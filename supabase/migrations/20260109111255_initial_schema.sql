-- ============================================
-- DIGITYX CRM - Initial Schema
-- ============================================

-- ============================================
-- 0. ENTREPRISES (Multi-entités juridiques)
-- ============================================

CREATE TABLE entreprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  forme_juridique TEXT CHECK (forme_juridique IN ('SAS', 'SARL', 'EI', 'EURL', 'Auto-entrepreneur', 'Autre')) NOT NULL,
  siret TEXT,
  tva_intracommunautaire TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  email_facturation TEXT,
  iban TEXT,
  logo_url TEXT,
  couleur TEXT DEFAULT '#3B82F6',
  is_default BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entreprises_user_id ON entreprises(user_id);

ALTER TABLE entreprises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own entreprises" ON entreprises
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 1. CLIENTS
-- ============================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entreprise_id UUID REFERENCES entreprises(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,
  contact_principal TEXT,
  email TEXT,
  telephone TEXT,
  statut TEXT CHECK (statut IN ('Actif', 'Inactif', 'Prospect Chaud', 'Prospect Froid')) DEFAULT 'Prospect Froid',
  satisfaction INTEGER CHECK (satisfaction BETWEEN 1 AND 10),
  potentiel_extension TEXT CHECK (potentiel_extension IN ('Faible', 'Moyen', 'Élevé', 'Très Élevé')),
  potentiel_recommandation TEXT CHECK (potentiel_recommandation IN ('Faible', 'Moyen', 'Élevé', 'Très Élevé')),
  ca_total_genere DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  source_acquisition TEXT CHECK (source_acquisition IN ('Recommandation', 'LinkedIn', 'Site Web', 'Bouche-à-oreille', 'Autre')),
  recommande_par UUID REFERENCES clients(id),
  idees_vente TEXT[] DEFAULT '{}',
  date_dernier_contact TIMESTAMPTZ,
  date_prochain_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_entreprise_id ON clients(entreprise_id);
CREATE INDEX idx_clients_statut ON clients(statut);
CREATE INDEX idx_clients_date_dernier_contact ON clients(date_dernier_contact);
CREATE INDEX idx_clients_deleted_at ON clients(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own active clients" ON clients
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can view own deleted clients" ON clients
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NOT NULL);

CREATE POLICY "Users can insert own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clients" ON clients
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- 2. PROJECTS
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  entreprise_id UUID REFERENCES entreprises(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('Développement', 'Coaching/Formation', 'Audit/Conseil', 'Maintenance', 'Refonte', 'Autre')),
  stack_technique TEXT[] DEFAULT '{}',
  montant_ht DECIMAL(12,2),
  date_debut DATE,
  date_fin_prevue DATE,
  date_fin_reelle DATE,

  -- Statuts financiers
  statut_facturation TEXT CHECK (statut_facturation IN ('Non facturé', 'Facturé', 'Partiellement payé', 'Payé')) DEFAULT 'Non facturé',
  montant_facture DECIMAL(12,2) DEFAULT 0,
  montant_paye DECIMAL(12,2) DEFAULT 0,
  date_facturation DATE,
  date_paiement DATE,

  -- Statut projet
  statut_projet TEXT CHECK (statut_projet IN ('Discussion', 'Proposition envoyée', 'En cours', 'Terminé', 'Annulé', 'En pause')) DEFAULT 'Discussion',
  probabilite_closing INTEGER CHECK (probabilite_closing BETWEEN 0 AND 100),

  -- Opportunités
  extensions_possibles TEXT[] DEFAULT '{}',

  -- Documentation
  documentation_md TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_entreprise_id ON projects(entreprise_id);
CREATE INDEX idx_projects_statut ON projects(statut_projet);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own active projects" ON projects
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- 3. INTERACTIONS
-- ============================================

CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  type TEXT CHECK (type IN ('Email', 'Appel', 'Réunion', 'Check-in', 'Démo', 'Atelier', 'Autre')),
  sujet TEXT,
  notes TEXT,
  actions_suivantes TEXT,
  satisfaction_client INTEGER CHECK (satisfaction_client BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_client_id ON interactions(client_id);
CREATE INDEX idx_interactions_date ON interactions(date DESC);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own interactions" ON interactions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 4. ACTIONS (To-do)
-- ============================================

CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  titre TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('Check-in', 'Proposition commerciale', 'Demande recommandation', 'Relance', 'Contenu', 'Autre')),
  priorite TEXT CHECK (priorite IN ('Basse', 'Moyenne', 'Haute', 'Critique')) DEFAULT 'Moyenne',
  statut TEXT CHECK (statut IN ('À faire', 'En cours', 'Fait', 'Annulée')) DEFAULT 'À faire',
  date_echeance DATE,
  date_completion TIMESTAMPTZ,
  generee_par_ia BOOLEAN DEFAULT FALSE,
  resultat TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_actions_user_id ON actions(user_id);
CREATE INDEX idx_actions_statut ON actions(statut);
CREATE INDEX idx_actions_echeance ON actions(date_echeance);

ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own actions" ON actions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 5. RECOMMANDATIONS
-- ============================================

CREATE TABLE recommandations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_recommandateur_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  prospect_nom TEXT NOT NULL,
  prospect_email TEXT,
  prospect_telephone TEXT,
  date_recommandation TIMESTAMPTZ DEFAULT NOW(),
  type TEXT CHECK (type IN ('Chaude - Introduction directe', 'Tiède - Mention', 'Froide - Simple mention')),
  statut TEXT CHECK (statut IN ('En cours', 'Gagné', 'Perdu', 'En attente')) DEFAULT 'En attente',
  contexte TEXT,
  montant_potentiel DECIMAL(12,2),
  date_conversion TIMESTAMPTZ,
  converti_en_client_id UUID REFERENCES clients(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recommandations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recommandations" ON recommandations
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 6. INSIGHTS_IA
-- ============================================

CREATE TABLE insights_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date_generation TIMESTAMPTZ DEFAULT NOW(),
  type TEXT CHECK (type IN ('Opportunité extension', 'Risque churn', 'Moment recommandation', 'Contact oublié', 'Upsell détecté', 'Tendance identifiée', 'Pipeline faible', 'Facture impayée')),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  titre TEXT NOT NULL,
  description TEXT,
  score_confiance INTEGER CHECK (score_confiance BETWEEN 0 AND 100),
  action_suggeree TEXT,
  statut TEXT CHECK (statut IN ('Nouveau', 'Vu', 'Action créée', 'Ignoré')) DEFAULT 'Nouveau',
  date_action TIMESTAMPTZ,
  action_id UUID REFERENCES actions(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_user_id ON insights_ia(user_id);
CREATE INDEX idx_insights_statut ON insights_ia(statut);
CREATE INDEX idx_insights_type ON insights_ia(type);

ALTER TABLE insights_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own insights" ON insights_ia
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER: updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_entreprises
  BEFORE UPDATE ON entreprises
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_actions
  BEFORE UPDATE ON actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RPC: get_dashboard_metrics
-- ============================================

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
      SELECT SUM(montant_facture)
      FROM projects
      WHERE user_id = p_user_id
        AND (p_entreprise_id IS NULL OR entreprise_id = p_entreprise_id)
        AND statut_facturation IN ('Facturé', 'Payé')
        AND date_facturation >= date_trunc('month', CURRENT_DATE)
        AND deleted_at IS NULL
    ), 0),
    'pipeline', COALESCE((
      SELECT SUM(montant_ht * COALESCE(probabilite_closing, 50) / 100)
      FROM projects
      WHERE user_id = p_user_id
        AND (p_entreprise_id IS NULL OR entreprise_id = p_entreprise_id)
        AND statut_projet IN ('Discussion', 'Proposition envoyée')
        AND deleted_at IS NULL
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
      SELECT SUM(montant_paye)
      FROM projects
      WHERE user_id = p_user_id
        AND (p_entreprise_id IS NULL OR entreprise_id = p_entreprise_id)
        AND statut_facturation = 'Payé'
        AND deleted_at IS NULL
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;
