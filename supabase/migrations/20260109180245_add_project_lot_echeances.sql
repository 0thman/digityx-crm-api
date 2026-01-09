-- ============================================
-- DIGITYX CRM - Add Project Lot Echeances
-- ============================================
-- Gestion des paiements echelonnes pour les lots
-- (ex: 3x30% + 10% garantie apres livraison)

-- ============================================
-- 1. PROJECT_LOT_ECHEANCES
-- ============================================

CREATE TABLE project_lot_echeances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES project_lots(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identification
  label TEXT NOT NULL,                    -- ex: "Acompte 30%", "Solde garantie"
  ordre INTEGER DEFAULT 1,

  -- Montant
  montant_ht DECIMAL(12,2) NOT NULL,

  -- Dates
  date_echeance DATE NOT NULL,            -- Date d'echeance prevue (manuelle)

  -- Facturation
  statut_facturation TEXT CHECK (statut_facturation IN ('Non facturé', 'Facturé', 'Payé')) DEFAULT 'Non facturé',
  date_facturation DATE,
  date_paiement DATE,

  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_lot_echeances_lot_id ON project_lot_echeances(lot_id);
CREATE INDEX idx_lot_echeances_user_id ON project_lot_echeances(user_id);
CREATE INDEX idx_lot_echeances_date_echeance ON project_lot_echeances(date_echeance);
CREATE INDEX idx_lot_echeances_statut ON project_lot_echeances(statut_facturation);

-- RLS
ALTER TABLE project_lot_echeances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own lot_echeances" ON project_lot_echeances
  FOR ALL USING ((SELECT auth.uid()) = user_id);
