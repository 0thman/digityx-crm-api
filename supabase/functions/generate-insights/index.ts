// supabase/functions/generate-insights/index.ts
// Génère des insights IA pour tous les utilisateurs
// Peut être appelée via CRON ou manuellement

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Prompt système optimisé - style Directeur Commercial (CSO)
const SYSTEM_PROMPT_CSO = `Tu es l'Intelligence Commerciale de Digityx Studios, une agence experte en développement Fullstack et IA.
Ton rôle est d'analyser les données historiques d'un client pour détecter des opportunités de vente additionnelle (upsell) ou croisée (cross-sell).

### RÈGLES D'ANALYSE :
1. ANALYSE TECHNIQUE : Si le client a une stack spécifique (ex: React), suggère des évolutions cohérentes (ex: migration Next.js 15, optimisation des Core Web Vitals).
2. ANALYSE IA : Identifie où l'IA pourrait automatiser leurs processus actuels mentionnés dans les notes.
3. CYCLE DE VIE : Si un projet est terminé depuis 6 mois, suggère une phase de maintenance ou une V2.
4. SATISFACTION : Ne suggère des opportunités que si la satisfaction est >= 7.

### RECOMMANDATIONS FINANCIÈRES :
- Sois réaliste. Ne suggère pas un projet à 50k€ pour un client qui a un CA total de 5k€.
- Les montants doivent être des estimations HT basées sur la complexité perçue.
- Fourchettes typiques : Formation (2-5k€), Audit (3-8k€), Feature (5-15k€), Refonte (15-40k€), Projet complet (20-80k€).

### FORMAT DE SORTIE :
Tu dois impérativement répondre au format JSON strict suivant :
{
  "opportunite": "Titre court et percutant",
  "montant_estime": nombre_entier,
  "justification": "Explique pourquoi cette offre est pertinente maintenant en 2 phrases max.",
  "confiance": nombre_entre_0_et_100
}

Si aucune opportunité n'est détectée avec un score de confiance > 60, renvoie : {"opportunite": null}`;

// Prompt système pour la détection de risque de churn
const SYSTEM_PROMPT_CHURN = `Tu es un Customer Success Manager expert en détection précoce des signaux de désengagement client.
Ton rôle est d'analyser les données d'un client pour détecter s'il y a un risque de churn (perte du client).

### SIGNAUX DE RISQUE À ANALYSER :
1. SATISFACTION : Baisse de satisfaction entre interactions récentes
2. FRÉQUENCE DE CONTACT : Diminution notable des échanges
3. RETARDS : Projets livrés en retard ou problèmes de qualité
4. PAIEMENTS : Factures en retard ou litiges
5. ENGAGEMENT : Absence de réponse aux emails, reports de réunions répétés
6. CONTRATS : Récurrents approchant de leur fin sans discussion de renouvellement

### FORMAT DE SORTIE :
{
  "risque_niveau": "Élevé" | "Moyen" | "Faible",
  "facteurs": ["facteur1", "facteur2", ...],
  "actions_recommandees": ["action1", "action2"],
  "confiance": nombre_entre_0_et_100
}

Si le client semble en bonne santé (pas de signaux d'alerte), renvoie : {"risque_niveau": "Faible", "confiance": 0}`;

// Prompt système pour le timing upsell
const SYSTEM_PROMPT_TIMING = `Tu es un expert en psychologie commerciale pour une agence digitale.
Ton rôle est de déterminer si c'est le BON MOMENT pour proposer une vente additionnelle à un client.

### INDICATEURS POSITIFS :
1. Projet récemment livré avec succès (satisfaction élevée)
2. Interaction positive récente (compliments, remerciements dans les notes)
3. Réunion de suivi prévue prochainement
4. Client en phase de croissance (nouveaux projets évoqués)
5. Des idées d'amélioration existent et attendent d'être proposées

### INDICATEURS NÉGATIFS (à éviter) :
1. Projet en cours avec problèmes
2. Réclamation récente ou insatisfaction
3. Dernière proposition commerciale il y a moins de 30 jours
4. Client en difficulté financière (retards de paiement)

### FORMAT DE SORTIE :
{
  "timing_optimal": true | false,
  "moment_suggere": "Cette semaine" | "Attendre 2 semaines" | "Attendre fin de projet",
  "raison": "Explication en 1-2 phrases",
  "canal_suggere": "Email" | "Appel" | "Réunion en personne",
  "idee_a_proposer": "Titre de l'idée si disponible",
  "confiance": nombre_entre_0_et_100
}

Si ce n'est pas le bon moment, renvoie : {"timing_optimal": false, "confiance": 0}`;

// Prompt système pour la stratégie de contenu
const SYSTEM_PROMPT_CONTENT = `Tu es un Content Marketing Strategist pour une agence de développement web et IA.
Ton rôle est d'identifier les projets réussis qui pourraient être transformés en contenu marketing (case study, article technique, post LinkedIn).

### CRITÈRES DE SÉLECTION :
1. Projet terminé avec succès (satisfaction >= 8)
2. Défi technique intéressant résolu
3. Stack ou technologie tendance (Next.js, IA, etc.)
4. Résultats mesurables (performance, ROI)
5. Client qui accepterait probablement d'être cité

### TYPES DE CONTENU :
- "Case Study" : Pour projets complets avec résultats business
- "Article Technique" : Pour défis techniques innovants
- "Post LinkedIn" : Pour quick wins ou tendances
- "Video Demo" : Pour projets très visuels (sites, apps)

### FORMAT DE SORTIE :
{
  "pertinent": true | false,
  "type_contenu": "Case Study" | "Article Technique" | "Post LinkedIn" | "Video Demo",
  "sujet_suggere": "Titre accrocheur pour le contenu",
  "points_cles": ["point1", "point2", "point3"],
  "potentiel_lead_gen": "Élevé" | "Moyen" | "Faible",
  "confiance": nombre_entre_0_et_100
}

Si le projet n'est pas adapté pour du contenu, renvoie : {"pertinent": false, "confiance": 0}`;

// Prompt système pour l'amélioration de process
const SYSTEM_PROMPT_PROCESS = `Tu es un Operations Analyst spécialisé dans les agences digitales.
Ton rôle est d'analyser les données de PLUSIEURS projets pour identifier des patterns récurrents (problèmes, retards, opportunités d'amélioration).

### PATTERNS À DÉTECTER :
1. RETARDS RÉCURRENTS : Certains types de projets dépassent systématiquement
2. ESTIMATIONS SOUS-ÉVALUÉES : Écarts fréquents entre prévu et réel
3. POINTS DE FRICTION : Étapes qui causent souvent des problèmes
4. GAPS DE COMPÉTENCES : Technologies qui posent problème
5. OPPORTUNITÉS MANQUÉES : Idées d'amélioration qui reviennent souvent

### FORMAT DE SORTIE :
{
  "pattern_detecte": true | false,
  "pattern_identifie": "Description courte du pattern",
  "cause_probable": "Hypothèse sur la cause",
  "recommandation": "Action concrète à mettre en place",
  "impact_estime": "Description de l'impact attendu",
  "confiance": nombre_entre_0_et_100
}

Si aucun pattern significatif n'est détecté, renvoie : {"pattern_detecte": false, "confiance": 0}`;

// Prompt système pour l'optimisation pricing
const SYSTEM_PROMPT_PRICING = `Tu es un Business Analyst spécialisé dans le pricing des services digitaux.
Ton rôle est d'analyser les données de facturation pour détecter des anomalies ou opportunités d'optimisation tarifaire.

### ANALYSES À EFFECTUER :
1. SOUS-TARIFICATION : Types de projets facturés sous le marché
2. INCOHÉRENCES : Écarts de prix importants pour des projets similaires
3. MARGE EN BAISSE : Projets de plus en plus complexes au même prix
4. OPPORTUNITÉS : Services à forte valeur ajoutée mal valorisés
5. MRR : Contrats récurrents sous-évalués par rapport à la valeur fournie

### BENCHMARKS MARCHÉ (TJM agence digitale France) :
- Développement junior : 350-450€
- Développement senior : 500-700€
- Architecture/Lead : 700-1000€
- Conseil/Stratégie : 800-1200€

### FORMAT DE SORTIE :
{
  "anomalie_detectee": true | false,
  "type_anomalie": "Sous-tarification" | "Incohérence" | "Opportunité",
  "analyse": "Description de l'observation",
  "recommandation": "Action suggérée",
  "impact_estime": "Gain potentiel estimé",
  "confiance": nombre_entre_0_et_100
}

Si aucune anomalie significative, renvoie : {"anomalie_detectee": false, "confiance": 0}`

// Utilitaire pour tronquer le texte (gestion tokens)
function truncateText(text: string | null, maxLength: number = 500): string {
  if (!text) return "Non renseigné";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "... [tronqué]";
}

// Utilitaire pour parser le JSON de Claude (gère le markdown wrapping)
function parseClaudeJSON(rawText: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawText);
  } catch {
    // Nettoyer si Claude entoure le JSON de ```json ... ```
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Types
interface Client {
  id: string;
  user_id: string;
  nom: string;
  contact_principal: string | null;
  satisfaction: number | null;
  ca_total_genere: number;
  notes: string | null;
  date_dernier_contact: string | null;
  idees_vente: string[];
}

interface Project {
  id: string;
  client_id: string;
  nom: string;
  type: string | null;
  montant_ht: number | null;
  stack_technique: string[];
  statut_projet: string;
  extensions_possibles: string[];
  date_facturation?: string | null;
  montant_facture?: number | null;
  deleted_at: string | null;
  client?: Client;
}

interface Interaction {
  date: string;
  sujet: string | null;
  notes: string | null;
  satisfaction_client?: number | null;
}

// ============ DETECTION FUNCTIONS ============

async function detectForgottenContacts(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .eq("statut", "Actif")
    .is("deleted_at", null)
    .lt("date_dernier_contact", thirtyDaysAgo.toISOString());

  let insightsCreated = 0;

  for (const client of clients || []) {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(client.date_dernier_contact).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // Vérifier si insight similaire existe déjà
    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("client_id", client.id)
      .eq("type", "Contact oublié")
      .eq("statut", "Nouveau")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Contact oublié",
        client_id: client.id,
        titre: `Pas de contact avec ${client.nom} depuis ${daysSinceContact} jours`,
        description: `Client actif sans contact depuis ${daysSinceContact} jours. Risque de perte de relation.`,
        score_confiance: Math.min(95, 70 + daysSinceContact),
        action_suggeree: `Planifier check-in avec ${client.contact_principal || client.nom}`,
      });

      if (!error) insightsCreated++;
    }
  }

  return insightsCreated;
}

async function detectRecommendationMoments(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Récupérer les projets terminés et payés avec satisfaction >= 8
  const { data: projects } = await supabase
    .from("projects")
    .select(
      `
      *,
      client:clients(*)
    `
    )
    .eq("user_id", userId)
    .eq("statut_projet", "Terminé")
    .is("deleted_at", null);

  let insightsCreated = 0;

  for (const project of projects || []) {
    const client = project.client;
    if (!client || (client.satisfaction ?? 0) < 8) continue;

    // Vérifier si le projet a des lots payés
    const { data: paidLots } = await supabase
      .from("project_lots")
      .select("id")
      .eq("project_id", project.id)
      .eq("statut_facturation", "Payé")
      .limit(1);

    if (!paidLots?.length) continue;

    // Vérifier dernière demande de recommandation (90 jours)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: recentRequest } = await supabase
      .from("interactions")
      .select("id")
      .eq("client_id", project.client_id)
      .ilike("sujet", "%recommandation%")
      .gte("date", ninetyDaysAgo.toISOString())
      .limit(1);

    if (!recentRequest?.length) {
      const { data: existing } = await supabase
        .from("insights_ia")
        .select("id")
        .eq("client_id", project.client_id)
        .eq("type", "Moment recommandation")
        .eq("statut", "Nouveau")
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("insights_ia").insert({
          user_id: userId,
          type: "Moment recommandation",
          client_id: project.client_id,
          project_id: project.id,
          titre: `Moment idéal pour demander recommandation à ${client.nom}`,
          description: `Projet "${project.nom}" terminé avec succès. Satisfaction: ${client.satisfaction}/10.`,
          score_confiance: (project.montant_ht ?? 0) >= 10000 ? 90 : 75,
          action_suggeree:
            "Envoyer email demande recommandation personnalisé",
        });

        if (!error) insightsCreated++;
      }
    }
  }

  return insightsCreated;
}

async function detectExtensionOpportunities(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  const { data: clients } = await supabase
    .from("clients")
    .select(
      `
      *,
      projects(*),
      interactions(date, notes, sujet)
    `
    )
    .eq("user_id", userId)
    .eq("statut", "Actif")
    .is("deleted_at", null)
    .gte("satisfaction", 7);

  let insightsCreated = 0;

  for (const client of clients || []) {
    const completedProjects = (client.projects as Project[])?.filter(
      (p) => p.statut_projet === "Terminé" && !p.deleted_at
    );

    if (!completedProjects?.length) continue;

    // Vérifier si un insight existe déjà ce mois-ci pour ce client/type
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: existingThisMonth } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("client_id", client.id)
      .eq("type", "Opportunité extension")
      .gte("created_at", startOfMonth.toISOString())
      .limit(1);

    // Autoriser un insight par type par mois par client
    if (existingThisMonth?.length) continue;

    // Construction du contexte avec troncature pour éviter les tokens excessifs
    const interactions = client.interactions as Interaction[] | undefined;
    const userContext = `
DONNÉES DU CLIENT :
- Nom : ${client.nom}
- CA Historique : ${client.ca_total_genere}€
- Satisfaction : ${client.satisfaction}/10
- Dernier contact : ${client.date_dernier_contact || "Non renseigné"}

PROJETS RÉALISÉS :
${completedProjects
  .slice(0, 5)
  .map(
    (p) =>
      `- ${p.nom} (Type: ${p.type}, Montant: ${p.montant_ht}€, Stack: ${p.stack_technique?.slice(0, 5).join(", ") || "N/A"})`
  )
  .join("\n")}

IDÉES DE VENTE NOTÉES : ${client.idees_vente?.slice(0, 5).join(", ") || "Aucune"}

EXTENSIONS POSSIBLES NOTÉES :
${completedProjects.flatMap((p) => p.extensions_possibles || []).slice(0, 5).join(", ") || "Aucune"}

NOTES CLIENT (résumé) : ${truncateText(client.notes, 300)}

DERNIERS ÉCHANGES :
${
  interactions
    ?.slice(0, 3)
    .map(
      (i) =>
        `- ${new Date(i.date).toLocaleDateString("fr-FR")}: ${truncateText(i.sujet, 50)} - ${truncateText(i.notes, 100)}`
    )
    .join("\n") || "Aucun"
}
`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        system: SYSTEM_PROMPT_CSO,
        messages: [{ role: "user", content: userContext }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const result = parseClaudeJSON(content.text);

        if (
          result &&
          result.opportunite &&
          (result.confiance as number) >= 70
        ) {
          const { error } = await supabase.from("insights_ia").insert({
            user_id: userId,
            type: "Opportunité extension",
            client_id: client.id,
            titre: result.opportunite as string,
            description: result.justification as string,
            score_confiance: result.confiance as number,
            action_suggeree: `Proposer ${result.opportunite} (~${result.montant_estime}€)`,
            metadata: {
              montant_estime: result.montant_estime,
              generated_at: new Date().toISOString(),
              model: "claude-sonnet-4-20250514",
            },
          });

          if (!error) insightsCreated++;
        }
      }
    } catch (error) {
      console.error(`Error analyzing client ${client.id}:`, error);
    }
  }

  return insightsCreated;
}

async function detectUnpaidInvoices(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  let insightsCreated = 0;

  // 1. Échéances de lots facturées mais non payées depuis 30+ jours
  const { data: lotEcheances } = await supabase
    .from("project_lot_echeances")
    .select(`
      *,
      lot:project_lots(*, project:projects(*, client:clients(nom)))
    `)
    .eq("user_id", userId)
    .eq("statut_facturation", "Facturé")
    .lt("date_facturation", thirtyDaysAgo.toISOString());

  for (const echeance of lotEcheances || []) {
    if (!echeance.date_facturation || !echeance.lot?.project) continue;

    const daysSinceInvoice = Math.floor(
      (Date.now() - new Date(echeance.date_facturation).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const project = echeance.lot.project;
    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("project_id", project.id)
      .eq("type", "Facture impayée")
      .eq("statut", "Nouveau")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Facture impayée",
        client_id: project.client_id,
        project_id: project.id,
        titre: `Échéance impayée: ${echeance.label} - ${echeance.lot.nom} (${daysSinceInvoice}j)`,
        description: `Échéance de ${echeance.montant_ht}€ non payée depuis ${daysSinceInvoice} jours.`,
        score_confiance: 95,
        action_suggeree: `Relancer ${project.client?.nom} pour paiement`,
        metadata: { echeance_type: "lot", echeance_id: echeance.id },
      });
      if (!error) insightsCreated++;
    }
  }

  // 2. Échéances récurrentes facturées mais non payées depuis 30+ jours
  const { data: recurrentEcheances } = await supabase
    .from("project_recurrent_echeances")
    .select(`
      *,
      recurrent:project_recurrents(*, project:projects(*, client:clients(nom)))
    `)
    .eq("user_id", userId)
    .eq("statut_facturation", "Facturé")
    .lt("date_facturation", thirtyDaysAgo.toISOString());

  for (const echeance of recurrentEcheances || []) {
    if (!echeance.date_facturation || !echeance.recurrent?.project) continue;

    const daysSinceInvoice = Math.floor(
      (Date.now() - new Date(echeance.date_facturation).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const project = echeance.recurrent.project;
    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("project_id", project.id)
      .eq("type", "Facture impayée")
      .eq("statut", "Nouveau")
      .ilike("titre", `%${echeance.label}%`)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Facture impayée",
        client_id: project.client_id,
        project_id: project.id,
        titre: `Récurrent impayé: ${echeance.label} (${daysSinceInvoice}j)`,
        description: `Échéance récurrente de ${echeance.montant_ht}€ non payée depuis ${daysSinceInvoice} jours.`,
        score_confiance: 95,
        action_suggeree: `Relancer ${project.client?.nom} pour paiement`,
        metadata: { echeance_type: "recurrent", echeance_id: echeance.id },
      });
      if (!error) insightsCreated++;
    }
  }

  return insightsCreated;
}

async function detectLowPipeline(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Calculer la valeur du pipeline (projets en discussion/proposition)
  const { data: projects } = await supabase
    .from("projects")
    .select("montant_ht, probabilite_closing")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("statut_projet", ["Discussion", "Proposition envoyée"]);

  const pipelineValue =
    projects?.reduce((acc, p) => {
      return acc + ((p.montant_ht ?? 0) * (p.probabilite_closing ?? 50)) / 100;
    }, 0) || 0;

  if (pipelineValue < 10000) {
    // Vérifier si un insight similaire existe déjà cette semaine
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: existing } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "Pipeline faible")
      .eq("statut", "Nouveau")
      .gte("created_at", oneWeekAgo.toISOString())
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("insights_ia").insert({
        user_id: userId,
        type: "Pipeline faible",
        titre: `Pipeline faible: ${Math.round(pipelineValue)}€`,
        description: `Pipeline actuel sous 50k€. Actions commerciales recommandées.`,
        score_confiance: 80,
        action_suggeree: "Recontacter prospects froids ou lancer prospection",
      });

      if (!error) return 1;
    }
  }

  return 0;
}

// ============ NEW AI-POWERED DETECTION FUNCTIONS ============

async function detectChurnRisk(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  // Récupérer les clients actifs avec leur historique
  const { data: clients } = await supabase
    .from("clients")
    .select(`
      *,
      projects(*),
      interactions(date, notes, sujet, satisfaction_client)
    `)
    .eq("user_id", userId)
    .eq("statut", "Actif")
    .is("deleted_at", null);

  let insightsCreated = 0;
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  for (const client of clients || []) {
    // Vérifier si insight churn existe déjà dans les 2 dernières semaines
    const { data: existingChurn } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("client_id", client.id)
      .eq("type", "Risque churn")
      .gte("created_at", twoWeeksAgo.toISOString())
      .limit(1);

    if (existingChurn?.length) continue;

    // Récupérer les retards de paiement
    const { data: unpaidEcheances } = await supabase
      .from("project_lot_echeances")
      .select("id, date_facturation")
      .eq("user_id", userId)
      .eq("statut_facturation", "Facturé")
      .lt("date_facturation", new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString());

    // Récupérer les projets en retard
    const projects = client.projects as Project[] || [];
    const delayedProjects = projects.filter(p =>
      p.statut_projet === "En cours" &&
      p.deleted_at === null
    );

    // Récupérer les contrats récurrents qui expirent bientôt
    const { data: expiringContracts } = await supabase
      .from("project_recurrents")
      .select("*, project:projects(client_id)")
      .eq("user_id", userId)
      .eq("statut", "Actif")
      .not("date_fin", "is", null)
      .lt("date_fin", new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString());

    const clientExpiringContracts = (expiringContracts || []).filter(
      (c: { project?: { client_id?: string } }) => c.project?.client_id === client.id
    );

    const interactions = client.interactions as Interaction[] || [];

    // Construire le contexte pour Claude
    const userContext = `
DONNÉES DU CLIENT :
- Nom : ${client.nom}
- Satisfaction actuelle : ${client.satisfaction ?? "Non renseignée"}/10
- CA total généré : ${client.ca_total_genere}€
- Dernier contact : ${client.date_dernier_contact || "Non renseigné"}
- Jours depuis dernier contact : ${client.date_dernier_contact ? Math.floor((Date.now() - new Date(client.date_dernier_contact).getTime()) / (1000 * 60 * 60 * 24)) : "N/A"}

SIGNAUX POTENTIELS :
- Factures en retard de paiement : ${unpaidEcheances?.length || 0}
- Projets potentiellement en retard : ${delayedProjects.length}
- Contrats récurrents expirant dans 60 jours : ${clientExpiringContracts.length}

DERNIÈRES INTERACTIONS (satisfaction notée) :
${interactions
  .slice(0, 5)
  .map((i) => `- ${new Date(i.date).toLocaleDateString("fr-FR")}: ${truncateText(i.sujet, 50)} ${i.satisfaction_client ? `(Satisfaction: ${i.satisfaction_client}/10)` : ""} - ${truncateText(i.notes, 100)}`)
  .join("\n") || "Aucune interaction récente"}

NOTES CLIENT : ${truncateText(client.notes, 200)}
`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT_CHURN,
        messages: [{ role: "user", content: userContext }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const result = parseClaudeJSON(content.text);

        if (
          result &&
          result.risque_niveau !== "Faible" &&
          (result.confiance as number) >= 65
        ) {
          const facteurs = (result.facteurs as string[]) || [];
          const actions = (result.actions_recommandees as string[]) || [];

          const { error } = await supabase.from("insights_ia").insert({
            user_id: userId,
            type: "Risque churn",
            client_id: client.id,
            titre: `Risque de churn ${result.risque_niveau}: ${client.nom}`,
            description: facteurs.slice(0, 3).join(". "),
            score_confiance: result.confiance as number,
            action_suggeree: actions[0] || "Planifier un appel de suivi",
            metadata: {
              risque_niveau: result.risque_niveau,
              facteurs,
              actions_recommandees: actions,
              generated_at: new Date().toISOString(),
            },
          });

          if (!error) insightsCreated++;
        }
      }
    } catch (error) {
      console.error(`Error analyzing churn risk for client ${client.id}:`, error);
    }
  }

  return insightsCreated;
}

async function detectUpsellTiming(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  // Récupérer les clients avec des idées à proposer
  const { data: clientsWithIdeas } = await supabase
    .from("project_ideas")
    .select(`
      *,
      project:projects(*, client:clients(*))
    `)
    .eq("user_id", userId)
    .eq("statut", "À proposer");

  if (!clientsWithIdeas?.length) return 0;

  // Grouper par client
  const clientIdeasMap = new Map<string, { client: Client; ideas: { titre: string; potentiel_financier: number }[]; project_id: string }>();

  for (const idea of clientsWithIdeas) {
    if (!idea.project?.client) continue;
    const clientId = idea.project.client.id;

    if (!clientIdeasMap.has(clientId)) {
      clientIdeasMap.set(clientId, {
        client: idea.project.client as Client,
        ideas: [],
        project_id: idea.project_id,
      });
    }
    clientIdeasMap.get(clientId)!.ideas.push({
      titre: idea.titre,
      potentiel_financier: idea.potentiel_financier || 0,
    });
  }

  let insightsCreated = 0;
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  for (const [clientId, data] of clientIdeasMap) {
    const { client, ideas, project_id } = data;

    // Vérifier si insight timing existe déjà ce mois
    const { data: existingTiming } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("client_id", clientId)
      .eq("type", "Timing upsell")
      .gte("created_at", oneMonthAgo.toISOString())
      .limit(1);

    if (existingTiming?.length) continue;

    // Récupérer les interactions récentes
    const { data: recentInteractions } = await supabase
      .from("interactions")
      .select("*")
      .eq("client_id", clientId)
      .order("date", { ascending: false })
      .limit(5);

    // Récupérer les lots livrés récemment
    const { data: recentDeliveries } = await supabase
      .from("project_lots")
      .select("*, project:projects(client_id)")
      .eq("user_id", userId)
      .eq("statut_livraison", "Livré")
      .gte("date_livraison", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const clientDeliveries = (recentDeliveries || []).filter(
      (d: { project?: { client_id?: string } }) => d.project?.client_id === clientId
    );

    const userContext = `
CLIENT : ${client.nom}
- Satisfaction : ${client.satisfaction ?? "N/A"}/10
- CA total : ${client.ca_total_genere}€
- Dernier contact : ${client.date_dernier_contact || "N/A"}

IDÉES EN ATTENTE DE PROPOSITION :
${ideas.map(i => `- ${i.titre} (${i.potentiel_financier}€)`).join("\n")}

LIVRAISONS RÉCENTES (30 derniers jours) : ${clientDeliveries.length}

DERNIÈRES INTERACTIONS :
${(recentInteractions || [])
  .map((i: { date: string; sujet?: string; satisfaction_client?: number }) =>
    `- ${new Date(i.date).toLocaleDateString("fr-FR")}: ${i.sujet || "N/A"} ${i.satisfaction_client ? `(Satisfaction: ${i.satisfaction_client}/10)` : ""}`)
  .join("\n") || "Aucune"}
`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT_TIMING,
        messages: [{ role: "user", content: userContext }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const result = parseClaudeJSON(content.text);

        if (
          result &&
          result.timing_optimal === true &&
          (result.confiance as number) >= 70
        ) {
          const { error } = await supabase.from("insights_ia").insert({
            user_id: userId,
            type: "Timing upsell",
            client_id: clientId,
            project_id: project_id,
            titre: `Moment idéal pour proposer à ${client.nom}`,
            description: result.raison as string,
            score_confiance: result.confiance as number,
            action_suggeree: `${result.canal_suggere}: proposer "${result.idee_a_proposer || ideas[0]?.titre}"`,
            metadata: {
              moment_suggere: result.moment_suggere,
              canal_suggere: result.canal_suggere,
              idee_a_proposer: result.idee_a_proposer,
              ideas_count: ideas.length,
              generated_at: new Date().toISOString(),
            },
          });

          if (!error) insightsCreated++;
        }
      }
    } catch (error) {
      console.error(`Error analyzing upsell timing for client ${clientId}:`, error);
    }
  }

  return insightsCreated;
}

async function detectContentStrategy(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Récupérer les projets terminés récemment avec bonne satisfaction
  const { data: completedProjects } = await supabase
    .from("projects")
    .select(`
      *,
      client:clients(nom, satisfaction, source_acquisition)
    `)
    .eq("user_id", userId)
    .eq("statut_projet", "Terminé")
    .is("deleted_at", null)
    .gte("date_fin_reelle", sixtyDaysAgo.toISOString());

  let insightsCreated = 0;

  for (const project of completedProjects || []) {
    const client = project.client as { nom: string; satisfaction: number | null; source_acquisition: string | null } | null;
    if (!client || (client.satisfaction ?? 0) < 8) continue;

    // Vérifier si insight content existe déjà pour ce projet
    const { data: existingContent } = await supabase
      .from("insights_ia")
      .select("id")
      .eq("project_id", project.id)
      .eq("type", "Stratégie contenu")
      .limit(1);

    if (existingContent?.length) continue;

    const userContext = `
PROJET : ${project.nom}
- Type : ${project.type || "N/A"}
- Stack technique : ${project.stack_technique?.join(", ") || "N/A"}
- Montant : ${project.montant_ht}€
- Satisfaction client : ${client.satisfaction}/10

CLIENT : ${client.nom}
- Source d'acquisition : ${client.source_acquisition || "N/A"}

EXTENSIONS RÉALISÉES : ${project.extensions_possibles?.join(", ") || "Aucune"}

DOCUMENTATION PROJET (résumé) : ${truncateText(project.documentation_md, 500)}
`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT_CONTENT,
        messages: [{ role: "user", content: userContext }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const result = parseClaudeJSON(content.text);

        if (
          result &&
          result.pertinent === true &&
          (result.confiance as number) >= 70
        ) {
          const pointsCles = (result.points_cles as string[]) || [];

          const { error } = await supabase.from("insights_ia").insert({
            user_id: userId,
            type: "Stratégie contenu",
            client_id: project.client_id,
            project_id: project.id,
            titre: `${result.type_contenu}: ${result.sujet_suggere}`,
            description: pointsCles.join(". "),
            score_confiance: result.confiance as number,
            action_suggeree: `Créer un ${result.type_contenu} sur "${result.sujet_suggere}"`,
            metadata: {
              type_contenu: result.type_contenu,
              sujet_suggere: result.sujet_suggere,
              points_cles: pointsCles,
              potentiel_lead_gen: result.potentiel_lead_gen,
              generated_at: new Date().toISOString(),
            },
          });

          if (!error) insightsCreated++;
        }
      }
    } catch (error) {
      console.error(`Error analyzing content strategy for project ${project.id}:`, error);
    }
  }

  return insightsCreated;
}

async function detectProcessImprovement(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  // Insight global - vérifier si existe déjà ce mois
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const { data: existingProcess } = await supabase
    .from("insights_ia")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "Amélioration process")
    .gte("created_at", oneMonthAgo.toISOString())
    .limit(1);

  if (existingProcess?.length) return 0;

  // Récupérer tous les projets terminés pour analyse
  const { data: projects } = await supabase
    .from("projects")
    .select(`
      *,
      lots:project_lots(*)
    `)
    .eq("user_id", userId)
    .eq("statut_projet", "Terminé")
    .is("deleted_at", null)
    .order("date_fin_reelle", { ascending: false })
    .limit(20);

  if (!projects || projects.length < 5) return 0; // Besoin de 5+ projets

  // Récupérer les idées les plus fréquentes
  const { data: ideas } = await supabase
    .from("project_ideas")
    .select("categorie, titre")
    .eq("user_id", userId)
    .limit(50);

  // Analyser les retards par type
  const projectsByType: Record<string, { count: number; delays: number[] }> = {};

  for (const project of projects) {
    const type = project.type || "Autre";
    if (!projectsByType[type]) {
      projectsByType[type] = { count: 0, delays: [] };
    }
    projectsByType[type].count++;

    if (project.date_fin_prevue && project.date_fin_reelle) {
      const delay = Math.floor(
        (new Date(project.date_fin_reelle).getTime() - new Date(project.date_fin_prevue).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (delay > 0) projectsByType[type].delays.push(delay);
    }
  }

  // Catégories d'idées les plus fréquentes
  const categoryCounts: Record<string, number> = {};
  for (const idea of ideas || []) {
    const cat = idea.categorie || "Autre";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const userContext = `
ANALYSE DE ${projects.length} PROJETS TERMINÉS :

RETARDS PAR TYPE DE PROJET :
${Object.entries(projectsByType)
  .map(([type, data]) => {
    const avgDelay = data.delays.length > 0
      ? Math.round(data.delays.reduce((a, b) => a + b, 0) / data.delays.length)
      : 0;
    return `- ${type}: ${data.count} projets, ${data.delays.length} en retard (moyenne: ${avgDelay}j)`;
  })
  .join("\n")}

STACKS TECHNIQUES UTILISÉES :
${[...new Set(projects.flatMap(p => p.stack_technique || []))].slice(0, 10).join(", ")}

CATÉGORIES D'IDÉES D'AMÉLIORATION LES PLUS FRÉQUENTES :
${Object.entries(categoryCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([cat, count]) => `- ${cat}: ${count} idées`)
  .join("\n")}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT_PROCESS,
      messages: [{ role: "user", content: userContext }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      const result = parseClaudeJSON(content.text);

      if (
        result &&
        result.pattern_detecte === true &&
        (result.confiance as number) >= 70
      ) {
        const { error } = await supabase.from("insights_ia").insert({
          user_id: userId,
          type: "Amélioration process",
          titre: `Process: ${truncateText(result.pattern_identifie as string, 60)}`,
          description: `${result.cause_probable}. ${result.recommandation}`,
          score_confiance: result.confiance as number,
          action_suggeree: result.recommandation as string,
          metadata: {
            pattern_identifie: result.pattern_identifie,
            cause_probable: result.cause_probable,
            impact_estime: result.impact_estime,
            projects_analyzed: projects.length,
            generated_at: new Date().toISOString(),
          },
        });

        if (!error) return 1;
      }
    }
  } catch (error) {
    console.error(`Error analyzing process improvement:`, error);
  }

  return 0;
}

async function detectPricingOptimization(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  userId: string
): Promise<number> {
  // Insight global - vérifier si existe déjà ce trimestre
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: existingPricing } = await supabase
    .from("insights_ia")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "Optimisation pricing")
    .gte("created_at", threeMonthsAgo.toISOString())
    .limit(1);

  if (existingPricing?.length) return 0;

  // Récupérer les projets avec lots pour analyse pricing
  const { data: projects } = await supabase
    .from("projects")
    .select(`
      *,
      lots:project_lots(*),
      recurrents:project_recurrents(*)
    `)
    .eq("user_id", userId)
    .eq("statut_projet", "Terminé")
    .is("deleted_at", null)
    .order("date_fin_reelle", { ascending: false })
    .limit(30);

  if (!projects || projects.length < 10) return 0; // Besoin de 10+ projets

  // Analyser les montants par type
  const pricingByType: Record<string, { montants: number[]; count: number }> = {};

  for (const project of projects) {
    const type = project.type || "Autre";
    if (!pricingByType[type]) {
      pricingByType[type] = { montants: [], count: 0 };
    }
    pricingByType[type].count++;
    if (project.montant_ht) {
      pricingByType[type].montants.push(project.montant_ht);
    }
  }

  // Calculer le MRR total
  const { data: activeRecurrents } = await supabase
    .from("project_recurrents")
    .select("montant_ht, frequence")
    .eq("user_id", userId)
    .eq("statut", "Actif");

  const mrr = (activeRecurrents || []).reduce((acc, r) => {
    const monthly = r.frequence === "Mensuel" ? r.montant_ht
      : r.frequence === "Trimestriel" ? r.montant_ht / 3
      : r.montant_ht / 12;
    return acc + monthly;
  }, 0);

  const userContext = `
ANALYSE PRICING DE ${projects.length} PROJETS :

MONTANTS PAR TYPE DE PROJET :
${Object.entries(pricingByType)
  .map(([type, data]) => {
    const avg = data.montants.length > 0
      ? Math.round(data.montants.reduce((a, b) => a + b, 0) / data.montants.length)
      : 0;
    const min = data.montants.length > 0 ? Math.min(...data.montants) : 0;
    const max = data.montants.length > 0 ? Math.max(...data.montants) : 0;
    return `- ${type}: ${data.count} projets, moyenne ${avg}€, range ${min}€-${max}€`;
  })
  .join("\n")}

MRR ACTUEL : ${Math.round(mrr)}€/mois (${(activeRecurrents || []).length} contrats actifs)

RÉPARTITION RÉCURRENTS :
${(activeRecurrents || [])
  .slice(0, 5)
  .map(r => `- ${r.montant_ht}€/${r.frequence === "Mensuel" ? "mois" : r.frequence === "Trimestriel" ? "trim" : "an"}`)
  .join("\n")}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT_PRICING,
      messages: [{ role: "user", content: userContext }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      const result = parseClaudeJSON(content.text);

      if (
        result &&
        result.anomalie_detectee === true &&
        (result.confiance as number) >= 65
      ) {
        const { error } = await supabase.from("insights_ia").insert({
          user_id: userId,
          type: "Optimisation pricing",
          titre: `Pricing: ${result.type_anomalie}`,
          description: result.analyse as string,
          score_confiance: result.confiance as number,
          action_suggeree: result.recommandation as string,
          metadata: {
            type_anomalie: result.type_anomalie,
            impact_estime: result.impact_estime,
            mrr_actuel: Math.round(mrr),
            projects_analyzed: projects.length,
            generated_at: new Date().toISOString(),
          },
        });

        if (!error) return 1;
      }
    }
  } catch (error) {
    console.error(`Error analyzing pricing optimization:`, error);
  }

  return 0;
}

// ============ MAIN HANDLER ============

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Récupérer tous les utilisateurs avec des clients actifs
    const { data: users } = await supabase
      .from("clients")
      .select("user_id")
      .eq("statut", "Actif")
      .is("deleted_at", null);

    const uniqueUsers = [...new Set(users?.map((u) => u.user_id))];

    const stats = {
      users_processed: 0,
      // Règles existantes
      forgotten_contacts: 0,
      recommendation_moments: 0,
      extension_opportunities: 0,
      unpaid_invoices: 0,
      low_pipeline: 0,
      // Nouveaux insights IA
      churn_risk: 0,
      upsell_timing: 0,
      content_strategy: 0,
      process_improvement: 0,
      pricing_optimization: 0,
    };

    for (const userId of uniqueUsers) {
      // Détections basées sur règles
      stats.forgotten_contacts += await detectForgottenContacts(
        supabase,
        userId
      );
      stats.recommendation_moments += await detectRecommendationMoments(
        supabase,
        userId
      );
      stats.unpaid_invoices += await detectUnpaidInvoices(supabase, userId);
      stats.low_pipeline += await detectLowPipeline(supabase, userId);

      // Détections basées sur IA (Claude)
      stats.extension_opportunities += await detectExtensionOpportunities(
        supabase,
        anthropic,
        userId
      );
      stats.churn_risk += await detectChurnRisk(
        supabase,
        anthropic,
        userId
      );
      stats.upsell_timing += await detectUpsellTiming(
        supabase,
        anthropic,
        userId
      );
      stats.content_strategy += await detectContentStrategy(
        supabase,
        anthropic,
        userId
      );
      stats.process_improvement += await detectProcessImprovement(
        supabase,
        anthropic,
        userId
      );
      stats.pricing_optimization += await detectPricingOptimization(
        supabase,
        anthropic,
        userId
      );

      stats.users_processed++;
    }

    const totalInsights =
      stats.forgotten_contacts +
      stats.recommendation_moments +
      stats.extension_opportunities +
      stats.unpaid_invoices +
      stats.low_pipeline +
      stats.churn_risk +
      stats.upsell_timing +
      stats.content_strategy +
      stats.process_improvement +
      stats.pricing_optimization;

    console.log("Insights generation completed:", stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${totalInsights} insights for ${stats.users_processed} users`,
        stats,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-insights:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
