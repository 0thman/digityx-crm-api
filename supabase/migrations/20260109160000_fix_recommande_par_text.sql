-- Migration: Changer recommande_par de UUID à TEXT
-- Permet de saisir du texte libre comme "Manu (fondateur)" au lieu d'un ID client

-- Supprimer la contrainte de clé étrangère et changer le type
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_recommande_par_fkey;

ALTER TABLE clients
  ALTER COLUMN recommande_par TYPE TEXT;
