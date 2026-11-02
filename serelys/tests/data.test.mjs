// Migration des données et import CSV (données fictives).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, DATA_VERSION } from '../js/migrate.js';
import { parseCSV, importProspects } from '../js/csv.js';

test('Migration : copie de sauvegarde d’abord, rien de supprimé, une seule fois', () => {
  const items = {
    settings: { main: { trackingStart: '2026-10-19', aeCreated: false } },
    client: { c1: { name: 'Crèche A', plan: 'confort' } },
    prospect: {
      p1: { name: 'Les Lucioles', stage: 'signee', firstContact: '2026-10-01' },
      p2: { name: 'Les Hiboux', stage: 'devis', firstContact: '2026-10-05' },
      p3: { name: 'Les Abeilles', stage: 'a_contacter' },
    },
    card: { k1: { q: 'Question ?', a: 'Réponse.' } },
    push: { x: { device: 'iPhone' } },
  };
  const w = migrate(items, '2026-11-02');
  assert.equal(w[0].kind, 'backup', 'la sauvegarde passe en premier');
  assert.deepEqual(Object.keys(w[0].data.items).sort(), ['card', 'client', 'prospect', 'settings']);
  assert.equal(w[0].data.items.prospect.p1.stage, 'signee', 'la sauvegarde garde l’état d’avant');
  const pr = Object.fromEntries(w.filter((x) => x.kind === 'prospect').map((x) => [x.id, x.data]));
  assert.equal(pr.p1.stage, 'cliente');
  assert.equal(pr.p2.stage, 'devis', '« Devis envoyé » reste « Devis envoyé »');
  assert.equal(pr.p2.stageChangedAt, '2026-10-05');
  assert.equal(pr.p3.stageChangedAt, '2026-11-02');
  assert.equal(pr.p1.name, 'Les Lucioles');
  assert.equal(w.filter((x) => x.kind === 'launch').length, 4);
  const st = w.find((x) => x.kind === 'settings').data;
  assert.equal(st.dataVersion, DATA_VERSION);
  assert.equal(st.trackingStart, '2026-10-19');
  assert.equal(st.aeCreated, false);
  assert.ok(!w.some((x) => x.data === null), 'aucune suppression');
  // Une fois faite, elle ne se refait pas
  assert.deepEqual(migrate({ ...items, settings: { main: st } }, '2026-11-03'), []);
});

test('CSV : séparateur point-virgule (Excel), guillemets, accents', () => {
  const rows = parseCSV('﻿Priorité;Entreprise;Nom de la crèche;Ville\r\nHaute;"Groupe ""Petits Pas""";Les Lucioles;Lyon\r\n');
  assert.deepEqual(rows, [['Priorité', 'Entreprise', 'Nom de la crèche', 'Ville'], ['Haute', 'Groupe "Petits Pas"', 'Les Lucioles', 'Lyon']]);
});

test('CSV : import des crèches, doublons ignorés', () => {
  const csv = [
    'priorité,entreprise,nom de la crèche,ville,mail,téléphone,site,pourquoi cette crèche',
    'haute,People&Baby,Les Lucioles,Lyon,direction@lucioles.fr,0400000000,lucioles.fr,"Grande équipe, beaucoup d’admin"',
    'basse,,Les Hiboux,Paris,,,,',
    'moyenne,,Les Lucioles,Lyon,,,,',              // même nom + même ville → doublon
    'haute,,Les Castors,Nantes,DIRECTION@castors.fr,,,', // même mail qu'une existante → doublon
    ',,,,,,,',
  ].join('\n');
  const existing = [{ name: 'Crèche Castors', ville: 'Nantes', directorEmail: 'direction@castors.fr' }];
  const r = importProspects(csv, existing, '2026-11-02');
  assert.equal(r.toAdd.length, 2);
  assert.equal(r.duplicates, 2);
  const [a, b] = r.toAdd;
  assert.equal(a.entreprise, 'People&Baby');
  assert.equal(a.name, 'Les Lucioles');
  assert.equal(a.priorite, 'haute');
  assert.equal(a.directorEmail, 'direction@lucioles.fr');
  assert.equal(a.telephone, '0400000000');
  assert.equal(a.pourquoi, 'Grande équipe, beaucoup d’admin');
  assert.equal(a.stage, 'a_contacter');
  assert.equal(b.priorite, 'basse');
});

test('CSV sans ligne de titres : colonnes dans l’ordre prévu', () => {
  const r = importProspects('1;Groupe X;Les Pitchouns;Lille;a@b.fr;;;Proche de chez moi', [], '2026-11-02');
  assert.equal(r.toAdd[0].name, 'Les Pitchouns');
  assert.equal(r.toAdd[0].priorite, 'haute');
  assert.equal(r.toAdd[0].pourquoi, 'Proche de chez moi');
});
