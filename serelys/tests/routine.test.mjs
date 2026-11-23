// Routine « visibilité et prospection » (données fictives).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll, ficheView, buildNotification } from '../js/engine.js';
import { migrate, ROUTINE, STARTER_RECURRING } from '../js/migrate.js';

const recurring = [...STARTER_RECURRING, ...ROUTINE].map((r) => ({ scope: 'me', routine: !r.id.startsWith('resume') && !r.id.startsWith('liste') && !r.id.startsWith('validation'), ...r, createdAt: '2026-11-20T08:00:00Z' }));
const state = ({ site = false, entreprise = false } = {}) => ({
  settings: { trackingStart: '2026-11-20', launchSeeded: true, siteOnline: site, aeCreated: entreprise, libraryUrl: 'https://example.org/bibliotheque',
    prospection: { enabled: true, goal: 25, mode: 'quotidien' } },
  clients: [], prospects: [], manualTasks: [], taskState: {}, invoiceState: {}, launch: [], recurring,
});
const titles = (s, d, today = d) => ficheView(computeAll(s, today), d, today).items.map((t) => t.title);
const MON = '2026-11-23'; const TUE = '2026-11-24'; const WED = '2026-11-25'; const THU = '2026-11-26'; const FRI = '2026-11-27';

test('Rien de la routine tant que le site n’est pas en ligne et l’entreprise pas créée', () => {
  const t = titles(state(), MON);
  assert.ok(!t.some((x) => /mails de prospection|relances|LinkedIn|Instagram|Facebook|Google|point de la semaine/.test(x)), t.join(' | '));
  assert.ok(t.includes('Demander à Claude la liste de la semaine'), 'ce qui existait déjà reste');
});

test('Entreprise créée : mails, relances et point du vendredi (pas encore les réseaux)', () => {
  const s = state({ entreprise: true });
  const t = titles(s, MON);
  assert.ok(t.includes('Envoyer 5 nouveaux mails de prospection'));
  assert.ok(t.includes('Faire les relances de prospection'));
  assert.ok(!t.some((x) => /LinkedIn|Instagram|Facebook/.test(x)));
  assert.ok(titles(s, FRI, MON).includes('Faire le point de la semaine'));
  const point = computeAll(s, FRI).tasks.find((x) => x.key === `r:routine-point:${FRI}`);
  assert.equal(point.link, 'https://example.org/bibliotheque', 'le bouton ouvre ma Bibliothèque');
});

test('Site en ligne et entreprise créée : la routine complète, dans l’ordre', () => {
  const s = state({ site: true, entreprise: true });
  const mon = titles(s, MON);
  const routine = mon.filter((x) => /mails de prospection|relances|LinkedIn|Instagram|Facebook|Google/.test(x));
  assert.deepEqual(routine, [
    'Envoyer 5 nouveaux mails de prospection',
    'Faire les relances de prospection',
    'Ajouter 2 à 4 directrices ou gestionnaires de crèches sur LinkedIn',
    'Suivre 2 ou 3 comptes de crèches ou de pros de la petite enfance sur Instagram (optionnel)',
    'Passer 10 à 15 min dans les groupes Facebook petite enfance',
    'Créer mon profil LinkedIn',
    'Créer ma fiche Google Business Profile',
    'Rejoindre 3 à 5 groupes Facebook petite enfance',
    'Créer le compte Instagram Serelys',
  ]);
  assert.equal(routine[0], 'Envoyer 5 nouveaux mails de prospection');
  assert.equal(routine[1], 'Faire les relances de prospection');
  assert.ok(mon.indexOf('Demander à Claude la liste de la semaine') < mon.indexOf('Envoyer 5 nouveaux mails de prospection'), 'les tâches existantes passent avant la routine');
  assert.ok(titles(s, TUE, MON).includes('Publier le post de la semaine sur LinkedIn'));
  assert.ok(titles(s, WED, MON).includes('Écrire 2 ou 3 commentaires utiles sous des posts LinkedIn'));
  assert.ok(titles(s, THU, MON).includes('Passer 10 à 15 min dans les groupes Facebook petite enfance'));
  assert.ok(!titles(s, TUE, MON).includes('Passer 10 à 15 min dans les groupes Facebook petite enfance'));
  assert.ok(titles(s, FRI, MON).includes('Faire le point de la semaine'));
  assert.ok(!titles(s, '2026-11-28', MON).some((x) => /LinkedIn|relances/.test(x)), 'rien le samedi');
});

test('Tâches à faire une seule fois : sur la fiche du jour jusqu’à ce que je les coche, puis disparaissent', () => {
  const s = state({ site: true, entreprise: true });
  assert.ok(titles(s, MON).includes('Créer mon profil LinkedIn'));
  assert.ok(titles(s, TUE).includes('Créer mon profil LinkedIn'), 'le lendemain, toujours là (sans être « en retard »)');
  assert.ok(!ficheView(computeAll(s, TUE), TUE, TUE).late.some((t) => t.todo));
  s.taskState['r:une-fois-linkedin'] = { done: true, doneAt: '2026-11-24T09:00:00Z' };
  assert.ok(!titles(s, TUE).includes('Créer mon profil LinkedIn'), 'cochée → disparaît');
  assert.ok(!titles(s, WED).includes('Créer mon profil LinkedIn'));
});

test('Notification de 8 h avec la routine', () => {
  const s = state({ site: true, entreprise: true });
  const n = buildNotification(s, TUE, 'summary');
  assert.match(n.body, /Ma fiche du jour : \d+ tâches/);
  assert.match(n.body, /• /);
});

test('Mise à jour des données : la routine est ajoutée, rien n’est supprimé ni remplacé', () => {
  const items = {
    settings: { main: { dataVersion: 3, trackingStart: '2026-10-19', launchSeeded: true, aeCreated: false } },
    recurring: { 'routine-post': { title: 'Ma version du post', scope: 'me', freq: { type: 'weekdays', weekdays: [4] } }, 'resume-semaine': { title: 'Faire le résumé de ma semaine', scope: 'me', freq: { type: 'weekdays', weekdays: [5] } } },
    prospect: { p1: { name: 'Les Lucioles', stage: 'contactee' } },
  };
  const w = migrate(items, MON);
  assert.equal(w[0].kind, 'backup');
  const added = w.filter((x) => x.kind === 'recurring').map((x) => x.id);
  assert.equal(added.length, ROUTINE.length - 1, 'ma version de « post » est gardée');
  assert.ok(!added.includes('resume-semaine'));
  assert.ok(!w.some((x) => x.data === null || x.kind === 'prospect'));
  const st = w.find((x) => x.kind === 'settings').data;
  assert.equal(st.siteOnline, false);
  assert.equal(st.dataVersion, 4);
});
