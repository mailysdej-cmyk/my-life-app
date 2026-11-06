// Fiches du jour, tâches récurrentes, prospection de la semaine (données fictives).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll, ficheView, recurringDates, describeFreq, buildNotification, weekMails } from '../js/engine.js';
import { migrate, STARTER_RECURRING } from '../js/migrate.js';

const real = (id, plan, name) => ({ id, name, plan, startDate: '2026-11-01', createdAt: '2026-10-01' });
const base = (extra = {}) => ({
  settings: { trackingStart: '2026-10-26', launchSeeded: true, aeCreated: true, prospection: { enabled: false } },
  clients: [], prospects: [], manualTasks: [], taskState: {}, invoiceState: {}, launch: [], recurring: [], ...extra,
});
const find = (all, key) => all.tasks.find((t) => t.key === key);

test('Fréquences des tâches récurrentes', () => {
  const dates = (freq, from = '2026-11-01', to = '2026-11-30') => recurringDates(freq, from, to).map((x) => x.date);
  assert.equal(dates({ type: 'daily' }).length, 30);
  assert.deepEqual(dates({ type: 'weekdays', weekdays: [1] }), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(dates({ type: 'monthly', monthDays: [1, 20] }), ['2026-11-01', '2026-11-20']);
  assert.deepEqual(recurringDates({ type: 'monthly', rangeFrom: 29, rangeTo: 1 }, '2026-11-01', '2026-11-30'),
    [{ date: '2026-10-29', due: '2026-11-01' }, { date: '2026-11-29', due: '2026-12-01' }], 'du 29 au 1er (celle d’octobre se termine le 1er novembre)');
  assert.deepEqual(dates({ type: 'interval', every: 2, unit: 'weeks', start: '2026-11-03' }), ['2026-11-03', '2026-11-17']);
  assert.deepEqual(dates({ type: 'interval', every: 10, unit: 'days', start: '2026-10-25' }), ['2026-11-04', '2026-11-14', '2026-11-24']);
  assert.deepEqual(dates({ type: 'once', date: '2026-11-12' }), ['2026-11-12']);
  assert.equal(describeFreq({ type: 'weekdays', weekdays: [5] }), 'Le vendredi');
  assert.equal(describeFreq({ type: 'monthly', rangeFrom: 1, rangeTo: 5 }), 'Chaque mois, du 1er au 5');
});

test('Tâches récurrentes liées aux clientes : seulement avec des clientes, selon le forfait', () => {
  const recurring = STARTER_RECURRING.map((r) => ({ ...r }));
  let all = computeAll(base({ recurring }), '2026-11-04');
  assert.ok(!all.tasks.some((t) => t.key.startsWith('r:validation-newsletter')), 'aucune cliente → rien');
  assert.ok(find(all, 'r:resume-semaine:2026-11-06'), 'résumé du vendredi');
  assert.ok(find(all, 'r:liste-claude:2026-11-09'), 'liste de Claude le lundi');
  all = computeAll(base({ recurring, clients: [real('E', 'essentiel', 'Les Abeilles'), real('C', 'confort', 'Les Lucioles')] }), '2026-11-04');
  const v = find(all, 'r:validation-newsletter:C:2026-11-25');
  assert.equal(v.title, 'Vérifier que la crèche Les Lucioles a validé la newsletter');
  assert.equal(find(all, 'r:validation-newsletter:E:2026-11-25'), undefined, 'Confort et Premium seulement');
  // Sans {creche} dans le titre, la crèche est ajoutée à la fin
  all = computeAll(base({ clients: [real('C', 'confort', 'Les Lucioles')], recurring: [{ id: 'x', title: 'Appeler la directrice', scope: 'clients', freq: { type: 'weekdays', weekdays: [3] } }] }), '2026-11-04');
  assert.equal(find(all, 'r:x:C:2026-11-04').title, 'Appeler la directrice pour la crèche Les Lucioles');
});

test('Fiche du jour : non cochée hier → aujourd’hui, en retard ; fiches à l’avance', () => {
  const s = base({ recurring: [{ id: 'd', title: 'Ranger mon bureau', scope: 'me', freq: { type: 'daily' } }, { id: 'v', title: 'Faire le résumé de ma semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [5] } }] });
  s.taskState['r:d:2026-11-04'] = { done: true };
  const all = computeAll(s, '2026-11-05');
  const today = ficheView(all, '2026-11-05', '2026-11-05');
  assert.ok(today.late.some((t) => t.key === 'r:d:2026-11-03'), 'pas cochée mardi → en retard jeudi');
  assert.ok(!today.late.some((t) => t.key === 'r:d:2026-11-04'), 'cochée mercredi');
  assert.ok(today.items.some((t) => t.key === 'r:d:2026-11-05'));
  const friday = ficheView(all, '2026-11-06', '2026-11-05');
  assert.deepEqual(friday.items.map((t) => t.title).sort(), ['Faire le résumé de ma semaine', 'Ranger mon bureau']);
  assert.equal(friday.late.length, 0, 'le retard n’apparaît que sur la fiche d’aujourd’hui');
});

test('Travail du mois réparti sur les jours ouvrés', () => {
  const clients = ['A', 'B', 'C', 'D'].map((x) => ({ ...real(x, 'premium', `Crèche ${x}`) }));
  const all = computeAll(base({ clients }), '2026-11-04', { monthsAhead: 1 });
  const prog = all.tasks.filter((t) => t.rule === 'programme' && t.month === '2026-11');
  assert.equal(prog.length, 4);
  for (const t of prog) {
    assert.ok(t.plan >= '2026-11-05' && t.plan <= '2026-11-20', 'dans la plage');
    assert.ok(![0, 6].includes(new Date(`${t.plan}T12:00:00Z`).getUTCDay()), 'un jour de semaine');
  }
  assert.ok(new Set(prog.map((t) => t.plan)).size > 1, 'pas toutes le même jour');
  // Livraison : du 29 au 1er
  const liv = all.tasks.find((t) => t.rule === 'livraison' && t.clientId === 'A' && t.month === '2026-11');
  assert.equal(liv.date, '2026-11-29'); assert.equal(liv.due, '2026-12-01');
});

test('Prospection : 5 par jour, ce qui manque est reporté dans la semaine', () => {
  const s = base();
  s.settings.prospection = { enabled: true, goal: 25, mode: 'quotidien', url: 'https://example.org/bibliotheque' };
  s.taskState['pm:2026-11-02'] = { sent: 3 };   // lundi : 3 sur 5
  s.taskState['pm:2026-11-03'] = { sent: 5 };   // mardi : 5 sur 7
  const all = computeAll(s, '2026-11-04');      // mercredi
  const wed = find(all, 'pm:2026-11-04');
  assert.equal(wed.title, 'Prospection : 7 mails', '5 + les 2 qui manquent');
  assert.equal(wed.link, 'https://example.org/bibliotheque');
  assert.equal(find(all, 'pm:2026-11-05').title, 'Prospection : 5 mails');
  assert.ok(!ficheView(all, '2026-11-04', '2026-11-04').late.some((t) => t.prosp), 'pas de doublon en retard');
  assert.equal(weekMails(all.ctx, '2026-11-04').missing, 17);
});

test('Prospection en un bloc : 25 le jour choisi, puis reporté au lendemain', () => {
  const s = base();
  s.settings.prospection = { enabled: true, goal: 25, mode: 'bloc', blocDay: 1 };
  s.taskState['pm:2026-11-02'] = { sent: 10 };
  const all = computeAll(s, '2026-11-03');
  assert.equal(find(all, 'pm:2026-11-03').title, 'Prospection : 15 mails');
  assert.equal(find(all, 'pm:2026-11-04'), undefined, 'rien de prévu les autres jours');
  const done = computeAll(s, '2026-11-02');
  assert.equal(find(done, 'pm:2026-11-02').done, false);
  s.taskState['pm:2026-11-02'] = { sent: 25 };
  assert.equal(find(computeAll(s, '2026-11-02'), 'pm:2026-11-02').done, true);
});

test('Notifications : 8 h résumé de la fiche, vendredi 12 h mails manquants', () => {
  const s = base({ recurring: [{ id: 'v', title: 'Faire le résumé de ma semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [5] } }] });
  s.settings.trackingStart = '2026-11-06';
  s.settings.prospection = { enabled: true, goal: 25, mode: 'quotidien' };
  s.taskState['pm:2026-11-02'] = { sent: 5 };
  s.taskState['pm:2026-11-03'] = { sent: 5 };
  s.taskState['pm:2026-11-04'] = { sent: 5 };
  s.taskState['pm:2026-11-05'] = { sent: 2 };
  const morning = buildNotification(s, '2026-11-06', 'summary');
  assert.match(morning.body, /^Étape en cours|^Ma fiche du jour : 2 tâches/);
  assert.match(morning.body, /• Prospection : 8 mails/);
  assert.match(morning.body, /• Faire le résumé de ma semaine/);
  const noon = buildNotification(s, '2026-11-06', 'reminder', { weekCheck: true });
  assert.match(noon.body, /Prospection : il manque 8 mails pour arriver à 25 cette semaine\./);
  // Objectif atteint et tout coché → rien à 12 h
  s.taskState['pm:2026-11-06'] = { sent: 8 };
  s.taskState['r:v:2026-11-06'] = { done: true };
  assert.equal(buildNotification(s, '2026-11-06', 'reminder', { weekCheck: true }), null);
});

test('Mise à jour des données v2 → v3 : sauvegarde, puis tâches de départ, rien de perdu', () => {
  const items = {
    settings: { main: { trackingStart: '2026-10-19', dataVersion: 2, launchSeeded: true, libraryUrl: 'https://example.org' } },
    prospect: { p1: { name: 'Les Lucioles', stage: 'devis' } },
    recurring: { 'resume-semaine': { title: 'Mon résumé à moi', scope: 'me', freq: { type: 'weekdays', weekdays: [4] } } },
  };
  const w = migrate(items, '2026-11-04');
  assert.equal(w[0].kind, 'backup');
  assert.ok(!w.some((x) => x.kind === 'prospect'), 'les prospects ne bougent pas');
  const rec = w.filter((x) => x.kind === 'recurring').map((x) => x.id).sort();
  assert.deepEqual(rec, ['liste-claude', 'validation-newsletter'], 'ma version modifiée est gardée');
  const st = w.find((x) => x.kind === 'settings').data;
  assert.equal(st.dataVersion, 3);
  assert.equal(st.libraryUrl, 'https://example.org');
  assert.deepEqual(st.prospection, { enabled: true, goal: 25, mode: 'quotidien', blocDay: 1 });
});

test('Une tâche récurrente ne crée pas de retard avant le jour de sa création', () => {
  const s = base({ recurring: [
    { id: 'v', title: 'Faire le résumé de ma semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [5] }, createdAt: '2026-11-04T10:00:00Z' },
    { id: 'l', title: 'Demander à Claude la liste de la semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [1] }, createdAt: '2026-11-04T10:00:00Z' },
  ] });
  s.settings.trackingStart = '2026-10-19';
  const all = computeAll(s, '2026-11-06');
  const fiche = ficheView(all, '2026-11-06', '2026-11-06');
  assert.deepEqual(fiche.late.filter((t) => t.recurringId).map((t) => t.key), [], 'ni le 23 octobre, ni le 26 octobre, ni le 2 novembre');
  assert.ok(fiche.items.some((t) => t.key === 'r:v:2026-11-06'), 'le résumé de ce vendredi est bien là');
  assert.ok(find(all, 'r:l:2026-11-09'), 'la liste de Claude commence lundi prochain');
});
