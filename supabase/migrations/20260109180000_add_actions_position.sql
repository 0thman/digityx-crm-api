-- ============================================
-- Add position column to actions table for drag & drop ordering
-- ============================================

-- Add position column (nullable to not break existing data)
ALTER TABLE actions ADD COLUMN position INTEGER;

-- Create index for faster ordering
CREATE INDEX idx_actions_position ON actions(user_id, position);

-- Initialize positions for existing actions based on date_echeance order
WITH ranked_actions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date_echeance ASC NULLS LAST, created_at ASC) as pos
  FROM actions
)
UPDATE actions
SET position = ranked_actions.pos
FROM ranked_actions
WHERE actions.id = ranked_actions.id;
