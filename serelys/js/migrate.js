// Mises à jour de la structure des données, faites une seule fois et sans rien supprimer.
// Avant chaque mise à jour, une copie complète des données est enregistrée (kind « backup »).
import { DEFAULT_CONFIG } from './catalog.js';

export const DATA_VERSION = 2;
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
  writes.push({ kind: 'settings', id: 'main', data: { ...settings, trackingStart: settings.trackingStart || today, launchSeeded: true, dataVersion: DATA_VERSION } });
  return writes;
}
