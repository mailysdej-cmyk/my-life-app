import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Icon, Ring, Sheet, Field, Input, euro, fmtDate, fmtShort } from '../ui.js';
import { moneySummary, encaisse, invoiceNote, pendingCredit } from '../engine.js';
import { addMonthsYm, ym, firstOf, lastOf, monthName, monthLabel, day } from '../dates.js';

const SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

export function MoneyScreen({ S, all, today, act, openSettings }) {
  const m = useMemo(() => moneySummary(all, today), [all, today]);
  const settings = all.ctx.settings;
  const [filter, setFilter] = useState('mois');
  const [edit, setEdit] = useState(null);
  const name = (id) => all.ctx.byId[id]?.name || '?';
  const color = (id) => all.ctx.byId[id]?.color || 'var(--sage)';

  const months = Array.from({ length: 6 }, (_, i) => addMonthsYm(ym(today), i - 5));
  const series = months.map((mm) => ({ m: mm, v: encaisse(all.invoices, firstOf(mm), lastOf(mm)) }));
  const maxV = Math.max(1, ...series.map((x) => x.v));

  const cur = ym(today);
  const lists = {
    mois: all.invoices.filter((i) => i.month === cur || (i.status !== 'payee' && i.month < cur)),
    a_envoyer: all.invoices.filter((i) => i.status === 'a_envoyer' && i.date <= lastOf(addMonthsYm(cur, 1))),
    retard: all.invoices.filter((i) => i.late),
    payees: all.invoices.filter((i) => i.status === 'payee').reverse(),
  };
  const shown = lists[filter];
  const marraines = [...new Set((all.invoices.credits || []).filter((x) => x.granted).map((x) => x.marraineId))];

  return html`<div class="screen">
    <div class="topbar"><h1>Mon argent</h1><button class="icon-btn" onClick=${openSettings} aria-label="Réglages"><${Icon} name="gear" /></button></div>

    <div class="stats">
      <div class="stat"><div class="l">Encaissé en ${monthName(cur)}</div><div class="v">${euro(m.monthRev)}</div><div class="small muted">Cotisations ≈ ${euro(m.urssafEstimateMonth)}</div></div>
      <div class="stat"><div class="l">Encaissé en ${today.slice(0, 4)}</div><div class="v">${euro(m.yearRev)}</div><div class="small muted">Cotisations ≈ ${euro(m.urssafEstimateYear)}</div></div>
    </div>

    <div class="card">
      <div class="ring-wrap">
        <${Ring} value=${m.regularCount} max=${m.goal} label=${`${m.regularCount}/${m.goal}`} />
        <div class="grow"><h2 style="margin-bottom:4px">Mon objectif</h2>
          <div>${m.regularCount >= m.goal ? 'Objectif atteint : je peux préparer mon départ de mon poste salarié !' : `${m.goal} clientes régulières pour quitter mon poste salarié.`}</div>
          <div class="small muted" style="margin-top:4px">Régulière = au moins une facture payée (hors mois offert).</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Encaissé sur 6 mois</h2>
      <div class="bars">${series.map((x) => html`<div class=${`b ${x.m === cur ? 'cur' : ''}`} title=${`${monthLabel(x.m)} : ${euro(x.v)}`}>
        <span style=${`height:${Math.max(3, (x.v / maxV) * 100)}%`}></span><em>${SHORT[Number(x.m.slice(5, 7)) - 1]}</em></div>`)}</div>
    </div>

    <div class="card">
      <h2>Seuil de TVA</h2>
      <div class="track"><span style=${`width:${Math.min(100, m.tvaRatio * 100)}%;background:${m.tvaAlert ? 'var(--peach)' : ''}`}></span></div>
      <div class="spread small" style="margin-top:8px"><span>${euro(m.yearRev)} sur ${euro(settings.tvaThreshold)}</span><b>${Math.round(m.tvaRatio * 100)} %</b></div>
      ${m.tvaAlert ? html`<div class="warn" style="margin-top:10px">Attention : tu dépasses ${Math.round(settings.tvaAlertRatio * 100)} % du seuil. Au-delà de ${euro(settings.tvaThreshold)}, il faudra facturer la TVA.</div>`
        : html`<div class="small muted" style="margin-top:6px">Pas de TVA tant que tu restes sous le seuil. Alerte à ${Math.round(settings.tvaAlertRatio * 100)} %.</div>`}
    </div>

    <div class="card">
      <h2>Prochaine déclaration Urssaf</h2>
      ${m.nextUrssaf ? html`<div style="font-weight:700">${m.nextUrssaf.title}</div><div class="small muted" style="margin-top:4px">Rappel le ${fmtDate(m.nextUrssaf.date)} · déclaration ${settings.urssafPeriod}</div>`
        : html`<div class="small muted">Indique la date de création de ton auto-entreprise dans Réglages pour activer les rappels.</div>`}
    </div>

    ${marraines.length ? html`<div class="card"><h2>Remises de parrainage</h2>
      ${marraines.map((id) => { const p = pendingCredit(all.ctx, all.invoices, id); return html`<div class="kv"><span>${name(id)}</span><b>${p.total ? `${euro(p.total)} à appliquer${p.next ? ` sur la facture de ${monthName(p.next.month)}` : ''}` : 'tout est appliqué'}</b></div>`; })}
      <div class="small muted" style="margin-top:6px">Calculées toutes seules : la remise est déjà déduite du montant des factures.</div></div>` : null}

    <div class="section-title"><span>Factures</span></div>
    <div class="seg" style="margin-bottom:14px">${[['mois', 'Ce mois'], ['a_envoyer', 'À envoyer'], ['retard', 'En retard'], ['payees', 'Payées']].map(([k, l]) => html`
      <button class=${filter === k ? 'on' : ''} onClick=${() => setFilter(k)}>${l}${lists[k].length ? ` (${lists[k].length})` : ''}</button>`)}</div>
    <div class="card">
      ${shown.length ? shown.map((i) => html`<div class="inv">
        <span class="dot" style=${`background:${color(i.clientId)}`}></span>
        <div class="grow"><div style="font-weight:800">${name(i.clientId)}</div>
          <div class="small muted" style="text-transform:none">${monthLabel(i.month)} · ${i.status === 'payee' ? `payée le ${fmtShort(day(i.paidAt))}` : i.status === 'envoyee' ? `à payer avant le ${fmtShort(i.due)}` : `à envoyer le ${fmtShort(i.date)}`}</div>
          ${i.discounts.length ? html`<div class="small" style="color:var(--sage-d);font-weight:700">${i.discounts.map((x) => `${x.label} −${euro(x.amount)}`).join(' · ')}</div>` : null}</div>
        <div style="text-align:right"><div style="font-weight:800">${euro(i.amount)}</div>
          <span class=${`chip ${i.status === 'payee' ? 'sage' : i.late ? 'peach' : i.status === 'envoyee' ? 'blue' : ''}`} style="margin-top:4px">${i.status === 'payee' ? 'Payée' : i.late ? `Retard ${i.daysLate} j` : i.status === 'envoyee' ? 'Envoyée' : 'À envoyer'}</span></div>
        <button class="icon-btn" style="width:40px;height:40px" onClick=${() => setEdit(i)} aria-label="Modifier"><${Icon} name="edit" size=${18} /></button>
      </div>`) : html`<div class="empty">Aucune facture ici.</div>`}
    </div>
    <p class="small muted center" style="margin:0 10px">L’appli suit tes factures : les factures officielles se font dans ton logiciel de facturation.</p>

    ${edit ? html`<${InvoiceSheet} inv=${all.invoices.find((x) => x.key === edit.key) || edit} name=${name(edit.clientId)} ctx=${all.ctx} today=${today} act=${act} onClose=${() => setEdit(null)} />` : null}
  </div>`;
}

function InvoiceSheet({ inv, name, ctx, today, act, onClose }) {
  const [paidAt, setPaidAt] = useState(inv.paidAt ? day(inv.paidAt) : today);
  const [sentAt, setSentAt] = useState(inv.sentAt ? day(inv.sentAt) : today);
  const set = async (status, extra) => { await act.setInvoice(inv, status, extra); onClose(); act.say('Facture mise à jour'); };
  return html`<${Sheet} title=${`Facture de ${monthName(inv.month)} · ${name}`} onClose=${onClose}>
    <div class="card flat"><ul style="list-style:none">${invoiceNote(inv, ctx).map((l) => html`<li style="padding:3px 0">${l}</li>`)}</ul></div>
    ${inv.status === 'a_envoyer' ? html`<${Field} label="Envoyée le"><${Input} type="date" value=${sentAt} onChange=${setSentAt} /></${Field}>
      <button class="btn primary block" onClick=${() => set('envoyee', { sentAt })}>Marquer envoyée</button>` : null}
    ${inv.status === 'envoyee' ? html`<${Field} label="Payée le"><${Input} type="date" value=${paidAt} onChange=${setPaidAt} /></${Field}>
      <button class="btn primary block" onClick=${() => set('payee', { paidAt })}>Marquer payée</button>
      <button class="btn ghost block" onClick=${() => set('a_envoyer')}>Revenir à « à envoyer »</button>` : null}
    ${inv.status === 'payee' ? html`<button class="btn ghost block" onClick=${() => set('envoyee', { paidAt: null })}>Annuler le paiement</button>` : null}
    <p class="small muted" style="margin-top:12px">Une fois envoyée, le montant ne bouge plus, même si tu modifies la cliente ensuite.</p>
  </${Sheet}>`;
}
