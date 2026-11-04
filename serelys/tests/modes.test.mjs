// Mode lancement / clientes actives, clientes test, « Demain », prospection, jauge.
// Données entièrement fictives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll, buildNotification, todayView, moneySummary, notifiable, crecheName, currentLaunchStep } from '../js/engine.js';

const TODAY = '2026-11-02'; // lundi
const testClient = { id: 'T', name: 'Les Essais', plan: 'confort', test: true, startDate: '2026-11-01', createdAt: '2026-10-01' };
const realClient = { id: 'R', name: 'Crèche Les Lucioles', plan: 'premium', startDate: '2026-11-01', createdAt: '2026-10-01' };
const base = (extra = {}) => ({
  settings: { trackingStart: '2026-10-01', aeCreationDate: '2026-10-01', launchSeeded: true, prospection: { enabled: false } },
  clients: [], prospects: [], manualTasks: [], taskState: {}, invoiceState: {},
  launch: [
    { id: 'site', label: 'Finir le site', order: 1, done: true },
    { id: 'melodie', label: 'Faire les tests avec Mélodie', order: 2 },
    { id: 'entreprise', label: 'Créer l’entreprise', order: 3 },
    { id: 'premiere-cliente', label: 'Trouver ma première cliente', order: 4 },
  ],
  ...extra,
});
const find = (all, key) => all.tasks.find((t) => t.key === key);

test('Noms des crèches dans les rappels', () => {
  assert.equal(crecheName('Les Lucioles'), 'la crèche Les Lucioles');
  assert.equal(crecheName('Crèche Les Lucioles'), 'la crèche Les Lucioles');
  assert.equal(crecheName('Micro-crèche Les Pitchouns'), 'la micro-crèche Les Pitchouns');
  assert.equal(crecheName('La crèche du Parc'), 'la crèche du Parc');
});

test('Mode lancement : aucune cliente réelle, la cliente test ne compte pas', () => {
  let all = computeAll(base({ clients: [testClient] }), TODAY);
  assert.equal(all.mode, 'lancement');
  assert.equal(currentLaunchStep(all.launch).label, 'Faire les tests avec Mélodie');
  assert.ok(!all.tasks.some((t) => t.key.startsWith('e:boite:')), 'pas de lecture de la boîte Serelys en mode lancement');
  // La cliente test a ses rappels et ils sont notifiés
  const infos = find(all, 'c:T:infos-mail:2026-11');
  assert.ok(infos && notifiable(infos, all.ctx));
  // Une vraie cliente → mode clientes actives
  all = computeAll(base({ clients: [testClient, realClient] }), TODAY);
  assert.equal(all.mode, 'clientes');
  assert.ok(find(all, `e:boite:${TODAY}`));
  // Elle arrête et sa fin est passée → retour au mode lancement
  all = computeAll(base({ clients: [{ ...realClient, stop: { requestDate: '2026-11-03', endDate: '2026-11-10' } }] }), '2026-11-20');
  assert.equal(all.mode, 'lancement');
});

test('Mode lancement : notifications seulement de l’étape en cours (+ clientes test)', () => {
  const s = base();
  let n = buildNotification(s, TODAY, 'summary', { weekly: true });
  assert.equal(n.body, 'Étape en cours : Faire les tests avec Mélodie', 'ni semaine, ni tâches d’entrepreneuse');
  assert.equal(buildNotification(s, TODAY, 'reminder'), null, 'pas de rappel à 10 h / 12 h pour l’étape');
  n = buildNotification(base({ clients: [testClient] }), '2026-11-05', 'summary');
  assert.match(n.body, /Étape en cours : Faire les tests avec Mélodie\nMa fiche du jour : \d+ tâches?(, dont \d+ en retard)?\n(• .*\n)*• Vérifier si j’ai reçu les infos du mois de la crèche Les Essais/);
});

test('Mode lancement : échéances légales et paiements, après « Créer l’entreprise » seulement', () => {
  // Urssaf d'octobre : rappel le 25 novembre, date limite le 30
  const before = computeAll(base(), '2026-11-27');
  const urssaf = find(before, 'e:urssaf:2026-10');
  assert.ok(urssaf.legal && urssaf.legalSoon);
  assert.equal(notifiable(urssaf, before.ctx), false, 'entreprise pas encore créée');
  const s = base();
  s.launch[2].done = true;
  const after = computeAll(s, '2026-11-27');
  assert.equal(notifiable(find(after, 'e:urssaf:2026-10'), after.ctx), true);
  assert.match(buildNotification(s, '2026-11-27', 'reminder').body, /Déclarer mon chiffre d’affaires d’octobre 2026 à l’Urssaf/);
  // CFE : seulement dans les 5 jours avant le 15 décembre
  const cfeEarly = computeAll(s, '2026-12-03');
  assert.equal(find(cfeEarly, 'e:cfe:2026').legalSoon, false);
  const cfeSoon = computeAll(s, '2026-12-11');
  assert.equal(find(cfeSoon, 'e:cfe:2026').legalSoon, true);
  // Tâche sans échéance légale : visible, jamais notifiée en mode lancement
  const prix = find(computeAll(s, '2026-11-01'), 'e:prix:2026');
  assert.ok(prix);
  assert.equal(notifiable(prix, computeAll(s, '2026-11-01').ctx), false);
});

test('« Demain » reporte sans mettre en retard', () => {
  const s = base({ clients: [realClient] });
  const key = 'c:R:infos-mail:2026-11';
  s.taskState[key] = { snoozedUntil: '2026-11-03' };
  let all = computeAll(s, TODAY);
  let v = todayView(all, TODAY);
  assert.ok(!v.today.some((t) => t.key === key) && !v.late.some((t) => t.key === key));
  all = computeAll(s, '2026-11-03');
  v = todayView(all, '2026-11-03');
  assert.ok(v.today.some((t) => t.key === key), 'revient le lendemain, dans « Aujourd’hui »');
  assert.ok(!v.late.some((t) => t.key === key));
});

test('Prospection : relance proposée après 7 jours en « Contactée »', () => {
  const s = base({ prospects: [
    { id: 'p1', name: 'Les Lucioles', stage: 'contactee', stageChangedAt: '2026-10-20' },
    { id: 'p2', name: 'Les Hiboux', stage: 'devis', stageChangedAt: '2026-10-01' },
  ] });
  const all = computeAll(s, TODAY);
  const r = find(all, 'p:p1:relance:2026-10-20');
  assert.equal(r.date, '2026-10-27');
  assert.equal(r.title, 'Relancer la crèche Les Lucioles par mail');
  assert.ok(!all.tasks.some((t) => t.prospectId === 'p2'), 'rien pour un devis envoyé');
});

test('Jauge : clientes qui ont payé (hors test) + celles en essai', () => {
  const paid = { ...realClient, id: 'R1' };
  const trial = { id: 'R2', name: 'Les Hiboux', plan: 'essentiel', offert: { enabled: true, start: '2026-11-01', end: '2026-11-30' }, createdAt: '2026-10-01' };
  const s = base({ clients: [paid, trial, { ...testClient }] });
  s.invoiceState['inv:R1:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-02', amount: 990 };
  s.invoiceState['inv:T:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-02', amount: 890 };
  const m = moneySummary(computeAll(s, '2026-11-10'), '2026-11-10');
  assert.equal(m.regularCount, 1);
  assert.equal(m.trialCount, 1);
  assert.equal(m.goal, 2);
  assert.equal(m.monthRev, 990, 'la facture de la cliente test ne compte pas');
  s.clients.push({ ...realClient, id: 'R3' });
  s.invoiceState['inv:R3:2026-11'] = { status: 'payee', sentAt: '2026-11-01', paidAt: '2026-11-03', amount: 990 };
  const m2 = moneySummary(computeAll(s, '2026-11-10'), '2026-11-10');
  assert.equal(m2.regularCount, 2);
  assert.equal(m2.goal, 5);
  assert.equal(m2.goalLabel, 'Remplacer mon salaire');
});

test('Rappels clairs : un verbe d’action, puis la crèche', () => {
  const s = base({ clients: [{ ...realClient, discoveryDate: '2026-10-20', quoteAccepted: '2026-10-22', signatureVisioDate: '2026-10-24T10:00', contractSignedDate: '2026-10-25',
    visios: { '2026-11': '2026-11-12T14:00' }, reunions: { '2026-11': '2026-11-18' }, addons: [] }] });
  const all = computeAll(s, '2026-10-20', { monthsAhead: 3 });
  const verbs = /^(Envoyer|Vérifier|Proposer|Préparer|Contrôler|Remplir|Livrer|Relancer|Faire|Noter|Planifier|Ajouter|Récupérer|Mettre|Demander|Présenter|Clôturer|Décider|Déclarer|Payer|Lire|Relire|Souscrire|Créer|Renouveler)\b/;
  const bad = all.tasks.filter((t) => !verbs.test(t.title)).map((t) => t.title);
  assert.deepEqual(bad, []);
  const withClient = all.tasks.filter((t) => t.clientId);
  assert.ok(withClient.every((t) => t.title.includes('la crèche Les Lucioles')), 'la crèche est toujours nommée');
});
