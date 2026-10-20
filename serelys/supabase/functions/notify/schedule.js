// Décide quelles notifications envoyer à un instant donné (heure de Paris).
// Le programme passe toutes les 15 minutes : chaque envoi a une fenêtre d'une heure
// et n'est fait qu'une fois par jour (journal « sent »), même si un passage est en retard.

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');
export const plusMinutes = (t, n) => { const x = Math.min(toMin(t) + n, 24 * 60 - 1); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };

// now = { date: 'AAAA-MM-JJ', time: 'HH:MM', weekday: 0..6 (0 = dimanche) }
export function dueSlots(now, times, log = {}) {
  const sent = log.sent || {};
  const out = [];
  const inWindow = (t) => toMin(now.time) >= toMin(t) && toMin(now.time) < toMin(t) + 60;
  const want = (kind, t) => { const k = `${kind}:${t}`; if (inWindow(t) && sent[k] !== now.date) out.push({ kind, slot: t, logKey: k }); };
  want('summary', times.summary);
  if (now.weekday === 1) want('weekly', times.weekly || times.summary);
  for (const t of times.reminders || []) want('reminder', t);
  return out;
}

export function markSent(log, now, keys) {
  const sent = { ...(log.sent || {}) };
  for (const k of keys) sent[k] = now.date;
  return { ...log, sent };
}

// Visios : rappel quand il reste 60 minutes ou moins, une seule fois par visio.
export function dueEvents(now, events, log = {}) {
  const done = log.events || {};
  return events.filter((e) => !done[e.key] && toMin(e.time) - toMin(now.time) <= 60 && toMin(e.time) > toMin(now.time));
}

export function markEvents(log, now, keys) {
  const events = {};
  for (const [k, d] of Object.entries(log.events || {})) if (d >= now.date) events[k] = d; // on oublie les jours passés
  for (const k of keys) events[k] = now.date;
  return { ...log, events };
}
