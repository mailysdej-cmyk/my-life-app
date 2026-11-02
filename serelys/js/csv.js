// Import d'une liste de crèches à contacter depuis un fichier CSV (Excel, Numbers, Google Sheets).
// Colonnes : priorité, entreprise, nom de la crèche, ville, mail, téléphone, site, pourquoi cette crèche.

const COLUMNS = ['priorite', 'entreprise', 'name', 'ville', 'mail', 'telephone', 'site', 'pourquoi'];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function parseCSV(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].map((c) => [c, firstLine.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

function headerMap(row) {
  const map = {};
  row.forEach((h, i) => {
    const n = norm(h);
    if (/prio/.test(n)) map.priorite = i;
    else if (/entreprise|societe|groupe|gestionnaire/.test(n)) map.entreprise = i;
    else if (/pourquoi|raison|motif/.test(n)) map.pourquoi = i;
    else if (/ville|commune/.test(n)) map.ville = i;
    else if (/mail/.test(n)) map.mail = i;
    else if (/tel|phone/.test(n)) map.telephone = i;
    else if (/site|web|url/.test(n)) map.site = i;
    else if (/nom|creche/.test(n)) map.name = i;
  });
  return Object.keys(map).length >= 3 ? map : null;
}

const priority = (v) => {
  const n = norm(v);
  if (/^(haute|h|1|high|forte|urgent)/.test(n)) return 'haute';
  if (/^(basse|b|3|low|faible)/.test(n)) return 'basse';
  return 'moyenne';
};

export const prospectKeys = (p) => [
  p.directorEmail ? `mail:${norm(p.directorEmail)}` : null,
  p.name ? `nom:${norm(p.name)}|${norm(p.ville)}` : null,
].filter(Boolean);

// Renvoie les nouvelles crèches à ajouter et le nombre de doublons ignorés.
export function importProspects(text, existing, today) {
  const rows = parseCSV(text);
  if (!rows.length) return { toAdd: [], duplicates: 0, skipped: 0 };
  const header = headerMap(rows[0]);
  const map = header || Object.fromEntries(COLUMNS.map((k, i) => [k, i]));
  const seen = new Set(existing.flatMap(prospectKeys));
  const toAdd = []; let duplicates = 0; let skipped = 0;
  for (const r of header ? rows.slice(1) : rows) {
    const get = (k) => (map[k] !== undefined ? r[map[k]] || '' : '');
    const p = {
      entreprise: get('entreprise'), name: get('name') || get('entreprise'), ville: get('ville'), directorEmail: get('mail'),
      telephone: get('telephone'), site: get('site'), pourquoi: get('pourquoi'), priorite: priority(get('priorite')),
      stage: 'a_contacter', stageChangedAt: today, createdAt: today,
    };
    if (!p.name) { skipped++; continue; }
    const keys = prospectKeys(p);
    if (keys.some((k) => seen.has(k))) { duplicates++; continue; }
    keys.forEach((k) => seen.add(k));
    toAdd.push(p);
  }
  return { toAdd, duplicates, skipped };
}
