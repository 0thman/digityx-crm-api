-- Fix: Allow deleting actions that are referenced by insights
-- When an action is deleted, set action_id to NULL in insights_ia (insight is preserved)

-- Drop the existing foreign key constraint
ALTER TABLE insights_ia DROP CONSTRAINT IF EXISTS insights_ia_action_id_fkey;

-- Re-add the constraint with ON DELETE SET NULL
ALTER TABLE insights_ia
  ADD CONSTRAINT insights_ia_action_id_fkey
  FOREIGN KEY (action_id)
  REFERENCES actions(id)
  ON DELETE SET NULL;
