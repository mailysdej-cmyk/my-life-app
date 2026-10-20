import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueSlots, markSent, dueEvents, markEvents } from '../supabase/functions/notify/schedule.js';

const times = { summary: '08:00', weekly: '08:00', reminders: ['10:00', '12:00'] };

test('8 h : résumé du jour, et le lundi le résumé de la semaine', () => {
  assert.deepEqual(dueSlots({ date: '2026-11-03', time: '08:00', weekday: 2 }, times).map((x) => x.kind), ['summary']);
  assert.deepEqual(dueSlots({ date: '2026-11-02', time: '08:00', weekday: 1 }, times).map((x) => x.kind), ['summary', 'weekly']);
  assert.deepEqual(dueSlots({ date: '2026-11-03', time: '07:45', weekday: 2 }, times), []);
});

test('Une seule fois par jour, même si le programme passe en retard', () => {
  const now = { date: '2026-11-03', time: '08:15', weekday: 2 };
  const d = dueSlots(now, times);
  const log = markSent({}, now, d.map((x) => x.logKey));
  assert.deepEqual(dueSlots({ ...now, time: '08:30' }, times, log), []);
  assert.deepEqual(dueSlots({ ...now, time: '08:59' }, times, log), []);
  assert.deepEqual(dueSlots({ date: '2026-11-04', time: '08:30', weekday: 3 }, times, log).map((x) => x.kind), ['summary']);
});

test('10 h et 12 h : créneaux de rappel', () => {
  assert.deepEqual(dueSlots({ date: '2026-11-03', time: '10:00', weekday: 2 }, times).map((x) => x.slot), ['10:00']);
  assert.deepEqual(dueSlots({ date: '2026-11-03', time: '12:14', weekday: 2 }, times).map((x) => x.slot), ['12:00']);
  assert.deepEqual(dueSlots({ date: '2026-11-03', time: '11:00', weekday: 2 }, times), []);
});

test('Visio : rappel 1 h avant, une seule fois', () => {
  const ev = [{ key: 'v1', time: '14:00' }];
  assert.equal(dueEvents({ date: 'd', time: '12:45' }, ev).length, 0);
  assert.equal(dueEvents({ date: 'd', time: '13:00' }, ev).length, 1);
  const log = markEvents({}, { date: 'd' }, ['v1']);
  assert.equal(dueEvents({ date: 'd', time: '13:15' }, ev, log).length, 0);
});
