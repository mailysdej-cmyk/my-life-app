// Catalogue par défaut : forfaits, prestations, règles de dates, listes.
// Tout est modifiable dans Réglages › Mes règles (les modifications sont enregistrées
// dans la base et fusionnées avec ce catalogue par mergeConfig).
// Variables des titres : {creche}, {mois} (mois en cours), {mois1} (mois suivant), {prestation}.

export const DEFAULT_CONFIG = {
  plans: {
    essentiel: { label: 'Essentiel', price: 499, rank: 1 },
    confort: { label: 'Confort', price: 890, rank: 2 },
    premium: { label: 'Premium', price: 990, rank: 3 },
  },
  addonPrice: 90,
  maxSwaps: 2,
  maxAddons: 2,
  paymentDays: 30,
  lateDays: 15,
  filleulePremiumDiscount: 50,
  parrainageCredit: 150,
  prospectFollowUpDays: 10,

  // Prestations récurrentes (échangeables / ajoutables). « plan » = forfait d'origine.
  services: [
    { id: 'mails', label: 'Moteur mails', plan: 'essentiel', moteur: 'Moteur mails' },
    { id: 'paiement', label: 'Rappels de paiement', plan: 'essentiel', moteur: 'Moteur rappels paiement' },
    { id: 'rappelsB', label: 'Brouillons de relance', plan: 'essentiel', moteur: 'Moteur rappels B (brouillons de relance)' },
    { id: 'pieces', label: 'Rappels de pièces', plan: 'essentiel', moteur: 'Moteur rappels pièces' },
    { id: 'heures', label: 'Récap des heures', plan: 'essentiel', moteur: 'Moteur heures (récap envoyé le 6)' },
    { id: 'infos', label: 'Mail « infos du mois »', plan: 'essentiel', moteur: 'Moteur infos du mois' },
    { id: 'programme', label: 'Programme du mois (kit)', plan: 'confort', deliverables: ['Kit du mois de {mois1} (programme d’activités et matériel)'] },
    { id: 'newsletter', label: 'Newsletter', plan: 'confort', moteur: 'Moteur newsletter' },
    { id: 'visio', label: 'Visio de suivi mensuelle', plan: 'premium' },
    { id: 'evenements', label: 'Rappels d’événements', plan: 'premium', moteur: 'Moteur rappels événements' },
    { id: 'echeances', label: 'Suivi des obligations (formations, sécurité, PMI, Caf)', plan: 'premium', moteur: 'Moteur obligations' },
    { id: 'reunion', label: 'Réunion d’équipe (ordre du jour et compte rendu)', plan: 'premium', moteur: 'Moteur compte rendu des réunions', deliverables: ['Ordre du jour de la réunion d’équipe de {mois1}'] },
    { id: 'formation', label: 'Idée de formation du mois', plan: 'premium', moteur: 'Moteur formation' },
  ],

  // Tâches mensuelles. service = null : pour toutes les clientes actives.
  // day = jour du mois (29 = 29 ou dernier jour) ; dueDay = échéance si la tâche s'étale.
  rules: [
    { id: 'facture', service: null, day: 1, title: 'Envoyer la facture de {creche}' },
    { id: 'infos-mail', service: 'infos', day: 1, title: 'Vérifier que le mail « infos du mois » est bien parti à {creche}' },
    { id: 'visio-proposer', service: 'visio', day: 1, title: 'Proposer la date de la visio de suivi de {mois} à {creche}' },
    { id: 'newsletter-check', service: 'newsletter', day: 2, title: 'Vérifier que la newsletter de {creche} est bien partie aux familles' },
    { id: 'infos-recues', service: null, day: 5, title: 'Ai-je reçu les infos du mois de {creche} ?' },
    { id: 'programme', service: 'programme', day: 5, dueDay: 20, title: 'Préparer le programme de {mois1} de {creche} (kit du mois)' },
    { id: 'reunion-prep', service: 'reunion', day: 5, dueDay: 25, title: 'Préparer l’ordre du jour de la réunion d’équipe de {mois1} pour {creche}' },
    { id: 'moteurs', service: null, day: 7, title: 'Vérifier que les moteurs de {creche} ont bien tourné' },
    { id: 'echeances-check', service: 'echeances', day: 7, title: 'Vérifier les alertes du suivi des obligations de {creche} (formations, sécurité, PMI, Caf)' },
    { id: 'qualite', service: null, day: 10, title: 'Contrôle qualité {creche} : relire 5 réponses automatiques aux familles et les mails transmis à la direction ; corriger le moteur si besoin' },
    { id: 'formation-besoin', service: 'formation', day: 20, dueDay: 25, title: 'La directrice de {creche} a-t-elle signalé un besoin de formation ? Si oui, changer la ligne de {mois1} dans son tableau « Idées de formation » avant le 25' },
    { id: 'newsletter-annee', service: 'newsletter', day: 1, months: [12], title: 'Remplir l’onglet Newsletter de {creche} pour les 12 mois de l’année suivante' },
    { id: 'newsletter-prep', service: 'newsletter', day: 20, dueDay: 24, title: 'Préparer la newsletter de {mois1} pour {creche} et déposer le lien dans son tableau' },
    { id: 'livraison', service: null, day: 29, title: 'Livrer le travail du mois à {creche}' },
  ],
  baseDeliverables: ['Récapitulatif du mois (ce que les moteurs ont fait)'],

  // Mes tâches d'entrepreneuse
  myRules: [
    { id: 'zapier', day: 1, title: 'Vérifier mon abonnement Zapier et le nombre de tâches utilisées' },
    { id: 'anthropic', day: 1, title: 'Vérifier mon crédit Anthropic (API)' },
  ],
  // Chaque jour du lundi au vendredi (une seule tâche pour toutes les clientes)
  weekdayRules: [
    { id: 'boite', title: 'Lire la boîte Serelys : alertes des moteurs et questions des directrices' },
  ],
  // Chaque année (MM-JJ)
  yearlyRules: [
    { id: 'revenus', date: '05-01', title: 'Déclarer mes revenus d’auto-entrepreneuse' },
    { id: 'regles-obligations', date: '09-01', title: 'Revérifier les règles du tableau des obligations et mettre à jour les tableaux des crèches Premium' },
    { id: 'idees-formation', date: '10-01', title: 'Revérifier les idées de formation et mettre à jour les tableaux des crèches Premium' },
    { id: 'prix', date: '11-01', title: 'Décider si j’augmente mes prix (prévenir chaque crèche 2 mois avant)' },
    { id: 'programme-annee', date: '12-01', title: 'Préparer le programme d’activités de l’année suivante' },
    { id: 'cfe', date: '12-01', due: '12-15', title: 'Payer la CFE (avant le 15 décembre)' },
  ],

  oneshots: {
    essentiel: ['Planning type 35 h', 'Tableau des tailles de couches', 'Tableau contacts parents'],
    confort: ['Protocole stagiaire et agent d’entretien', 'Liste de partenaires locaux'],
    premium: ['Récapitulatifs de devis', 'Fiches de transmission', 'Feuilles to-do list'],
  },

  docsToReceive: [
    { id: 'fiche', label: 'Fiche d’infos partie 1' },
    { id: 'modeles', label: 'Modèles de mails validés' },
    { id: 'acces', label: 'Accès à sa boîte mail et à son Drive' },
    { id: 'note', label: 'Note aux familles distribuée' },
  ],

  setupItems: [
    { id: 'tableaux', label: 'Créer ses tableaux dans son Drive (tableau de rappels, tableau des heures)' },
    { id: 'onglet-familles', label: 'Créer l’onglet « Familles »', minPlan: 'confort' },
    { id: 'tableaux-premium', label: 'Créer l’onglet « Événements », le tableau des obligations et le tableau « Idées de formation »', minPlan: 'premium' },
    { id: 'moteurs', label: 'Copier et brancher ses moteurs : {moteurs}' },
    { id: 'filtre', label: 'Poser le filtre santé dans sa boîte' },
    { id: 'perso', label: 'Personnaliser (coordonnées, horaires, tarifs, signature, mention « assistant automatique »)' },
    { id: 'tests', label: 'Tester chaque moteur avec ma propre adresse' },
    { id: 'allumer', label: 'Allumer les moteurs et prévenir la direction' },
    { id: 'newsletter', label: 'Remplir l’onglet « Newsletter » de son tableau pour les 12 mois', service: 'newsletter' },
  ],

  closingItems: [
    { id: 'moteurs', label: 'Éteindre ses moteurs' },
    { id: 'acces', label: 'Rendre mes accès' },
    { id: 'donnees', label: 'Supprimer ses données' },
    { id: 'confirmer', label: 'Lui confirmer par écrit' },
    { id: 'registre', label: 'Le noter dans mon registre des traitements' },
  ],
};

export const DEFAULT_SETTINGS = {
  trackingStart: null,          // date de première utilisation : rien n'est généré avant
  aeCreated: false,             // case « Auto-entreprise créée »
  aeCreationDate: null,
  acreDone: false,
  rcProDate: null,              // date prévue « Souscrire mon assurance RC pro »
  aeTaskDate: null,             // date prévue « Créer mon auto-entreprise »
  obligationsDate: '01-15',     // MM-JJ : relecture annuelle de mes obligations
  rcProRenewal: null,           // MM-JJ : date anniversaire de l'assurance RC pro
  eInvoiceDate: '2027-06-01',
  urssafPeriod: 'mensuel',      // ou 'trimestriel'
  urssafReminderDays: 5,
  urssafRate: 26.1,
  tvaThreshold: 37500,
  tvaAlertRatio: 0.8,
  goalClients: 2,
  notifTimes: { summary: '08:00', reminders: ['10:00', '12:00'], weekly: '08:00' },
  libraryUrl: '',
  config: {},                   // surcharges de « Mes règles »
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base?.[k]) ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

// Les règles/prestations sont des listes : les surcharges sont fusionnées par id.
export function mergeConfig(over = {}) {
  const c = deepMerge(DEFAULT_CONFIG, { ...over, rules: undefined, services: undefined, myRules: undefined, weekdayRules: undefined, yearlyRules: undefined });
  const byId = (base, list) => {
    if (!Array.isArray(list)) return base;
    const map = new Map(base.map((x) => [x.id, x]));
    for (const x of list) map.set(x.id, { ...(map.get(x.id) || {}), ...x });
    return [...map.values()].filter((x) => !x.deleted);
  };
  c.rules = byId(DEFAULT_CONFIG.rules, over.rules);
  c.services = byId(DEFAULT_CONFIG.services, over.services);
  c.myRules = byId(DEFAULT_CONFIG.myRules, over.myRules);
  c.weekdayRules = byId(DEFAULT_CONFIG.weekdayRules, over.weekdayRules);
  c.yearlyRules = byId(DEFAULT_CONFIG.yearlyRules, over.yearlyRules);
  return c;
}

export const mergeSettings = (s = {}) => deepMerge(DEFAULT_SETTINGS, s);

export const CLIENT_COLORS = ['#A9C4B0', '#A7C7CF', '#F2C9AE', '#EBC4C0', '#C9B8D9', '#E6D49A', '#B5CDA3', '#9FB8D8'];
