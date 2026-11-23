// Mises à jour de la structure des données, faites une seule fois et sans rien supprimer.
// Avant chaque mise à jour, une copie complète des données est enregistrée (kind « backup »).
import { DEFAULT_CONFIG } from './catalog.js';

export const DATA_VERSION = 4;
const SKIP = new Set(['push', 'system', 'backup']);

// items = { kind: { id: data } }. Renvoie la liste des écritures à faire, dans l'ordre.
export function migrate(items, today) {
  const settings = items.settings?.main || {};
  const version = settings.dataVersion || 1;
  if (version >= DATA_VERSION) return [];
  const writes = [];
  const snapshot = {};
  for (const [kind, rows] of Object.entries(items)) if (!SKIP.has(kind)) snapshot[kind] = rows;
  writes.push({ kind: 'backup', id: `avant-v${DATA_VERSION}-${today}`, data: { createdAt: new Date().toISOString(), fromVersion: version, items: snapshot } });

  if (version < 2) migrateV2(items, settings, today, writes);
  if (version < 3) migrateV3(items, writes);
  if (version < 4) migrateV4(items, writes);
  writes.push({ kind: 'settings', id: 'main', data: { ...settings, trackingStart: settings.trackingStart || today, launchSeeded: true,
    prospection: settings.prospection || { enabled: true, goal: 25, mode: 'quotidien', blocDay: 1 }, siteOnline: !!settings.siteOnline, dataVersion: DATA_VERSION } });
  return writes;
}

function migrateV2(items, settings, today, writes) {
  // v2 : étapes de prospection (« Signée » → « Cliente »), date du dernier changement, priorité
  for (const [id, p] of Object.entries(items.prospect || {})) {
    const next = { ...p };
    if (next.stage === 'signee') next.stage = 'cliente';
    if (!next.stageChangedAt) next.stageChangedAt = next.firstContact || today;
    if (!next.priorite) next.priorite = 'moyenne';
    if (JSON.stringify(next) !== JSON.stringify(p)) writes.push({ kind: 'prospect', id, data: next });
  }
  // v2 : checklist du mode lancement (une seule fois ; ensuite elle est à moi)
  if (!settings.launchSeeded && !Object.keys(items.launch || {}).length) {
    DEFAULT_CONFIG.launchSteps.forEach((x, i) => writes.push({ kind: 'launch', id: x.id, data: { label: x.label, order: i + 1, done: false } }));
  }
}

// v3 : fiches du jour. Tâches récurrentes de départ (celles qui n'existaient pas encore), modifiables ensuite.
export const STARTER_RECURRING = [
  { id: 'validation-newsletter', title: 'Vérifier que {creche} a validé la newsletter', scope: 'clients', plans: ['confort', 'premium'],
    freq: { type: 'monthly', monthDays: [25] } },
  { id: 'resume-semaine', title: 'Faire le résumé de ma semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [5] } },
  { id: 'liste-claude', title: 'Demander à Claude la liste de la semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [1] },
    note: 'Les 25 crèches à contacter cette semaine.', link: 'https://claude.ai/new' },
];
function migrateV3(items, writes) {
  for (const r of STARTER_RECURRING) {
    if (!items.recurring?.[r.id]) writes.push({ kind: 'recurring', id: r.id, data: { ...r, id: undefined, createdAt: new Date().toISOString() } });
  }
}

// v4 : routine « visibilité et prospection ». Les réseaux sociaux attendent « Site en ligne : oui »,
// les mails et les relances attendent « Entreprise créée : oui ». Tout reste modifiable ensuite.
const WEEK = [1, 2, 3, 4, 5];
export const ROUTINE = [
  { id: 'routine-relances', title: 'Faire les relances de prospection', note: 'Les crèches contactées il y a 7 jours sans réponse.', freq: { type: 'weekdays', weekdays: WEEK }, gate: 'entreprise', link: 'prospection', order: 2 },
  { id: 'routine-linkedin-ajouts', title: 'Ajouter 2 à 4 directrices ou gestionnaires de crèches sur LinkedIn', freq: { type: 'weekdays', weekdays: WEEK }, gate: 'site', order: 3 },
  { id: 'routine-instagram-suivre', title: 'Suivre 2 ou 3 comptes de crèches ou de pros de la petite enfance sur Instagram (optionnel)', freq: { type: 'weekdays', weekdays: WEEK }, gate: 'site', order: 4 },
  { id: 'routine-facebook', title: 'Passer 10 à 15 min dans les groupes Facebook petite enfance', note: 'Répondre aux questions, rendre service, ne pas vendre.', freq: { type: 'weekdays', weekdays: [1, 4] }, gate: 'site', order: 5 },
  { id: 'routine-post', title: 'Publier le post de la semaine sur LinkedIn', note: 'Et le même sur Instagram si je veux.', freq: { type: 'weekdays', weekdays: [2] }, gate: 'site', order: 5 },
  { id: 'routine-commentaires', title: 'Écrire 2 ou 3 commentaires utiles sous des posts LinkedIn', freq: { type: 'weekdays', weekdays: [3] }, gate: 'site', order: 5 },
  { id: 'routine-point', title: 'Faire le point de la semaine', note: 'Mettre à jour « Ma prospection » dans ma Bibliothèque Serelys, puis demander à Claude la liste de crèches suivante.', freq: { type: 'weekdays', weekdays: [5] }, gate: 'entreprise', link: 'prospection', order: 9 },
  { id: 'une-fois-linkedin', title: 'Créer mon profil LinkedIn', freq: { type: 'todo' }, gate: 'site', order: 1 },
  { id: 'une-fois-google', title: 'Créer ma fiche Google Business Profile', freq: { type: 'todo' }, gate: 'site', order: 2 },
  { id: 'une-fois-facebook', title: 'Rejoindre 3 à 5 groupes Facebook petite enfance', freq: { type: 'todo' }, gate: 'site', order: 3 },
  { id: 'une-fois-instagram', title: 'Créer le compte Instagram Serelys', note: 'Nom « Serelys », logo, lien du site.', freq: { type: 'todo' }, gate: 'site', order: 4 },
];
function migrateV4(items, writes) {
  for (const r of ROUTINE) {
    if (!items.recurring?.[r.id]) writes.push({ kind: 'recurring', id: r.id, data: { ...r, id: undefined, scope: 'me', routine: true, createdAt: new Date().toISOString() } });
  }
}
