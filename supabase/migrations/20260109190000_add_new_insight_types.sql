-- Migration: Ajout de nouveaux types d'insights IA
-- Types actuels: 'Opportunité extension', 'Risque churn', 'Moment recommandation',
--                'Contact oublié', 'Upsell détecté', 'Tendance identifiée',
--                'Pipeline faible', 'Facture impayée'
-- Nouveaux types: 'Timing upsell', 'Stratégie contenu', 'Amélioration process', 'Optimisation pricing'

-- Supprimer l'ancien CHECK constraint
ALTER TABLE insights_ia DROP CONSTRAINT IF EXISTS insights_ia_type_check;

-- Ajouter le nouveau CHECK constraint avec tous les types
ALTER TABLE insights_ia ADD CONSTRAINT insights_ia_type_check CHECK (
  type IN (
    -- Types existants
    'Opportunité extension',
    'Risque churn',
    'Moment recommandation',
    'Contact oublié',
    'Upsell détecté',
    'Tendance identifiée',
    'Pipeline faible',
    'Facture impayée',
    -- Nouveaux types IA
    'Timing upsell',
    'Stratégie contenu',
    'Amélioration process',
    'Optimisation pricing'
  )
);

-- Index supplémentaire pour les insights globaux (sans client_id)
CREATE INDEX IF NOT EXISTS idx_insights_global ON insights_ia(user_id, type) WHERE client_id IS NULL;
