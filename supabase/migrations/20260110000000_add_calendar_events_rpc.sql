-- Function to get all calendar events for a user/entreprise
CREATE OR REPLACE FUNCTION get_calendar_events(
  p_user_id UUID,
  p_entreprise_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  event_type TEXT,
  source_id UUID,
  title TEXT,
  description TEXT,
  event_date DATE,
  event_end_date DATE,
  all_day BOOLEAN,
  client_id UUID,
  client_name TEXT,
  project_id UUID,
  project_name TEXT,
  priority TEXT,
  status TEXT,
  amount NUMERIC,
  is_paid BOOLEAN
) AS $$
BEGIN
  RETURN QUERY

  -- Actions with date_echeance
  SELECT
    'action'::TEXT as event_type,
    a.id as source_id,
    a.titre as title,
    a.description,
    a.date_echeance::DATE as event_date,
    a.date_echeance::DATE as event_end_date,
    TRUE as all_day,
    a.client_id,
    c.nom as client_name,
    a.project_id,
    p.nom as project_name,
    a.priorite::TEXT as priority,
    a.statut::TEXT as status,
    NULL::NUMERIC as amount,
    NULL::BOOLEAN as is_paid
  FROM actions a
  LEFT JOIN clients c ON c.id = a.client_id
  LEFT JOIN projects p ON p.id = a.project_id
  WHERE a.user_id = p_user_id
    AND a.date_echeance IS NOT NULL
    AND a.statut NOT IN ('Fait', 'Annulée')
    AND (p_entreprise_id IS NULL OR
         c.entreprise_id = p_entreprise_id OR
         p.entreprise_id = p_entreprise_id OR
         (c.id IS NULL AND p.id IS NULL))
    AND (p_start_date IS NULL OR a.date_echeance >= p_start_date)
    AND (p_end_date IS NULL OR a.date_echeance <= p_end_date)

  UNION ALL

  -- Interactions
  SELECT
    'interaction'::TEXT,
    i.id,
    COALESCE(i.type::TEXT || ': ', '') || COALESCE(i.sujet, 'Interaction'),
    i.notes,
    i.date::DATE,
    i.date::DATE,
    TRUE,
    i.client_id,
    c.nom,
    i.project_id,
    p.nom,
    NULL,
    NULL,
    NULL,
    NULL
  FROM interactions i
  JOIN clients c ON c.id = i.client_id
  LEFT JOIN projects p ON p.id = i.project_id
  WHERE i.user_id = p_user_id
    AND c.deleted_at IS NULL
    AND (p_entreprise_id IS NULL OR c.entreprise_id = p_entreprise_id)
    AND (p_start_date IS NULL OR i.date::DATE >= p_start_date)
    AND (p_end_date IS NULL OR i.date::DATE <= p_end_date)

  UNION ALL

  -- Project milestones (date_fin_prevue)
  SELECT
    'project'::TEXT,
    pr.id,
    'Deadline: ' || pr.nom,
    pr.description,
    pr.date_fin_prevue::DATE,
    pr.date_fin_prevue::DATE,
    TRUE,
    pr.client_id,
    c.nom,
    pr.id,
    pr.nom,
    NULL,
    pr.statut_projet::TEXT,
    pr.montant_ht,
    NULL
  FROM projects pr
  LEFT JOIN clients c ON c.id = pr.client_id
  WHERE pr.user_id = p_user_id
    AND pr.date_fin_prevue IS NOT NULL
    AND pr.deleted_at IS NULL
    AND pr.statut_projet NOT IN ('Terminé', 'Annulé')
    AND (c.deleted_at IS NULL OR c.id IS NULL)
    AND (p_entreprise_id IS NULL OR pr.entreprise_id = p_entreprise_id)
    AND (p_start_date IS NULL OR pr.date_fin_prevue >= p_start_date)
    AND (p_end_date IS NULL OR pr.date_fin_prevue <= p_end_date)

  UNION ALL

  -- Lot deliverables (date_fin_prevue)
  SELECT
    'lot'::TEXT,
    l.id,
    'Livraison: ' || l.nom,
    l.description,
    l.date_fin_prevue::DATE,
    l.date_fin_prevue::DATE,
    TRUE,
    pr.client_id,
    c.nom,
    l.project_id,
    pr.nom,
    NULL,
    l.statut_lot::TEXT,
    l.montant_ht,
    NULL
  FROM project_lots l
  JOIN projects pr ON pr.id = l.project_id
  LEFT JOIN clients c ON c.id = pr.client_id
  WHERE l.user_id = p_user_id
    AND l.date_fin_prevue IS NOT NULL
    AND l.statut_lot NOT IN ('Livré', 'Annulé')
    AND pr.deleted_at IS NULL
    AND (c.deleted_at IS NULL OR c.id IS NULL)
    AND (p_entreprise_id IS NULL OR pr.entreprise_id = p_entreprise_id)
    AND (p_start_date IS NULL OR l.date_fin_prevue >= p_start_date)
    AND (p_end_date IS NULL OR l.date_fin_prevue <= p_end_date)

  UNION ALL

  -- Lot payment installments (echeances)
  SELECT
    'lot_echeance'::TEXT,
    le.id,
    'Paiement: ' || le.label,
    le.notes,
    le.date_echeance::DATE,
    le.date_echeance::DATE,
    TRUE,
    pr.client_id,
    c.nom,
    l.project_id,
    pr.nom,
    NULL,
    le.statut_facturation::TEXT,
    le.montant_ht,
    le.statut_facturation = 'Payé'
  FROM project_lot_echeances le
  JOIN project_lots l ON l.id = le.lot_id
  JOIN projects pr ON pr.id = l.project_id
  LEFT JOIN clients c ON c.id = pr.client_id
  WHERE le.user_id = p_user_id
    AND le.statut_facturation != 'Payé'
    AND pr.deleted_at IS NULL
    AND (c.deleted_at IS NULL OR c.id IS NULL)
    AND (p_entreprise_id IS NULL OR pr.entreprise_id = p_entreprise_id)
    AND (p_start_date IS NULL OR le.date_echeance >= p_start_date)
    AND (p_end_date IS NULL OR le.date_echeance <= p_end_date)

  UNION ALL

  -- Recurring payments (echeances) - only show on first day of period
  SELECT
    'recurrent'::TEXT,
    re.id,
    'Récurrent: ' || r.nom || COALESCE(' (' || re.label || ')', ''),
    re.notes,
    re.periode_debut::DATE,
    re.periode_debut::DATE,
    TRUE,
    pr.client_id,
    c.nom,
    r.project_id,
    pr.nom,
    NULL,
    re.statut_facturation::TEXT,
    re.montant_ht,
    re.statut_facturation = 'Payé'
  FROM project_recurrent_echeances re
  JOIN project_recurrents r ON r.id = re.recurrent_id
  JOIN projects pr ON pr.id = r.project_id
  LEFT JOIN clients c ON c.id = pr.client_id
  WHERE re.user_id = p_user_id
    AND re.statut_facturation != 'Payé'
    AND r.statut = 'Actif'
    AND pr.deleted_at IS NULL
    AND (c.deleted_at IS NULL OR c.id IS NULL)
    AND (p_entreprise_id IS NULL OR pr.entreprise_id = p_entreprise_id)
    AND (p_start_date IS NULL OR re.periode_debut >= p_start_date)
    AND (p_end_date IS NULL OR re.periode_debut <= p_end_date)

  UNION ALL

  -- Client follow-ups (date_prochain_contact)
  SELECT
    'followup'::TEXT,
    cl.id,
    'Relance: ' || cl.nom,
    cl.notes,
    cl.date_prochain_contact::DATE,
    cl.date_prochain_contact::DATE,
    TRUE,
    cl.id,
    cl.nom,
    NULL,
    NULL,
    NULL,
    cl.statut::TEXT,
    NULL,
    NULL
  FROM clients cl
  WHERE cl.user_id = p_user_id
    AND cl.date_prochain_contact IS NOT NULL
    AND cl.deleted_at IS NULL
    AND cl.statut != 'Inactif'
    AND (p_entreprise_id IS NULL OR cl.entreprise_id = p_entreprise_id)
    AND (p_start_date IS NULL OR cl.date_prochain_contact::DATE >= p_start_date)
    AND (p_end_date IS NULL OR cl.date_prochain_contact::DATE <= p_end_date);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
