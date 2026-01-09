-- Migration: Ajout des projets internes (SaaS, Apps mobiles)
-- Permet de créer des projets sans client associé

-- Rendre client_id nullable pour les projets internes
ALTER TABLE projects
  ALTER COLUMN client_id DROP NOT NULL;

-- Index partiel pour filtrer efficacement les projets internes
CREATE INDEX idx_projects_internal ON projects(user_id, entreprise_id)
  WHERE client_id IS NULL AND deleted_at IS NULL;

-- Commentaire explicatif
COMMENT ON COLUMN projects.client_id IS 'NULL pour les projets internes (SaaS, apps), UUID pour les projets clients';
