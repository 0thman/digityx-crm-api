-- ============================================
-- DIGITYX CRM - Seed Data
-- ============================================

-- ============================================
-- UTILISATEUR (Auth)
-- ============================================
-- Email: othman.chaouachi@gmail.com
-- Password: Digityx2025!

-- Activer pgcrypto pour le hachage du mot de passe
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'othman.chaouachi@gmail.com',
  crypt('Digityx2025!', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Othman Chaouachi"}',
  'authenticated',
  'authenticated',
  FALSE,
  '',
  '',
  '',
  ''
);

INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'othman.chaouachi@gmail.com',
  'email',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'othman.chaouachi@gmail.com',
    'email_verified', true,
    'provider', 'email'
  ),
  NOW(),
  NOW(),
  NOW()
);

-- ============================================
-- ENTREPRISES
-- ============================================

-- Entreprise 1: DIGITYX STUDIOS (SAS)
INSERT INTO entreprises (
  id,
  user_id,
  nom,
  forme_juridique,
  siret,
  tva_intracommunautaire,
  adresse,
  code_postal,
  ville,
  is_default,
  notes
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'DIGITYX STUDIOS',
  'SAS',
  '99062868700016',
  'FR73990628687',
  '53 RUE DE MONTREUIL',
  '75011',
  'PARIS',
  TRUE,
  'SIREN: 990 628 687 | Date création: 26 août 2025 | Activité: Programmation informatique (6201Z) | Dirigeant: Othman CHAOUACHI'
);

-- Entreprise 2: MONSIEUR OTHMAN CHAOUACHI (EI - Entreprise Individuelle)
INSERT INTO entreprises (
  id,
  user_id,
  nom,
  forme_juridique,
  siret,
  tva_intracommunautaire,
  adresse,
  code_postal,
  ville,
  is_default,
  notes
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000001',
  'MONSIEUR OTHMAN CHAOUACHI',
  'EI',
  '98840387900014',
  NULL,
  '53 Rue de Montreuil',
  '75011',
  'Paris',
  FALSE,
  'Nom commercial: Digityx Studios | Date immatriculation: 23 juin 2025 | Activité: Programmation informatique (6201Z)'
);

-- ============================================
-- CLIENTS
-- ============================================

-- Client 1: HOXON
INSERT INTO clients (
  id,
  user_id,
  entreprise_id,
  nom,
  statut,
  notes
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'HOXON',
  'Actif',
  'Adresse: 58 RUE DE MONCEAU, 75008 PARIS, FRANCE | SIRET: 933 222 309 00017'
);

-- Client 2: SOGME
INSERT INTO clients (
  id,
  user_id,
  entreprise_id,
  nom,
  statut,
  notes
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'SOGME',
  'Actif',
  'Adresse: 66 AVENUE DES CHAMPS ELYSEES, 75008 PARIS, FRANCE | SIRET: 941 713 372 00014 | TVA: FR93941713372'
);

-- Client 3: G.A.U.M. GEB ADOPTAGUY
INSERT INTO clients (
  id,
  user_id,
  entreprise_id,
  nom,
  statut,
  notes
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'G.A.U.M. GEB ADOPTAGUY',
  'Actif',
  'Adresse: 10 PLACE VENDOME, 75001 PARIS, FRANCE | SIRET: 514 739 937 00043'
);

-- Client 4: UMA
INSERT INTO clients (
  id,
  user_id,
  entreprise_id,
  nom,
  statut,
  notes
) VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'UMA',
  'Actif',
  'Adresse: 19 RUE DE MIROMESNIL, 75008 PARIS, FRANCE | SIRET: 533 843 967 00043'
);

-- ============================================
-- PROJECTS
-- ============================================

-- Projet 1: Plateforme Hoxon (HOXON)
INSERT INTO projects (
  id,
  user_id,
  client_id,
  entreprise_id,
  nom,
  description,
  type,
  statut_projet
) VALUES (
  '5b8d54eb-a2da-4427-bbdf-c7bae7648b94',
  '00000000-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Plateforme Hoxon',
  NULL,
  'Développement',
  'En cours'
);

-- Projet 2: Conseil en IA (G.A.U.M.)
INSERT INTO projects (
  id,
  user_id,
  client_id,
  entreprise_id,
  nom,
  description,
  type,
  date_debut,
  statut_projet
) VALUES (
  '1183eced-851b-453d-9bbd-db6d1072904f',
  '00000000-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'Conseil en IA',
  E'- Programme de formation inter-équipes\n- Accompagnement technique développeurs\n- Architecture et déploiement d''outils IA\n- Documentation et support',
  'Audit/Conseil',
  '2025-12-09',
  'En cours'
);

-- Projet 3: UMA Social Food (UMA)
INSERT INTO projects (
  id,
  user_id,
  client_id,
  entreprise_id,
  nom,
  description,
  type,
  montant_ht,
  date_debut,
  date_fin_prevue,
  statut_projet
) VALUES (
  '1eb17552-c13c-4ece-ac2d-b655bb8f453d',
  '00000000-0000-0000-0000-000000000001',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '11111111-1111-1111-1111-111111111111',
  'UMA Social Food',
  'UMA & UMA Business',
  'Développement',
  39000.00,
  '2026-01-01',
  '2026-03-14',
  'Discussion'
);

-- Projet 4: Plateforme Sogme (SOGME)
INSERT INTO projects (
  id,
  user_id,
  client_id,
  entreprise_id,
  nom,
  description,
  type,
  statut_projet
) VALUES (
  '2d0fbcb2-a5ad-49a9-b15d-862e2ab38210',
  '00000000-0000-0000-0000-000000000001',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'Plateforme Sogme',
  'Sogme client, Sogme Pro et Sogme admin',
  'Développement',
  'En cours'
);

-- ============================================
-- PROJECT LOTS (Facturation par lots)
-- ============================================

-- Lot 1: Phase 1 du projet Conseil en IA (Payé)
INSERT INTO project_lots (
  id,
  project_id,
  user_id,
  nom,
  description,
  ordre,
  montant_ht,
  statut_facturation,
  montant_facture,
  montant_paye,
  date_facturation,
  date_paiement,
  statut_lot,
  date_debut,
  date_fin_prevue
) VALUES (
  'd0dd771c-a816-41fe-b6f6-7af198e14629',
  '1183eced-851b-453d-9bbd-db6d1072904f',
  '00000000-0000-0000-0000-000000000001',
  'Phase 1',
  E'- Programme de formation inter-équipes\n- Accompagnement technique développeurs\n- Architecture et déploiement d''outils IA\n- Documentation et support',
  1,
  10400.00,
  'Payé',
  10400.00,
  10400.00,
  '2026-01-02',
  '2026-01-05',
  'Livré',
  '2025-12-09',
  '2026-01-02'
);

-- Lot 2: Phase 2 du projet Conseil en IA
INSERT INTO project_lots (
  id,
  project_id,
  user_id,
  nom,
  description,
  ordre,
  montant_ht,
  statut_facturation,
  statut_lot,
  date_debut
) VALUES (
  '0eb56f7f-d389-496f-871d-1b8da9125c28',
  '1183eced-851b-453d-9bbd-db6d1072904f',
  '00000000-0000-0000-0000-000000000001',
  'Phase 2',
  'TBD',
  2,
  NULL,
  'Non facturé',
  'À faire',
  '2026-01-05'
);

-- ============================================
-- PROJECT RECURRENTS (Contrats récurrents)
-- ============================================

-- Récurrent 1: Infogérance Hoxon (500€/mois)
INSERT INTO project_recurrents (
  id,
  project_id,
  user_id,
  nom,
  description,
  montant_ht,
  frequence,
  statut,
  date_debut
) VALUES (
  '0350b018-f6c6-47ad-b115-0ed1d560c286',
  '5b8d54eb-a2da-4427-bbdf-c7bae7648b94',
  '00000000-0000-0000-0000-000000000001',
  'Développement et infogérance mensuelle',
  NULL,
  500.00,
  'Mensuel',
  'Actif',
  '2026-01-09'
);

-- Récurrent 2: Infogérance Sogme (580€/mois)
INSERT INTO project_recurrents (
  id,
  project_id,
  user_id,
  nom,
  description,
  montant_ht,
  frequence,
  statut,
  date_debut
) VALUES (
  '27b3e80f-10e4-4ae8-8e5d-58e2285259e7',
  '2d0fbcb2-a5ad-49a9-b15d-862e2ab38210',
  '00000000-0000-0000-0000-000000000001',
  'Inforgerance et maintenance applicative',
  E'Pour les deux applications SOGME Client et SOGME Pro\n- Infrastructure & Backend : Base de données PostgreSQL, authentification, Edge Functions, stockage fichiers et temps réel.\n- Envoi d''emails transactionnels (notifications réservations, validation agences, etc)\n- Notifications push pour les applications mobiles (Pro et Client)\n- Hébergement des apps (Sogme client, Pro, Admin et Website)',
  580.00,
  'Mensuel',
  'Actif',
  '2026-01-01'
);

-- Récurrent 3: Infogérance UMA (290€/mois)
INSERT INTO project_recurrents (
  id,
  project_id,
  user_id,
  nom,
  description,
  montant_ht,
  frequence,
  statut,
  date_debut
) VALUES (
  '0e6d3971-b4a3-4dc2-a4a2-3a23dc6e4178',
  '1eb17552-c13c-4ece-ac2d-b655bb8f453d',
  '00000000-0000-0000-0000-000000000001',
  'Inforgerance et maintenance applicative',
  E'- Infrastructure & Backend : Base de données PostgreSQL, authentification, Edge Functions, stockage fichiers et temps réel.\n- Envoi d''emails transactionnels (notifications réservations, validation agences, etc)\n- Notifications push pour les applications mobiles (Pro et Client)\n- Hébergement des apps (Sogme client, Pro, Admin et Website)',
  290.00,
  'Mensuel',
  'Actif',
  '2026-01-01'
);

-- ============================================
-- PROJECT IDEAS (Idées d'amélioration/upsell)
-- ============================================

-- Idée 1: App mobile pour Hoxon
INSERT INTO project_ideas (
  id,
  project_id,
  user_id,
  titre,
  description,
  estimation_montant,
  estimation_jours,
  categorie,
  priorite,
  impact_client,
  statut
) VALUES (
  '86126b65-5dc1-4200-8477-138f00ffb23c',
  '5b8d54eb-a2da-4427-bbdf-c7bae7648b94',
  '00000000-0000-0000-0000-000000000001',
  'app mobile',
  'Vendre une application mobile qui va se baser sur la nouvelle API que j''ai développée.',
  30000.00,
  90.0,
  'Mobile',
  'Moyenne',
  'Fort',
  'Idée'
);

-- ============================================
-- INTERACTIONS
-- ============================================

-- Interaction 1: Check-in G.A.U.M. sur les tests automatisés
INSERT INTO interactions (
  id,
  user_id,
  client_id,
  project_id,
  date,
  type,
  sujet,
  notes,
  actions_suivantes
) VALUES (
  'e5c6daf3-69c2-468d-99f5-3cc8d6437de4',
  '00000000-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  NULL,
  '2026-01-09',
  'Check-in',
  'Tests automatisés',
  'Permettre au testeur d''écrire lui-même des tests',
  'Donner accès à Claude Code au testeur et cadrer son écriture de test.'
);
