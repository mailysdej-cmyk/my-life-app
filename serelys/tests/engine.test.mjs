// Tests du moteur de règles : node --test tests/
// Données entièrement fictives (« Crèche Test … »).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll, buildNotification, clientStage, moneySummary, todayView, onboardingProgress } from '../js/engine.js';
import { fmtDate } from '../js/dates.js';

const TODAY = '2026-10-19';

function baseState() {
  return {
    settings: { trackingStart: '2026-10-19', aeCreated: true, aeCreationDate: '2026-09-01' },
    clients: [
      { id: 'A', name: 'Crèche Test Essentiel', plan: 'essentiel', style: 'classique', createdAt: TODAY,
        discoveryDate: '2026-10-20T10:00', quoteAccepted: '2026-10-22', signatureVisioDate: '2026-10-24T14:00', contractSignedDate: '2026-10-25',
        offert: { enabled: true, start: '2026-11-01', end: '2026-11-30' } },
      { id: 'B', name: 'Crèche Test Confort', plan: 'confort', style: 'doux', createdAt: TODAY, startDate: '2026-11-01', contractSignedDate: '2026-10-20',
        addons: [{ service: 'visio', trialEnd: '2026-12-31' }] },
      { id: 'C', name: 'Crèche Test Premium', plan: 'premium', style: 'perso', createdAt: TODAY, startDate: '2026-11-01', contractSignedDate: '2026-10-21',
        marraineId: 'B', reunions: { '2026-11': '2026-11-18' }, visios: { '2026-11': '2026-11-12T14:00' } },
    ],
    taskState: {}, invoiceState: {}, prospects: [], manualTasks: [],
  };
}

const run = (state, today = TODAY) => computeAll(state, today, { monthsAhead: 3 });
const tasksOf = (all, id) => all.tasks.filter((t) => t.clientId === id && !t.hidden);
const find = (all, key) => all.tasks.find((t) => t.key === key);
const inv = (all, id, m) => all.invoices.find((i) => i.clientId === id && i.month === m);

test('Essentielle en mois offert : tâches mensuelles aux bonnes dates', () => {
  const all = run(baseState());
  const t = tasksOf(all, 'A');
  const dates = (rule) => t.filter((x) => x.rule === rule).map((x) => x.date);
  assert.deepEqual(dates('infos-mail'), ['2026-11-01', '2026-12-01', '2027-01-01']);
  assert.deepEqual(dates('infos-recues'), ['2026-11-05', '2026-12-05', '2027-01-05']);
  assert.deepEqual(dates('moteurs'), ['2026-11-07', '2026-12-07', '2027-01-07']);
  assert.deepEqual(dates('livraison'), ['2026-11-29', '2026-12-29', '2027-01-29']);
  assert.equal(dates('programme').length, 0, 'pas de programme en Essentiel');
  assert.equal(find(all, 'c:A:moteurs:2026-11').items.length, 6);
  // Pas de facture pendant le mois offert ; 1re facture le 1er décembre à 499 €
  assert.equal(inv(all, 'A', '2026-11'), undefined);
  assert.equal(inv(all, 'A', '2026-12').date, '2026-12-01');
  assert.equal(inv(all, 'A', '2026-12').amount, 499);
  assert.equal(find(all, 'c:A:offert-fin').date, '2026-11-25');
  assert.equal(find(all, 'c:A:ob:oneshots').date, '2026-12-01');
  assert.equal(find(all, 'c:A:ob:oneshots').items.length, 3);
  assert.equal(find(all, 'c:A:ob:devis').date, '2026-10-21');
  assert.equal(find(all, 'c:A:parrainage').date, '2026-12-31');
  assert.equal(clientStage(baseState().clients[0], '2026-11-10'), 'offert');
  assert.equal(clientStage(baseState().clients[0], '2026-12-10'), 'active');
  assert.equal(clientStage(baseState().clients[0], TODAY), 'setup');
});

test('Confort avec une prestation ajoutée à l’essai : 890 puis 980 après l’essai', () => {
  const all = run(baseState());
  assert.equal(inv(all, 'B', '2026-11').amount, 890);
  assert.equal(inv(all, 'B', '2026-12').amount, 890);
  assert.equal(inv(all, 'B', '2027-01').amount, 980);
  assert.equal(find(all, 'c:B:essai:visio').date, '2026-12-26');
  const t = tasksOf(all, 'B');
  const prog = t.find((x) => x.key === 'c:B:programme:2026-11');
  assert.equal(prog.date, '2026-11-05'); assert.equal(prog.due, '2026-11-20');
  assert.match(prog.title, /décembre/);
  const nl = find(all, 'c:B:newsletter-prep:2026-11');
  assert.equal(nl.date, '2026-11-20'); assert.equal(nl.due, '2026-11-24');
  assert.equal(find(all, 'c:B:newsletter-check:2026-11'), undefined);
  assert.equal(find(all, 'c:B:newsletter-check:2026-12').date, '2026-12-02');
  assert.ok(find(all, 'c:B:visio-proposer:2026-11'), 'la visio ajoutée crée la tâche du 1er');
  assert.equal(find(all, 'c:B:moteurs:2026-11').items.length, 7, 'Essentiel + newsletter');
  assert.equal(find(all, 'c:B:livraison:2027-02'), undefined, 'horizon de 3 mois');
  // février : livraison le 28
  const allFeb = computeAll(baseState(), '2027-01-15', { monthsAhead: 1 });
  assert.equal(find(allFeb, 'c:B:livraison:2027-02').date, '2027-02-28');
});

test('Premium filleule : 990 − 50 sur la 1re facture, tâches Premium', () => {
  const all = run(baseState());
  assert.equal(inv(all, 'C', '2026-11').amount, 940);
  assert.equal(inv(all, 'C', '2026-12').amount, 990);
  const rp = find(all, 'c:C:reunion-prep:2026-11');
  assert.equal(rp.date, '2026-11-05'); assert.equal(rp.due, '2026-11-25');
  assert.equal(find(all, 'c:C:cr:2026-11').date, '2026-11-20');
  const v = find(all, 'c:C:visio:2026-11');
  assert.equal(v.date, '2026-11-12'); assert.equal(v.time, '14:00');
  assert.equal(find(all, 'c:C:visio-proposer:2026-11').done, true, 'date de visio saisie');
  assert.equal(find(all, 'c:C:visio-proposer:2026-12').done, false);
  assert.equal(find(all, 'c:C:echeances-check:2026-12').date, '2026-12-07');
  assert.equal(find(all, 'c:C:moteurs:2026-11').items.length, 8, 'mêmes + newsletter + événements (suivi des échéances pas encore actif)');
  const os = find(all, 'c:C:ob:oneshots');
  assert.ok(!os.items.some((i) => i.id === 'filleule'), 'Premium : remise de 50 € à la place');
  assert.equal(os.items.length, 8, '8 documents uniques en Premium');
  assert.equal(find(all, 'c:C:ob:apercu').date, '2026-11-01', 'style personnalisé : tâche séparée');
  assert.equal(find(all, 'c:C:newsletter-check:2026-11'), undefined, 'pas de vérification de newsletter le 1er mois');
  assert.equal(find(all, 'c:C:newsletter-check:2026-12').date, '2026-12-02');
});

test('Parrainage : 150 € chez la marraine après paiement de la 1re facture de la filleule', () => {
  const s = baseState();
  let all = run(s);
  assert.equal(inv(all, 'B', '2026-12').amount, 890, 'pas encore de remise');
  s.invoiceState['inv:C:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-10', amount: 940 };
  all = run(s);
  const dec = inv(all, 'B', '2026-12');
  assert.equal(dec.amount, 740);
  assert.ok(dec.discounts.some((d) => d.kind === 'marraine' && d.amount === 150));
  assert.equal(inv(all, 'B', '2027-01').amount, 980, 'remise utilisée une seule fois');
  // Report : 2 filleules = 300 € de remise sur une facture de 890 → 0 € puis report
  s.clients.push({ id: 'D', name: 'Crèche Test D', plan: 'premium', createdAt: TODAY, startDate: '2026-11-01', marraineId: 'B' });
  s.invoiceState['inv:D:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-12', amount: 940 };
  s.invoiceState['inv:B:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-05', amount: 890 };
  all = run(s);
  assert.equal(inv(all, 'B', '2026-12').amount, 590);
});

test('Changer de forfait ou échanger une prestation recalcule tout', () => {
  const s = baseState();
  s.clients[0].plan = 'confort';
  let all = run(s);
  assert.equal(inv(all, 'A', '2026-12').amount, 890);
  assert.ok(find(all, 'c:A:programme:2026-11'));
  assert.equal(find(all, 'c:A:ob:oneshots').items.length, 5);
  // Échange chez la Confort : récap des heures → suivi des échéances (prix inchangé)
  s.clients[1].swaps = [{ remove: 'heures', add: 'echeances' }];
  all = run(s);
  const mot = find(all, 'c:B:moteurs:2026-11').items.map((i) => i.label);
  assert.ok(!mot.some((l) => /heures/.test(l)));
  assert.ok(find(all, 'c:B:echeances-check:2026-11'));
  assert.equal(inv(all, 'B', '2027-01').amount, 980);
  // Ce qui a été coché reste coché
  s.taskState['c:B:programme:2026-11'] = { done: true, doneAt: '2026-11-18' };
  s.clients[1].addons = [];
  all = run(s);
  assert.equal(find(all, 'c:B:programme:2026-11').done, true);
  assert.equal(inv(all, 'B', '2027-01').amount, 890);
});

test('Infos du mois : « non » crée la relance puis le rappel du 7', () => {
  const s = baseState();
  s.taskState['c:B:infos-recues:2026-11'] = { answer: 'non', answeredAt: '2026-11-05' };
  let all = run(s, '2026-11-05');
  assert.equal(find(all, 'c:B:infos-recues:2026-11:relance').date, '2026-11-05');
  all = run(s, '2026-11-07');
  const v = todayView(all, '2026-11-07');
  assert.ok(v.today.some((t) => t.key === 'c:B:infos-recues:2026-11:relance7'));
  assert.ok(!v.late.some((t) => t.key === 'c:B:infos-recues:2026-11:relance'), 'pas de doublon');
  s.taskState['c:B:infos-recues:2026-11:relance'] = { done: true, doneAt: '2026-11-06' };
  all = run(s, '2026-11-07');
  assert.equal(find(all, 'c:B:infos-recues:2026-11:relance7'), undefined);
});

test('Factures : rappel à l’échéance et alerte à +15 jours', () => {
  const s = baseState();
  s.invoiceState['inv:B:2026-11'] = { status: 'envoyee', sentAt: '2026-11-01', amount: 890 };
  const all = run(s, '2026-12-17');
  assert.equal(find(all, 'inv:B:2026-11:rappel').date, '2026-12-01');
  assert.equal(find(all, 'inv:B:2026-11:retard').date, '2026-12-16');
  assert.equal(inv(all, 'B', '2026-11').late, true);
  assert.equal(find(all, 'inv:C:2026-11:rappel'), undefined, 'pas de rappel tant que la facture n’est pas envoyée');
  assert.equal(find(all, 'c:C:facture:2026-11').late, true, 'la tâche « Envoyer la facture » passe en retard');
});

test('Arrêt : préavis d’un mois, prorata, clôture ; sans préavis pendant le mois offert', () => {
  const s = baseState();
  s.clients[1].stop = { requestDate: '2027-01-10' };
  let all = run(s, '2027-01-12');
  const feb = inv(all, 'B', '2027-02');
  assert.equal(feb.prorata.served, 10);
  assert.equal(feb.amount, Math.round(980 * 10 / 28 * 100) / 100);
  assert.equal(inv(all, 'B', '2027-03'), undefined);
  const cl = find(all, 'c:B:cloture');
  assert.equal(cl.date, '2027-02-11'); assert.equal(cl.due, '2027-03-12'); assert.equal(cl.items.length, 5);
  assert.equal(clientStage(s.clients[1], '2027-01-12'), 'preavis');
  assert.equal(clientStage(s.clients[1], '2027-02-12'), 'ancienne');
  s.clients[0].stop = { requestDate: '2026-11-20' };
  all = run(s, '2026-11-21');
  assert.equal(all.invoices.filter((i) => i.clientId === 'A').length, 0, 'aucune facture');
  assert.equal(find(all, 'c:A:cloture').date, '2026-11-21');
});

test('Devis bloqué sans SIRET', () => {
  const s = baseState(); s.settings.aeCreated = false;
  assert.ok(find(run(s), 'c:A:ob:devis').blocked);
});

test('Mes tâches : Urssaf, Zapier, ACRE, facture électronique', () => {
  const s = baseState();
  const all = computeAll(s, TODAY, { monthsAhead: 9 });
  const u = find(all, 'e:urssaf:2026-10');
  assert.equal(u.due, '2026-11-30'); assert.equal(u.date, '2026-11-25');
  assert.ok(find(all, 'e:zapier:2026-11'));
  assert.equal(find(all, 'e:facture-electronique').date, '2027-06-01');
  s.settings.urssafPeriod = 'trimestriel';
  s.settings.aeCreationDate = '2026-10-10';
  const q = computeAll(s, TODAY, { monthsAhead: 4 });
  assert.equal(find(q, 'e:urssaf:2026-T4').due, '2027-01-31');
  const acre = q.tasks.filter((t) => t.stateKey === 'e:acre');
  assert.deepEqual(acre.map((t) => t.date), ['2026-10-17', '2026-11-09', '2026-11-29']);
  assert.equal(acre.filter((t) => !t.hidden).length, 1);
});

test('Argent : chiffre encaissé, cotisations, objectif clientes régulières', () => {
  const s = baseState();
  s.invoiceState['inv:C:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-10', amount: 940 };
  const m = moneySummary(run(s, '2026-11-20'), '2026-11-20');
  assert.equal(m.monthRev, 940);
  assert.equal(m.urssafEstimateMonth, 245.34);
  assert.equal(m.regularCount, 1);
  assert.equal(m.tvaAlert, false);
});

test('Mise en place : barre de progression', () => {
  const s = baseState();
  let p = onboardingProgress(run(s), 'A');
  assert.equal(p.done, 2, 'devis et planification déjà faits (dates saisies)');
  s.clients[0].howKnown = 'Bouche à oreille';
  s.taskState['c:A:ob:pdf'] = { done: true };
  p = onboardingProgress(run(s), 'A');
  assert.equal(p.done, 4);
});

test('Notifications : résumé à 8 h, rappels seulement s’il reste des tâches', () => {
  const s = baseState();
  const sum = buildNotification(s, '2026-11-05', 'summary');
  assert.match(sum.title, /jeudi 5 novembre/);
  assert.match(sum.body, /Aujourd’hui : \d+ tâches/);
  const rem = buildNotification(s, '2026-11-05', 'reminder');
  assert.ok(rem);
  // Tout coché ce jour-là, rien en retard → pas de rappel
  const all = run(s, '2026-11-05');
  for (const t of all.tasks) if (t.date <= '2026-11-05') s.taskState[t.stateKey] = { done: true, doneAt: '2026-11-05' };
  for (const i of all.invoices) if (i.date <= '2026-11-05') s.invoiceState[i.key] = { status: 'payee', sentAt: i.date, paidAt: i.date, amount: i.amount };
  assert.equal(buildNotification(s, '2026-11-05', 'reminder'), null);
  const w = buildNotification(baseState(), '2026-11-09', 'weekly');
  assert.match(w.body, /Cette semaine/);
  assert.match(w.body, /visio/);
});

test('Dates en français', () => {
  assert.equal(fmtDate('2026-11-03'), 'mardi 3 novembre');
  assert.equal(fmtDate('2026-11-01'), 'dimanche 1er novembre');
  assert.equal(fmtDate('2026-11-12T14:00'), 'jeudi 12 novembre à 14 h');
});
