// Moteur de règles Serelys (sans IA) : à partir des clientes, des réglages et de ce que
// j'ai coché, calcule toutes les tâches, factures et chiffres. Rien n'est stocké en double :
// toute modification d'une cliente recalcule tout au prochain appel.
// Utilisé tel quel par l'appli (navigateur) et par le programme des notifications (Deno).

import {
  addDays, addMonths, addMonthsYm, dateIn, day, dayOfMonth, daysInMonth, diffDays, firstOf, fmtDate,
  fmtShort, isDate, lastOf, maxD, minD, mondayOf, monthLabel, monthName, monthsBetween, timeOf, ym,
} from './dates.js';
import { mergeConfig, mergeSettings } from './catalog.js';

export const STAGES = {
  prospect: 'Prospect', setup: 'Mise en place', offert: 'Mois offert', active: 'Active', preavis: 'Préavis', ancienne: 'Ancienne',
};
export const INVOICE_STATUS = { a_envoyer: 'À envoyer', envoyee: 'Envoyée', payee: 'Payée' };
export const PROSPECT_STAGES = {
  a_contacter: 'À contacter', contactee: 'Contactée', visio: 'Visio découverte', devis: 'Devis envoyé', signee: 'Signée', non: 'Pas intéressée',
};

const euro = (n) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
export { euro };

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

// ---------------------------------------------------------------- Contexte

export function makeContext(state, today) {
  const config = mergeConfig(state.settings?.config);
  const settings = mergeSettings(state.settings);
  const clients = (state.clients || []).filter((c) => !c.deleted);
  return {
    config, settings, today, clients,
    byId: Object.fromEntries(clients.map((c) => [c.id, c])),
    taskState: state.taskState || {},
    invoiceState: state.invoiceState || {},
    prospects: (state.prospects || []).filter((p) => !p.deleted),
    manualTasks: (state.manualTasks || []).filter((t) => !t.deleted),
  };
}

// ---------------------------------------------------------------- Dates d'une cliente

export function clientDates(c) {
  const offert = c.offert?.enabled && isDate(c.offert.start) && isDate(c.offert.end) ? c.offert : null;
  const serviceStart = offert ? day(offert.start) : (isDate(c.startDate) ? day(c.startDate) : null);
  let paidStart = null;
  if (offert) paidStart = firstOf(addMonthsYm(ym(offert.end), 1));
  else if (serviceStart) paidStart = dayOfMonth(serviceStart) === 1 ? serviceStart : firstOf(addMonthsYm(ym(serviceStart), 1));

  let end = null; let noNotice = false;
  if (c.stop && isDate(c.stop.requestDate)) {
    const req = day(c.stop.requestDate);
    // Pendant le mois offert ou à sa fin (avant la 1re facture) : sans préavis.
    noNotice = !!(offert && paidStart && req < paidStart);
    end = isDate(c.stop.endDate) ? day(c.stop.endDate) : noNotice ? req : addMonths(req, 1);
  }
  return { offert, serviceStart, paidStart, end, noNotice };
}

export function clientStage(c, today) {
  const d = clientDates(c);
  if (d.end && today > d.end) return 'ancienne';
  if (c.stop?.requestDate) return 'preavis';
  if (d.serviceStart && today >= d.serviceStart) return d.offert && today <= day(d.offert.end) ? 'offert' : 'active';
  if (c.quoteAccepted || c.contractSignedDate) return 'setup';
  return 'prospect';
}

// Prestations de la cliente à une date donnée (forfait − échanges + ajouts)
export function clientServices(c, config, date) {
  const rank = config.plans[c.plan]?.rank || 1;
  const ids = new Set(config.services.filter((s) => (config.plans[s.plan]?.rank || 1) <= rank).map((s) => s.id));
  for (const sw of c.swaps || []) {
    if (sw.since && date && date < sw.since) continue;
    if (sw.remove) ids.delete(sw.remove);
    if (sw.add) ids.add(sw.add);
  }
  for (const a of c.addons || []) {
    if (a.since && date && date < a.since) continue;
    ids.add(a.service);
  }
  return config.services.filter((s) => ids.has(s.id));
}

export function clientMoteurs(c, config, date) {
  return clientServices(c, config, date).filter((s) => s.moteur && s.moteurActive !== false).map((s) => s.moteur);
}

// Une prestation ajoutée est facturée si elle vient d'un forfait supérieur, n'est plus en essai.
function chargedAddons(c, config, date) {
  const rank = config.plans[c.plan]?.rank || 1;
  return (c.addons || []).filter((a) => {
    const s = config.services.find((x) => x.id === a.service);
    if (!s || (config.plans[s.plan]?.rank || 1) <= rank) return false;
    if (a.since && date < a.since) return false;
    if (isDate(a.trialEnd) && date <= day(a.trialEnd)) return false;
    return true;
  });
}

export function monthlyPrice(c, config, date) {
  const base = config.plans[c.plan]?.price || 0;
  return base + chargedAddons(c, config, date).length * config.addonPrice;
}

// ---------------------------------------------------------------- Factures

function invoiceDue(inv, config) {
  return addDays(inv.sentAt ? day(inv.sentAt) : inv.date, config.paymentDays);
}

// Calcule toutes les factures jusqu'au mois « toYm » inclus.
export function computeInvoices(ctx, toYm) {
  const { config, clients, invoiceState } = ctx;
  const all = [];
  for (const c of clients) {
    const d = clientDates(c);
    if (!d.paidStart) continue;
    const fromYm = maxD(ym(d.paidStart), c.historyFrom ? ym(c.historyFrom) : null);
    const lastYm = d.end ? minD(toYm, ym(d.end)) : toYm;
    if (d.end && d.end < d.paidStart) continue;
    let first = true;
    for (const m of monthsBetween(fromYm, lastYm)) {
      const date = m === ym(d.paidStart) ? d.paidStart : firstOf(m);
      const key = `inv:${c.id}:${m}`;
      const st = invoiceState[key] || {};
      const lines = [{ label: `Forfait ${config.plans[c.plan]?.label || ''}`, amount: config.plans[c.plan]?.price || 0 }];
      for (const a of chargedAddons(c, config, date)) {
        const s = config.services.find((x) => x.id === a.service);
        lines.push({ label: `Ajout : ${s?.label || a.service}`, amount: config.addonPrice });
      }
      let prorata = null;
      if (d.end && ym(d.end) === m && d.end < lastOf(m)) {
        const served = dayOfMonth(d.end) - dayOfMonth(date) + 1;
        prorata = { served, total: daysInMonth(m) - dayOfMonth(date) + 1 };
      }
      const discounts = [];
      const isFirst = first && (!c.historyFrom || ym(c.historyFrom) <= ym(d.paidStart));
      if (isFirst && c.marraineId && c.plan === 'premium') {
        discounts.push({ label: 'Parrainage : remise filleule', amount: config.filleulePremiumDiscount, kind: 'filleule' });
      }
      first = false;
      all.push({ key, clientId: c.id, month: m, date, lines, prorata, discounts, isFirst,
        status: st.status || 'a_envoyer', sentAt: st.sentAt || null, paidAt: st.paidAt || null, frozen: st.status && st.status !== 'a_envoyer' ? st : null });
    }
  }
  const gross = (inv) => {
    let g = inv.lines.reduce((s, l) => s + l.amount, 0);
    if (inv.prorata) g = Math.round((g * inv.prorata.served / inv.prorata.total) * 100) / 100;
    return g;
  };
  for (const inv of all) inv.gross = gross(inv);

  // Remises de parrainage : 150 € à la marraine quand la 1re facture d'une filleule est payée.
  const credits = [];
  for (const f of clients) {
    if (!f.marraineId || !ctx.byId[f.marraineId]) continue;
    const firstInv = all.find((i) => i.clientId === f.id && i.isFirst);
    if (!firstInv || firstInv.status !== 'payee' || !firstInv.paidAt) continue;
    const P = day(firstInv.paidAt);
    const m = ctx.byId[f.marraineId];
    const md = clientDates(m);
    const active = md.serviceStart && md.serviceStart <= P && (!md.end || P <= md.end);
    const upToDate = !all.some((i) => i.clientId === m.id && i.status !== 'payee' && invoiceDue(i, config) < P);
    credits.push({ marraineId: m.id, filleuleId: f.id, date: P, amount: config.parrainageCredit, granted: !!(active && upToDate),
      reason: !active ? 'contrat de la marraine pas en cours' : !upToDate ? 'factures de la marraine pas à jour' : null });
  }
  const byClient = {};
  for (const inv of all) (byClient[inv.clientId] ||= []).push(inv);
  for (const [cid, list] of Object.entries(byClient)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const mine = credits.filter((x) => x.marraineId === cid && x.granted).sort((a, b) => a.date.localeCompare(b.date));
    let pool = 0; let ci = 0;
    for (const inv of list) {
      while (ci < mine.length && mine[ci].date < inv.date) pool += mine[ci++].amount;
      const other = inv.discounts.reduce((s, x) => s + x.amount, 0);
      if (inv.frozen && typeof inv.frozen.amount === 'number') {
        const used = inv.frozen.parrainageUsed || 0;
        pool = Math.max(0, pool - used);
        if (used) inv.discounts.push({ label: 'Remise de parrainage (marraine)', amount: used, kind: 'marraine' });
        inv.amount = inv.frozen.amount;
      } else {
        const use = Math.min(pool, Math.max(0, inv.gross - other));
        pool -= use;
        if (use) inv.discounts.push({ label: 'Remise de parrainage (marraine)', amount: use, kind: 'marraine' });
        inv.amount = Math.max(0, inv.gross - other - use);
      }
      inv.parrainageUsed = inv.discounts.filter((x) => x.kind === 'marraine').reduce((s, x) => s + x.amount, 0);
      inv.creditLeft = pool;
    }
    // Remises gagnées après la dernière facture calculée : en attente
    let pending = pool;
    while (ci < mine.length) pending += mine[ci++].amount;
    if (list.length) list[list.length - 1].creditPending = pending;
  }
  for (const inv of all) {
    inv.due = invoiceDue(inv, config);
    inv.late = inv.status !== 'payee' && ctx.today > inv.due;
    inv.daysLate = inv.late ? diffDays(inv.due, ctx.today) : 0;
  }
  all.credits = credits;
  return all;
}

// Remise de parrainage disponible pour une marraine (pas encore appliquée à une facture envoyée)
export function pendingCredit(ctx, invoices, clientId) {
  const list = invoices.filter((i) => i.clientId === clientId && i.status === 'a_envoyer');
  const granted = invoices.credits.filter((x) => x.marraineId === clientId && x.granted).reduce((s, x) => s + x.amount, 0);
  const used = invoices.filter((i) => i.clientId === clientId && i.status !== 'a_envoyer').reduce((s, i) => s + (i.parrainageUsed || 0), 0);
  return { total: Math.max(0, granted - used), next: list[0] || null };
}

// ---------------------------------------------------------------- Tâches

function makeTask(t) {
  return { stateKey: t.key, due: null, time: null, items: null, clientId: null, kind: 'task', ...t };
}

function quoteSummary(c, ctx) {
  const { config } = ctx;
  const parts = [`Forfait ${config.plans[c.plan]?.label} (${euro(config.plans[c.plan]?.price || 0)}/mois)`];
  for (const sw of c.swaps || []) {
    const r = config.services.find((s) => s.id === sw.remove); const a = config.services.find((s) => s.id === sw.add);
    parts.push(`Échange : ${r?.label || '?'} → ${a?.label || '?'}`);
  }
  for (const a of c.addons || []) {
    const s = config.services.find((x) => x.id === a.service);
    parts.push(`Ajout : ${s?.label} (+${config.addonPrice} €/mois${a.trialEnd ? `, essai gratuit jusqu’au ${fmtShort(a.trialEnd)}` : ''})`);
  }
  const d = clientDates(c);
  const price = monthlyPrice({ ...c, addons: (c.addons || []).map((a) => ({ ...a, trialEnd: null, since: null })) }, config, '9999-12-31');
  parts.push(`Montant total : ${euro(price)}/mois`);
  if (d.serviceStart) parts.push(`Début : ${fmtDate(d.serviceStart)}`);
  if (d.offert) parts.push(`Mois offert : du ${fmtShort(d.offert.start)} au ${fmtShort(d.offert.end)}`);
  if (c.marraineId) parts.push(`Marraine : ${ctx.byId[c.marraineId]?.name || '?'}`);
  return parts;
}

function oneshotItems(c, ctx) {
  const { config } = ctx;
  const rank = config.plans[c.plan]?.rank || 1;
  const items = [];
  for (const [plan, list] of Object.entries(config.oneshots)) {
    if ((config.plans[plan]?.rank || 1) <= rank) list.forEach((l, i) => items.push({ id: `${plan}-${i}`, label: l }));
  }
  if (c.marraineId) {
    const above = Object.entries(config.plans).find(([, p]) => p.rank === rank + 1);
    if (above) items.push({ id: 'filleule', label: `Cadeau de parrainage : 1 one-shot offert du forfait ${above[1].label} (au choix)` });
  }
  return items;
}

const STYLES = { classique: 'classique', doux: 'doux', perso: 'personnalisé' };
export { STYLES };

function onboardingTasks(c, ctx) {
  const { config, settings } = ctx;
  const n = c.name;
  const out = [];
  const d = clientDates(c);
  const k = (s) => `c:${c.id}:ob:${s}`;
  const add = (t) => out.push(makeTask({ clientId: c.id, onboarding: true, ...t }));
  const disc = isDate(c.discoveryDate) ? day(c.discoveryDate) : null;
  if (disc) {
    add({ key: k('visio'), date: disc, time: timeOf(c.discoveryDate), kind: 'event', title: `Visio découverte avec ${n}`, step: false });
    add({ key: k('pdf'), date: disc, title: `Envoyer les forfaits détaillés en PDF à ${n}`, step: true });
    add({ key: k('source'), date: disc, title: `Noter comment ${n} a connu Serelys (et sa crèche marraine)`, step: true, autoDone: !!c.howKnown });
    add({ key: k('devis'), date: addDays(disc, 1), title: `Envoyer le devis à ${n}`, step: true, note: quoteSummary(c, ctx),
      autoDone: !!(c.quoteSentDate || c.quoteAccepted),
      blocked: settings.aeCreated ? null : 'Pas de devis avant d’avoir mon SIRET : coche d’abord « Auto-entreprise créée » dans Réglages.' });
  }
  if (isDate(c.quoteAccepted)) {
    add({ key: k('planif'), date: day(c.quoteAccepted), title: `Planifier la visio de signature avec ${n}`, step: true, autoDone: isDate(c.signatureVisioDate) });
  }
  if (isDate(c.signatureVisioDate)) {
    add({ key: k('signature'), date: day(c.signatureVisioDate), time: timeOf(c.signatureVisioDate), kind: 'event', title: `Visio de signature avec ${n}` });
    add({ key: k('mail'), date: day(c.signatureVisioDate), title: `Envoyer à ${n} un seul mail avec : contrat + Annexes 1 et 2 signés par moi, fiche d’infos, note aux familles, modèles de mails`, step: true });
  }
  if (isDate(c.contractSignedDate)) {
    const s = day(c.contractSignedDate);
    add({ key: k('registre'), date: s, title: `Ajouter ${n} à mon registre des traitements`, step: true });
    const docs = makeTask({ key: k('docs'), clientId: c.id, onboarding: true, step: true, date: s, title: `Recevoir de ${n} les 4 éléments avant de démarrer`,
      items: config.docsToReceive, warning: 'Tant qu’il en manque une, je n’allume aucun moteur.' });
    out.push(docs);
    const docsState = ctx.taskState[docs.key];
    const allDocs = docsState?.done || config.docsToReceive.every((i) => docsState?.items?.[i.id]);
    if (!allDocs) {
      add({ key: k('docs-rappel'), stateKey: k('docs'), date: addDays(s, 7), title: `Il manque encore des éléments de ${n} pour démarrer`,
        items: config.docsToReceive, warning: 'Tant qu’il en manque une, je n’allume aucun moteur.', reminder: true });
    }
    const svc = new Set(clientServices(c, config, d.serviceStart || s).map((x) => x.id));
    const moteurs = clientMoteurs(c, config, d.serviceStart || s).join(', ');
    const items = config.setupItems.filter((i) => !i.service || svc.has(i.service)).map((i) => ({ id: i.id, label: fill(i.label, { moteurs }) }));
    add({ key: k('setup'), date: addDays(s, 1), due: d.serviceStart && d.serviceStart > s ? addDays(d.serviceStart, -1) : null,
      title: `Mettre en place ${n}`, items, step: true, blocked: allDocs ? null : 'Tant qu’il manque un des 4 éléments, je n’allume aucun moteur.', softBlock: true });
  }
  if (d.paidStart && isDate(c.contractSignedDate)) {
    if (c.style === 'perso') {
      add({ key: k('apercu'), date: d.paidStart, title: `Envoyer à ${n} l’aperçu de son style personnalisé (puis jusqu’à 2 séries d’ajustements)`, step: true });
    }
    add({ key: k('oneshots'), date: d.paidStart, title: `Livrer les documents uniques de ${n} (style ${STYLES[c.style] || 'classique'})`, items: oneshotItems(c, ctx), step: true });
  }
  return out;
}

function monthlyTasks(c, ctx, fromYm, toYm) {
  const { config } = ctx;
  const d = clientDates(c);
  if (!d.serviceStart) return [];
  const out = [];
  const start = maxD(d.serviceStart, c.historyFrom ? day(c.historyFrom) : null);
  const months = monthsBetween(maxD(ym(start), fromYm), d.end ? minD(toYm, ym(d.end)) : toYm);
  const invoiceDates = new Set();
  for (const m of months) {
    const vars = { creche: c.name, mois: monthName(m), mois1: monthName(addMonthsYm(m, 1)) };
    const ref = dateIn(m, 15);
    const svc = new Set(clientServices(c, config, ref).map((s) => s.id));
    for (const r of config.rules) {
      if (r.disabled) continue;
      if (r.service && !svc.has(r.service)) continue;
      if (r.id === 'facture') continue; // à part, liée aux factures
      const date = dateIn(m, r.day);
      if (date < start || (d.end && date > d.end)) continue;
      const key = `c:${c.id}:${r.id}:${m}`;
      const t = makeTask({ key, clientId: c.id, date, due: r.dueDay ? dateIn(m, r.dueDay) : null, title: fill(r.title, vars), rule: r.id, month: m });
      if (r.id === 'moteurs') t.items = clientMoteurs(c, config, date).map((x, i) => ({ id: `m${i}`, label: x }));
      if (r.id === 'livraison') {
        const list = [...config.baseDeliverables];
        for (const s of clientServices(c, config, date)) for (const l of s.deliverables || []) list.push(l);
        t.items = list.map((l, i) => ({ id: `l${i}`, label: fill(l, vars) }));
      }
      if (r.id === 'visio-proposer') t.autoDone = !!c.visios?.[m];
      if (r.id === 'newsletter-check') {
        // Pas de vérification tant qu'aucune newsletter n'a été préparée le mois d'avant (1er mois de la cliente)
        const prep = dateIn(addMonthsYm(m, -1), config.rules.find((x) => x.id === 'newsletter-prep')?.day || 20);
        if (prep < start || !clientServices(c, config, prep).some((x) => x.id === 'newsletter')) continue;
      }
      if (r.id === 'infos-recues') {
        t.question = true;
        const st = ctx.taskState[key];
        if (st?.answer === 'non') {
          const ad = st.answeredAt ? day(st.answeredAt) : date;
          const rk = `${key}:relance`;
          out.push(makeTask({ key: rk, clientId: c.id, date: ad, title: `Relancer ${c.name} pour ses infos du mois`, month: m }));
          const r7 = dateIn(m, 7);
          if (!ctx.taskState[rk]?.done && r7 > ad) {
            out.push(makeTask({ key: `${key}:relance7`, stateKey: rk, clientId: c.id, date: r7, reminder: true, title: `Toujours pas d’infos du mois de ${c.name} : la relancer`, month: m }));
          }
        }
      }
      out.push(t);
    }
    if (svc.has('visio') && isDate(c.visios?.[m])) {
      const v = c.visios[m];
      out.push(makeTask({ key: `c:${c.id}:visio:${m}`, clientId: c.id, date: day(v), time: timeOf(v), kind: 'event', title: `Visio de suivi (30 min) avec ${c.name}`, remindBefore: 60, month: m }));
    }
    if (svc.has('reunion') && isDate(c.reunions?.[m])) {
      const r = day(c.reunions[m]);
      out.push(makeTask({ key: `c:${c.id}:cr:${m}`, clientId: c.id, date: addDays(r, 2), title: `Compte rendu de la réunion de ${c.name} (à partir des notes de la directrice)`, month: m }));
    }
  }
  return out;
}

function invoiceTasks(invoices, ctx) {
  const out = [];
  for (const inv of invoices) {
    const c = ctx.byId[inv.clientId];
    const n = c.name;
    out.push(makeTask({ key: `c:${c.id}:facture:${inv.month}`, clientId: c.id, date: inv.date, invoiceKey: inv.key, kind: 'invoice',
      title: `Envoyer la facture de ${n} (${euro(inv.amount)})`, autoDone: inv.status !== 'a_envoyer', note: invoiceNote(inv, ctx) }));
    if (inv.status === 'envoyee') {
      out.push(makeTask({ key: `${inv.key}:rappel`, clientId: c.id, date: inv.due, invoiceKey: inv.key,
        title: `Rappel gentil à ${n} pour sa facture de ${monthName(inv.month)} (${euro(inv.amount)})` }));
      out.push(makeTask({ key: `${inv.key}:retard`, clientId: c.id, date: addDays(inv.due, ctx.config.lateDays), invoiceKey: inv.key, alert: true,
        title: `Facture de ${n} en retard de ${ctx.config.lateDays} jours : je peux suspendre le service (contrat, article 12)` }));
    }
  }
  return out;
}

export function invoiceNote(inv, ctx) {
  const lines = inv.lines.map((l) => `${l.label} : ${euro(l.amount)}`);
  if (inv.prorata) lines.push(`Au prorata : ${inv.prorata.served} jours sur ${inv.prorata.total}`);
  for (const x of inv.discounts) lines.push(`${x.label} : −${euro(x.amount)}`);
  lines.push(`Total : ${euro(inv.amount)} · à payer avant le ${fmtShort(addDays(inv.sentAt ? day(inv.sentAt) : inv.date, ctx.config.paymentDays))}`);
  return lines;
}

function dateLinkedTasks(c, ctx) {
  const { config } = ctx;
  const d = clientDates(c);
  const out = [];
  const n = c.name;
  if (d.offert && (!d.end || d.end >= addDays(day(d.offert.end), -5))) {
    out.push(makeTask({ key: `c:${c.id}:offert-fin`, clientId: c.id, date: addDays(day(d.offert.end), -5), title: `Demander à ${n} si elle continue après son mois offert (fin le ${fmtShort(d.offert.end)})` }));
  }
  for (const a of c.addons || []) {
    if (!isDate(a.trialEnd)) continue;
    const s = config.services.find((x) => x.id === a.service);
    out.push(makeTask({ key: `c:${c.id}:essai:${a.service}`, clientId: c.id, date: addDays(day(a.trialEnd), -5),
      title: `Demander à ${n} si elle garde « ${s?.label || a.service} » (+${config.addonPrice} €/mois)` }));
  }
  if (d.serviceStart) {
    const p = addDays(addMonths(d.serviceStart, 2), -1);
    if (!d.end || p <= d.end) out.push(makeTask({ key: `c:${c.id}:parrainage`, clientId: c.id, date: p, title: `Parler du parrainage à ${n} et lui donner la fiche parrainage` }));
  }
  if (d.end) {
    out.push(makeTask({ key: `c:${c.id}:cloture`, clientId: c.id, date: addDays(d.end, 1), due: addDays(d.end, 30), title: `Clôturer le dossier de ${n} (fin le ${fmtShort(d.end)})`, items: config.closingItems }));
  }
  return out;
}

function myTasks(ctx, invoices, fromYm, toYm) {
  const { config, settings } = ctx;
  const out = [];
  const add = (t) => out.push(makeTask({ mine: true, ...t }));
  for (const m of monthsBetween(fromYm, toYm)) {
    for (const r of config.myRules) {
      if (r.disabled) continue;
      add({ key: `e:${r.id}:${m}`, date: dateIn(m, r.day), title: fill(r.title, { mois: monthName(m) }) });
    }
  }
  // Déclaration Urssaf
  const aeStart = settings.aeCreationDate ? day(settings.aeCreationDate) : null;
  for (const p of aeStart ? urssafPeriods(settings, addMonthsYm(fromYm, -3), toYm) : []) {
    if (p.end < aeStart) continue;
    const amount = encaisse(invoices, p.start, p.end);
    add({ key: `e:urssaf:${p.id}`, date: addDays(p.deadline, -settings.urssafReminderDays), due: p.deadline, kind: 'urssaf',
      title: `Déclarer mon chiffre d’affaires ${p.label} à l’Urssaf : ${euro(amount)} encaissés (avant le ${fmtShort(p.deadline)})` });
  }
  const years = [...new Set(monthsBetween(fromYm, toYm).map((m) => m.slice(0, 4)))];
  for (const y of years) {
    add({ key: `e:obligations:${y}`, date: `${y}-${settings.obligationsDate}`, title: 'Relire mes obligations d’entrepreneuse (les règles changent)' });
  }
  if (settings.rcProDate) add({ key: 'e:rcpro', date: day(settings.rcProDate), title: 'Souscrire mon assurance responsabilité civile pro (avant la première signature)' });
  if (settings.aeTaskDate) add({ key: 'e:creation-ae', date: day(settings.aeTaskDate), title: 'Créer mon auto-entreprise (pas de devis ni de facture sans SIRET)', autoDone: !!settings.aeCreated });
  if (aeStart && !settings.acreDone) {
    for (const j of [7, 30, 50]) {
      add({ key: `e:acre:${j}`, stateKey: 'e:acre', date: addDays(aeStart, j), due: addDays(aeStart, 60), reminder: j > 7,
        title: `Demander l’ACRE à l’Urssaf (au plus tard le ${fmtShort(addDays(aeStart, 60))})` });
    }
  }
  if (settings.eInvoiceDate) add({ key: 'e:facture-electronique', date: day(settings.eInvoiceDate), title: 'Préparer la facture électronique (obligatoire pour émettre à partir du 1er septembre 2027)' });
  return out;
}

export function urssafPeriods(settings, fromYm, toYm) {
  const out = [];
  for (const m of monthsBetween(fromYm, toYm)) {
    if (settings.urssafPeriod === 'trimestriel') {
      const mo = Number(m.slice(5, 7));
      if ((mo - 1) % 3 !== 0) continue;
      const endYm = addMonthsYm(m, 2);
      const q = (mo - 1) / 3 + 1;
      out.push({ id: `${m.slice(0, 4)}-T${q}`, label: `du ${q === 1 ? '1er' : `${q}e`} trimestre ${m.slice(0, 4)}`, start: firstOf(m), end: lastOf(endYm), deadline: lastOf(addMonthsYm(endYm, 1)) });
    } else {
      out.push({ id: m, label: `${/^[aeiou]/.test(monthName(m)) ? 'd’' : 'de '}${monthLabel(m)}`, start: firstOf(m), end: lastOf(m), deadline: lastOf(addMonthsYm(m, 1)) });
    }
  }
  return out;
}

export function encaisse(invoices, from, to) {
  return invoices.filter((i) => i.status === 'payee' && i.paidAt && day(i.paidAt) >= from && day(i.paidAt) <= to).reduce((s, i) => s + i.amount, 0);
}

function prospectTasks(ctx) {
  const out = [];
  for (const p of ctx.prospects) {
    if (p.stage === 'contactee' && isDate(p.firstContact)) {
      out.push(makeTask({ key: `p:${p.id}:relance`, prospectId: p.id, date: addDays(day(p.firstContact), ctx.config.prospectFollowUpDays), title: `Relancer ${p.name} (prospection)` }));
    }
    if (p.stage === 'visio' && isDate(p.visioDate)) {
      out.push(makeTask({ key: `p:${p.id}:visio`, prospectId: p.id, date: day(p.visioDate), time: timeOf(p.visioDate), kind: 'event', title: `Visio découverte avec ${p.name}` }));
    }
  }
  return out;
}

// Toutes les tâches, avec leur état. Options : horizon en mois après aujourd'hui.
export function computeAll(state, today, { monthsAhead = 3 } = {}) {
  const ctx = makeContext(state, today);
  const toYm = addMonthsYm(ym(today), monthsAhead);
  const trackingStart = ctx.settings.trackingStart ? day(ctx.settings.trackingStart) : today;
  const fromYm = ym(trackingStart);
  const invoices = computeInvoices(ctx, toYm);
  let tasks = [];
  for (const c of ctx.clients) {
    tasks.push(...onboardingTasks(c, ctx), ...monthlyTasks(c, ctx, fromYm, toYm), ...dateLinkedTasks(c, ctx));
  }
  tasks.push(...invoiceTasks(invoices, ctx), ...myTasks(ctx, invoices, fromYm, toYm), ...prospectTasks(ctx));
  for (const m of ctx.manualTasks) {
    if (!isDate(m.date)) continue;
    tasks.push(makeTask({ key: `m:${m.id}`, manualId: m.id, clientId: m.clientId || null, date: day(m.date), time: timeOf(m.date), title: m.title, manual: true, notes: m.notes }));
  }
  const horizon = lastOf(toYm);
  tasks = tasks.filter((t) => (t.due || t.date) >= trackingStart && t.date <= horizon);
  for (const t of tasks) {
    const st = ctx.taskState[t.stateKey] || {};
    t.state = st;
    const itemsDone = t.items?.length ? t.items.every((i) => st.items?.[i.id]) : false;
    t.itemsDone = t.items ? t.items.filter((i) => st.items?.[i.id]).length : 0;
    t.done = !!(st.done || t.autoDone || (t.question && st.answer) || (t.items?.length && itemsDone));
    t.doneAt = st.doneAt || null;
    t.end = t.due || t.date;
    t.late = !t.done && t.end < today;
    t.today = !t.done && (t.date === today || t.due === today);
    t.ongoing = !t.done && t.date < today && t.due && t.due > today;
    if (t.clientId) t.client = ctx.byId[t.clientId];
  }
  // Les tâches qui partagent un même état (une tâche et ses rappels) : une seule est affichée,
  // la plus récente déjà arrivée (sinon la première à venir). Les autres sont masquées.
  const groups = new Map();
  for (const t of tasks) (groups.get(t.stateKey) || groups.set(t.stateKey, []).get(t.stateKey)).push(t);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const past = group.filter((t) => t.date <= today).sort((a, b) => b.date.localeCompare(a.date));
    const keep = past[0] || [...group].sort((a, b) => a.date.localeCompare(b.date))[0];
    for (const t of group) if (t !== keep) t.hidden = true;
  }
  tasks.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
  return { ctx, tasks, invoices };
}

// ---------------------------------------------------------------- Vues

export function todayView(all, today) {
  const sunday = addDays(mondayOf(today), 6);
  const weekEnd = sunday > today ? sunday : addDays(today, 7);
  const open = all.tasks.filter((t) => !t.done && !t.hidden);
  return {
    late: open.filter((t) => t.late),
    today: open.filter((t) => !t.late && (t.date === today || t.due === today)),
    ongoing: open.filter((t) => t.ongoing),
    week: open.filter((t) => t.date > today && t.date <= weekEnd),
    doneToday: all.tasks.filter((t) => t.done && t.doneAt && day(t.doneAt) === today),
  };
}

export function monthCycle(today) {
  const j = dayOfMonth(today);
  const last = daysInMonth(ym(today));
  const lv = Math.min(29, last);
  const phase = j < 5 ? 'infos' : j < lv ? 'prepare' : 'livre';
  return { day: j, last, phase,
    phases: [
      { id: 'infos', label: 'Infos des crèches', range: '1 → 5' },
      { id: 'prepare', label: 'Je prépare', range: `5 → ${lv}` },
      { id: 'livre', label: 'Je livre', range: `${lv} → 1er` },
    ] };
}

export function onboardingProgress(all, clientId) {
  const steps = all.tasks.filter((t) => t.clientId === clientId && t.onboarding && t.step);
  const parts = steps.map((t) => (t.done ? 1 : t.items?.length ? t.itemsDone / t.items.length : 0));
  const expected = 9; // étapes 1 à 8 (avec la livraison des documents uniques)
  const total = Math.max(expected, steps.length);
  return { done: parts.reduce((s, x) => s + x, 0), total, ratio: parts.reduce((s, x) => s + x, 0) / total };
}

export function moneySummary(all, today) {
  const { ctx, invoices } = all;
  const s = ctx.settings;
  const m = ym(today);
  const y = today.slice(0, 4);
  const monthRev = encaisse(invoices, firstOf(m), lastOf(m));
  const yearRev = encaisse(invoices, `${y}-01-01`, `${y}-12-31`);
  const regular = ctx.clients.filter((c) => invoices.some((i) => i.clientId === c.id && i.status === 'payee' && i.amount > 0));
  const nextUrssaf = all.tasks.filter((t) => t.kind === 'urssaf' && !t.done).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
  return {
    monthRev, yearRev,
    urssafEstimateMonth: Math.round(monthRev * s.urssafRate) / 100,
    urssafEstimateYear: Math.round(yearRev * s.urssafRate) / 100,
    tvaRatio: yearRev / s.tvaThreshold,
    tvaAlert: yearRev >= s.tvaThreshold * s.tvaAlertRatio,
    regularCount: regular.length, goal: s.goalClients,
    monthInvoices: invoices.filter((i) => i.month === m || (i.status !== 'payee' && i.month < m)),
    nextUrssaf,
  };
}

// ---------------------------------------------------------------- Notifications

const short = (t) => (t.client ? `${t.client.name} : ${t.title.replace(new RegExp(` (de|à|avec|pour) ${escapeRe(t.client.name)}`), '')}` : t.title);
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const listLine = (tasks, max = 3) => tasks.slice(0, max).map(short).join(' · ') + (tasks.length > max ? ` · +${tasks.length - max}` : '');
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

// kind : 'summary' (8 h), 'reminder' (10 h / 12 h), 'weekly' (lundi 8 h). Renvoie null si rien à envoyer.
export function buildNotification(state, today, kind) {
  const all = computeAll(state, today, { monthsAhead: 2 });
  const v = todayView(all, today);
  const todays = [...v.today];
  if (kind === 'summary') {
    const n = todays.length;
    let body = n ? `Aujourd’hui : ${plural(n, 'tâche')} · ${listLine(todays)}` : 'Aujourd’hui : rien de prévu. Belle journée !';
    if (v.late.length) body += ` (+ ${plural(v.late.length, 'tâche')} en retard)`;
    return { title: `Serelys · ${fmtDate(today)}`, body, tag: `summary-${today}` };
  }
  if (kind === 'reminder') {
    if (!todays.length && !v.late.length) return null;
    const parts = [];
    if (todays.length) parts.push(`Il reste ${plural(todays.length, 'tâche')} aujourd’hui : ${listLine(todays, 2)}`);
    if (v.late.length) parts.push(`${plural(v.late.length, 'tâche')} en retard : ${listLine(v.late, 2)}`);
    return { title: 'Serelys · petit rappel', body: parts.join(' · '), tag: `reminder-${today}` };
  }
  if (kind === 'weekly') {
    const end = addDays(today, 6);
    const week = all.tasks.filter((t) => !t.done && !t.hidden && t.date >= today && t.date <= end);
    const visios = week.filter((t) => t.kind === 'event');
    const inv = all.invoices.filter((i) => i.status === 'a_envoyer' && i.date >= today && i.date <= end);
    const parts = [`Cette semaine : ${plural(week.length, 'tâche')}`];
    if (visios.length) parts.push(`${plural(visios.length, 'visio')} (${visios.map((t) => `${t.client?.name || ''} ${fmtShort(t.date)}`.trim()).join(', ')})`);
    if (inv.length) parts.push(`${plural(inv.length, 'facture')} à envoyer (${inv.map((i) => all.ctx.byId[i.clientId].name).join(', ')})`);
    if (v.late.length) parts.push(`${plural(v.late.length, 'tâche')} en retard`);
    return { title: 'Serelys · ma semaine', body: parts.join(' · '), tag: `weekly-${today}` };
  }
  return null;
}

// Rappels « 1 h avant » des visios : renvoie celles qui commencent dans [from, to[ (heures 'HH:MM')
export function upcomingEvents(state, today, fromTime, toTime) {
  const all = computeAll(state, today, { monthsAhead: 1 });
  return all.tasks.filter((t) => t.kind === 'event' && !t.done && !t.hidden && t.date === today && t.time && t.time >= fromTime && t.time < toTime);
}
