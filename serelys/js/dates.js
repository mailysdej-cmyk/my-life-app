// Dates au format 'AAAA-MM-JJ' (jour civil, sans fuseau). Calculs en UTC pour éviter les décalages.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const pad = (n) => String(n).padStart(2, '0');
const toUTC = (d) => { const [y, m, j] = d.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, j)); };
const fromUTC = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
export const day = (d) => d.slice(0, 10);
export const ym = (d) => d.slice(0, 7);
export const dayOfMonth = (d) => Number(d.slice(8, 10));
export const timeOf = (d) => (d && d.length > 10 ? d.slice(11, 16) : null);
export const daysInMonth = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
export const firstOf = (m) => `${m}-01`;
export const lastOf = (m) => `${m}-${pad(daysInMonth(m))}`;
export const dateIn = (m, j) => `${m}-${pad(Math.min(j, daysInMonth(m)))}`;
export const addDays = (d, n) => { const dt = toUTC(d); dt.setUTCDate(dt.getUTCDate() + n); return fromUTC(dt); };
export const addMonthsYm = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
export const addMonths = (d, n) => dateIn(addMonthsYm(ym(d), n), dayOfMonth(d));
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const weekday = (d) => toUTC(d).getUTCDay(); // 0 = dimanche
export const mondayOf = (d) => addDays(d, -((weekday(d) + 6) % 7));
export const minD = (...ds) => ds.filter(Boolean).sort()[0] || null;
export const maxD = (...ds) => ds.filter(Boolean).sort().pop() || null;

export function monthsBetween(fromYm, toYm) {
  const out = [];
  for (let m = fromYm; m <= toYm; m = addMonthsYm(m, 1)) out.push(m);
  return out;
}

export const monthName = (m) => MOIS[Number(m.slice(5, 7)) - 1];
export const monthLabel = (m) => `${monthName(m)} ${m.slice(0, 4)}`;

// « lundi 3 novembre » (+ année si différente de l'année de référence)
export function fmtDate(d, refYear) {
  if (!isDate(d)) return '';
  const dt = toUTC(d);
  let s = `${JOURS[dt.getUTCDay()]} ${dt.getUTCDate() === 1 ? '1er' : dt.getUTCDate()} ${MOIS[dt.getUTCMonth()]}`;
  if (refYear && Number(refYear) !== dt.getUTCFullYear()) s += ` ${dt.getUTCFullYear()}`;
  const t = timeOf(d);
  if (t) s += ` à ${t.replace(':', ' h ')}`.replace(' h 00', ' h');
  return s;
}
export const fmtShort = (d) => { const dt = toUTC(d); return `${dt.getUTCDate() === 1 ? '1er' : dt.getUTCDate()} ${MOIS[dt.getUTCMonth()]}`; };

// Date et heure actuelles à Paris, quel que soit l'appareil ou le serveur
export function parisNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, hour: Number(p.hour), minute: Number(p.minute) };
}
