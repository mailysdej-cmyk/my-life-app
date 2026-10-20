import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Icon, Sheet, Field, Input, TextLine, Text, Seg, Switch, Select, TaskRow, euro, fmtDate, fmtShort } from '../ui.js';
import { clientDates, clientStage, clientServices, monthlyPrice, onboardingProgress, STAGES, STYLES, makeContext } from '../engine.js';
import { addMonthsYm, firstOf, lastOf, ym, day, monthLabel, addDays, addMonths, isDate } from '../dates.js';

const STAGE_CHIP = { prospect: '', setup: 'blue', offert: 'rose', active: 'sage', preavis: 'peach', ancienne: '' };

export function ClientsScreen(p) {
  const { S, all, today, act, clientId, setClientId, openSettings } = p;
  const [wizard, setWizard] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const c = clientId && S.clients.find((x) => x.id === clientId);
  if (c) return html`<${ClientDetail} ...${p} c=${c} onBack=${() => setClientId(null)} />`;
  const config = all.ctx.config;
  const withStage = S.clients.map((x) => ({ c: x, stage: clientStage(x, today) }));
  const order = ['setup', 'offert', 'active', 'preavis', 'prospect'];
  const current = withStage.filter((x) => x.stage !== 'ancienne').sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.c.name.localeCompare(b.c.name));
  const old = withStage.filter((x) => x.stage === 'ancienne');
  const card = ({ c: x, stage }) => {
    const prog = onboardingProgress(all, x.id);
    const price = monthlyPrice(x, config, today);
    return html`<button class="card client-card" onClick=${() => setClientId(x.id)}>
      <div class="spread"><div class="row grow"><span class="dot" style=${`background:${x.color};width:16px;height:16px`}></span><b style="font-size:18px">${x.name}</b></div>
        <span class=${`chip ${STAGE_CHIP[stage]}`}>${STAGES[stage]}</span></div>
      <div class="spread" style="margin-top:10px"><span class="chip">${config.plans[x.plan]?.label}</span><span class="price">${euro(price)}<span class="small muted"> /mois</span></span></div>
      ${stage === 'setup' || stage === 'prospect' || (prog.ratio < 1 && stage !== 'ancienne') ? html`<div class="progress" aria-label="Mise en place"><span style=${`width:${Math.round(prog.ratio * 100)}%`}></span></div>
        <div class="small muted" style="margin-top:6px">Mise en place : ${Math.round(prog.ratio * 100)} %</div>` : null}
    </button>`;
  };
  return html`<div class="screen">
    <div class="topbar"><h1>Mes clientes</h1><button class="icon-btn" onClick=${openSettings} aria-label="Réglages"><${Icon} name="gear" /></button></div>
    <button class="btn primary block" style="margin-bottom:20px" onClick=${() => setWizard(true)}><${Icon} name="plus" /> Nouvelle cliente</button>
    ${current.length ? current.map(card) : html`<div class="empty">Aucune cliente pour l’instant. Appuie sur « Nouvelle cliente ».</div>`}
    ${old.length ? html`<div class="section-title"><button class="btn ghost small" onClick=${() => setShowOld(!showOld)}>Anciennes clientes (${old.length})</button></div>${showOld ? old.map(card) : null}` : null}
    ${wizard ? html`<${NewClient} S=${S} act=${act} today=${today} config=${config} onClose=${() => setWizard(false)} onCreated=${(id) => { setWizard(false); setClientId(id); }} />` : null}
  </div>`;
}

// ---------------------------------------------------------------- Nouvelle cliente (formulaire en étapes)

export function NewClient({ S, act, today, config, onClose, onCreated, initial = {} }) {
  const nextMonth = addMonthsYm(ym(today), 1);
  const [step, setStep] = useState(1);
  const [c, setC] = useState({
    name: '', directorFirstName: '', directorEmail: '', plan: 'premium', style: 'classique', marraineId: null, howKnown: '',
    discoveryDate: today, offertOn: true, offertStart: firstOf(nextMonth), offertEnd: lastOf(nextMonth), startDate: firstOf(nextMonth), ...initial,
  });
  const set = (k) => (v) => setC({ ...c, [k]: v });
  const marraines = S.clients.filter((x) => clientStage(x, today) !== 'ancienne');
  const create = async () => {
    const id = act.uid();
    const data = {
      name: c.name.trim(), directorFirstName: c.directorFirstName.trim(), directorEmail: c.directorEmail.trim(), plan: c.plan, style: c.style,
      marraineId: c.marraineId || null, howKnown: c.howKnown || '', color: act.newClientColor(), createdAt: today,
      discoveryDate: c.discoveryDate || null,
      offert: c.offertOn ? { enabled: true, start: c.offertStart, end: c.offertEnd } : { enabled: false },
      startDate: c.offertOn ? c.offertStart : c.startDate,
      swaps: [], addons: [], visios: {}, reunions: {}, links: {}, notes: '', fromProspect: initial.fromProspect || null,
    };
    await act.store.put('client', id, data);
    if (initial.fromProspect) {
      const pr = S.prospects.find((x) => x.id === initial.fromProspect);
      if (pr) await act.store.put('prospect', pr.id, { ...pr, id: undefined, clientId: id });
    }
    act.say('Cliente créée : toutes ses tâches sont prêtes');
    onCreated(id);
  };
  return html`<${Sheet} title=${`Nouvelle cliente · ${step}/3`} onClose=${onClose}>
    ${step === 1 ? html`
      <${Field} label="Nom de la crèche"><${Input} value=${c.name} onChange=${set('name')} placeholder="Ex. Crèche Les Petits Pas" /></${Field}>
      <${Field} label="Prénom de la directrice"><${Input} value=${c.directorFirstName} onChange=${set('directorFirstName')} /></${Field}>
      <${Field} label="Mail professionnel de la directrice"><${Input} type="email" value=${c.directorEmail} onChange=${set('directorEmail')} /></${Field}>
      <button class="btn primary block" disabled=${!c.name.trim()} onClick=${() => setStep(2)}>Continuer</button>` : null}
    ${step === 2 ? html`
      <${Field} label="Forfait"><${Seg} value=${c.plan} onChange=${set('plan')} options=${Object.entries(config.plans).map(([k, p]) => [k, `${p.label} ${p.price} €`])} /></${Field}>
      <${Field} label="Style de ses documents"><${Seg} value=${c.style} onChange=${set('style')} options=${Object.entries(STYLES).map(([k, l]) => [k, l[0].toUpperCase() + l.slice(1)])} /></${Field}>
      <${Field} label="Comment elle a connu Serelys"><${Input} value=${c.howKnown} onChange=${set('howKnown')} placeholder="Ex. bouche à oreille, salon, LinkedIn…" /></${Field}>
      <${Field} label="Crèche marraine (parrainage)"><${Select} value=${c.marraineId} onChange=${set('marraineId')} empty="Aucune" options=${marraines.map((x) => [x.id, x.name])} /></${Field}>
      <div class="row"><button class="btn ghost" onClick=${() => setStep(1)}>Retour</button><button class="btn primary grow" onClick=${() => setStep(3)}>Continuer</button></div>` : null}
    ${step === 3 ? html`
      <${Field} label="Date de la visio découverte" hint="Laisse vide si elle a déjà eu lieu avant."><${Input} type="date" value=${c.discoveryDate} onChange=${set('discoveryDate')} /></${Field}>
      <${Switch} label="Elle prend le 1er mois offert" value=${c.offertOn} onChange=${set('offertOn')} />
      ${c.offertOn ? html`<div class="row"><div class="grow"><${Field} label="Début du mois offert"><${Input} type="date" value=${c.offertStart}
          onChange=${(v) => setC({ ...c, offertStart: v, offertEnd: isDate(v) ? addDays(addMonths(v, 1), -1) : c.offertEnd })} /></${Field}></div>
        <div class="grow"><${Field} label="Fin du mois offert"><${Input} type="date" value=${c.offertEnd} onChange=${set('offertEnd')} /></${Field}></div></div>
        <div class="info small">Sa première facture partira le ${isDate(c.offertEnd) ? fmtDate(firstOf(addMonthsYm(ym(c.offertEnd), 1))) : '…'}.</div>`
      : html`<${Field} label="Date de début du contrat"><${Input} type="date" value=${c.startDate} onChange=${set('startDate')} /></${Field}>`}
      <div class="row" style="margin-top:12px"><button class="btn ghost" onClick=${() => setStep(2)}>Retour</button>
        <button class="btn primary grow" onClick=${create}>Créer la cliente</button></div>` : null}
  </${Sheet}>`;
}

// ---------------------------------------------------------------- Fiche cliente

function ClientDetail({ S, all, today, act, c, onBack, settings }) {
  const config = all.ctx.config;
  const save = (patch) => act.saveClient({ ...c, ...patch });
  const setLink = (k) => (v) => save({ links: { ...(c.links || {}), [k]: v } });
  const d = clientDates(c);
  const stage = clientStage(c, today);
  const services = clientServices(c, config, today);
  const svc = new Set(services.map((s) => s.id));
  const rank = config.plans[c.plan]?.rank || 1;
  const prog = onboardingProgress(all, c.id);
  const [stopOpen, setStopOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const myTasks = all.tasks.filter((t) => t.clientId === c.id && !t.hidden);
  const upcoming = myTasks.filter((t) => !t.done && t.end >= today).slice(0, showAll ? 60 : 8);
  const late = myTasks.filter((t) => t.late);
  const steps = myTasks.filter((t) => t.onboarding && t.step);
  const invoices = all.invoices.filter((i) => i.clientId === c.id);
  const filleules = S.clients.filter((x) => x.marraineId === c.id);
  const credit = all.invoices.credits?.filter((x) => x.marraineId === c.id) || [];
  const priceNow = monthlyPrice(c, config, today);
  const priceAfter = monthlyPrice({ ...c, addons: (c.addons || []).map((a) => ({ ...a, trialEnd: null, since: null })) }, config, today);

  const own = config.services.filter((s) => (config.plans[s.plan]?.rank || 1) <= rank);
  const others = config.services.filter((s) => (config.plans[s.plan]?.rank || 1) !== rank && !svc.has(s.id));
  const higher = config.services.filter((s) => (config.plans[s.plan]?.rank || 1) > rank && !svc.has(s.id));
  const months = [ym(today), addMonthsYm(ym(today), 1)];
  const planLabel = (s) => config.plans[s.plan]?.label;

  return html`<div class="screen">
    <div class="topbar"><button class="icon-btn" onClick=${onBack} aria-label="Retour"><${Icon} name="back" /></button>
      <div class="grow" style="min-width:0"><div class="row"><span class="dot" style=${`background:${c.color};width:14px;height:14px`}></span><h1 style="font-size:23px;overflow:hidden;text-overflow:ellipsis">${c.name}</h1></div></div>
      <span class=${`chip ${STAGE_CHIP[stage]}`}>${STAGES[stage]}</span></div>

    ${svc.has('visio') && c.plan === 'premium' ? html`<div class="banner info"><${Icon} name="heart" /> Support prioritaire : répondre sous 24 h ouvrées.</div>` : null}
    ${late.length ? html`<div class="banner warn"><${Icon} name="alert" /> ${late.length} tâche(s) en retard pour cette cliente.</div>` : null}

    <div class="card">
      <div class="spread"><h2 style="margin:0">Forfait</h2><div class="price">${euro(priceNow)}<span class="small muted"> /mois</span></div></div>
      ${priceAfter !== priceNow ? html`<div class="small muted" style="text-align:right">${euro(priceAfter)} /mois après l’essai</div>` : null}
      <div style="margin-top:12px"><${Seg} value=${c.plan} onChange=${(v) => save({ plan: v, swaps: [], addons: (c.addons || []).filter((a) => (config.plans[config.services.find((s) => s.id === a.service)?.plan]?.rank || 1) > (config.plans[v]?.rank || 1)) })}
        options=${Object.entries(config.plans).map(([k, p]) => [k, p.label])} /></div>
      <h3>Ses prestations</h3>
      <div class="row wrap">${services.map((s) => html`<span class="chip ${s.plan === c.plan ? '' : 'blue'}">${s.label}</span>`)}</div>

      <h3>Échanges (prix inchangé, ${config.maxSwaps} max)</h3>
      ${(c.swaps || []).map((sw, i) => html`<div class="row" style="margin-bottom:8px">
        <span class="grow small"><b>${config.services.find((s) => s.id === sw.remove)?.label}</b> → <b>${config.services.find((s) => s.id === sw.add)?.label}</b></span>
        <button class="btn small ghost" onClick=${() => save({ swaps: c.swaps.filter((_, j) => j !== i) })}>Annuler</button></div>`)}
      ${(c.swaps || []).length < config.maxSwaps ? html`<${SwapForm} own=${own.filter((s) => svc.has(s.id))} others=${others} planLabel=${planLabel}
        onAdd=${(sw) => save({ swaps: [...(c.swaps || []), sw] })} />` : null}

      <h3>Ajouts (+${config.addonPrice} €/mois chacun, ${config.maxAddons} max)</h3>
      ${(c.addons || []).map((a, i) => html`<div class="stack" style="margin-bottom:12px">
        <div class="row"><span class="grow"><b>${config.services.find((s) => s.id === a.service)?.label}</b></span>
          <button class="btn small ghost" onClick=${() => save({ addons: c.addons.filter((_, j) => j !== i) })}>Retirer</button></div>
        <${Field} label="Fin de l’essai gratuit (facultatif)"><${Input} type="date" value=${a.trialEnd || ''}
          onChange=${(v) => save({ addons: c.addons.map((x, j) => (j === i ? { ...x, trialEnd: v || null } : x)) })} /></${Field}></div>`)}
      ${(c.addons || []).length < config.maxAddons && higher.length ? html`<${Select} value="" empty="+ Ajouter une prestation d’un forfait supérieur"
        options=${higher.map((s) => [s.id, `${s.label} (${planLabel(s)})`])} onChange=${(v) => v && save({ addons: [...(c.addons || []), { service: v, trialEnd: null, since: today }] })} />` : null}
    </div>

    <div class="card">
      <h2>Mise en place</h2>
      <div class="progress"><span style=${`width:${Math.round(prog.ratio * 100)}%`}></span></div>
      <div class="small muted" style="margin:6px 0 12px">${Math.round(prog.ratio * 100)} % · étapes cochées ici ou dans « Aujourd’hui »</div>
      <div class="row"><div class="grow"><${Field} label="Visio découverte"><${Input} type="datetime-local" value=${c.discoveryDate?.length > 10 ? c.discoveryDate : c.discoveryDate ? `${c.discoveryDate}T10:00` : ''} onChange=${(v) => save({ discoveryDate: v || null })} /></${Field}></div></div>
      <${Field} label="Comment elle a connu Serelys"><${TextLine} value=${c.howKnown} onChange=${(v) => save({ howKnown: v })} /></${Field}>
      <div class="row"><div class="grow"><${Field} label="Devis envoyé le"><${Input} type="date" value=${c.quoteSentDate || ''} onChange=${(v) => {
        if (v && !settings.aeCreated) { act.say('Pas de devis avant le SIRET : coche « Auto-entreprise créée » dans Réglages.'); return; }
        save({ quoteSentDate: v || null });
      }} /></${Field}></div>
      <div class="grow"><${Field} label="Devis accepté le"><${Input} type="date" value=${c.quoteAccepted || ''} onChange=${(v) => save({ quoteAccepted: v || null })} /></${Field}></div></div>
      ${!settings.aeCreated ? html`<div class="warn small"><${Icon} name="lock" size=${14} /> Bouton « Envoyer le devis » bloqué : aucun devis ni facture avant d’avoir ton SIRET. Coche « Auto-entreprise créée » dans Réglages.</div>` : null}
      <${Field} label="Visio de signature"><${Input} type="datetime-local" value=${c.signatureVisioDate || ''} onChange=${(v) => save({ signatureVisioDate: v || null })} /></${Field}>
      <${Field} label="Contrat signé reçu le"><${Input} type="date" value=${c.contractSignedDate || ''} onChange=${(v) => save({ contractSignedDate: v || null })} /></${Field}>
      ${steps.length ? html`<h3>Étapes</h3>${steps.map((t) => html`<${TaskRow} key=${t.key} t=${t} today=${today} act=${act} showClient=${false} />`)}` : null}
    </div>

    <div class="card">
      <h2>Dates du contrat</h2>
      <${Switch} label="1er mois offert" value=${!!c.offert?.enabled} onChange=${(v) => save({ offert: v ? { enabled: true, start: c.offert?.start || c.startDate || firstOf(addMonthsYm(ym(today), 1)), end: c.offert?.end || lastOf(ym(c.offert?.start || c.startDate || firstOf(addMonthsYm(ym(today), 1)))) } : { ...(c.offert || {}), enabled: false } })} />
      ${c.offert?.enabled ? html`<div class="row"><div class="grow"><${Field} label="Début"><${Input} type="date" value=${c.offert.start} onChange=${(v) => save({ offert: { ...c.offert, start: v }, startDate: v })} /></${Field}></div>
        <div class="grow"><${Field} label="Fin"><${Input} type="date" value=${c.offert.end} onChange=${(v) => save({ offert: { ...c.offert, end: v } })} /></${Field}></div></div>`
      : html`<${Field} label="Date de début"><${Input} type="date" value=${c.startDate || ''} onChange=${(v) => save({ startDate: v || null })} /></${Field}>`}
      ${d.paidStart ? html`<div class="kv"><span>Première facture</span><b>${fmtDate(d.paidStart)}</b></div>` : null}
      ${d.end ? html`<div class="kv"><span>Fin du contrat</span><b>${fmtDate(d.end)}</b></div>` : null}
    </div>

    ${svc.has('visio') || svc.has('reunion') ? html`<div class="card">
      <h2>Visios et réunions</h2>
      ${months.map((m) => html`<h3 style="text-transform:capitalize">${monthLabel(m)}</h3>
        ${svc.has('visio') ? html`<${Field} label="Visio de suivi (30 min)"><${Input} type="datetime-local" value=${c.visios?.[m] || ''} onChange=${(v) => save({ visios: { ...(c.visios || {}), [m]: v || undefined } })} /></${Field}>` : null}
        ${svc.has('reunion') ? html`<${Field} label="Réunion d’équipe de la crèche"><${Input} type="date" value=${c.reunions?.[m] || ''} onChange=${(v) => save({ reunions: { ...(c.reunions || {}), [m]: v || undefined } })} /></${Field}>` : null}`)}
    </div>` : null}

    <div class="card">
      <h2>Parrainage</h2>
      <${Field} label="Sa marraine"><${Select} value=${c.marraineId} onChange=${(v) => save({ marraineId: v })} empty="Aucune" options=${S.clients.filter((x) => x.id !== c.id).map((x) => [x.id, x.name])} /></${Field}>
      ${filleules.length ? html`<div class="kv"><span>Ses filleules</span><b>${filleules.map((f) => f.name).join(', ')}</b></div>` : null}
      ${credit.map((x) => html`<div class="kv"><span>Remise ${euro(x.amount)} (filleule ${S.clients.find((f) => f.id === x.filleuleId)?.name})</span><b>${x.granted ? 'accordée' : `non accordée : ${x.reason}`}</b></div>`)}
    </div>

    <div class="card">
      <h2>Directrice et style</h2>
      <${Field} label="Prénom"><${TextLine} value=${c.directorFirstName} onChange=${(v) => save({ directorFirstName: v })} /></${Field}>
      <${Field} label="Mail professionnel"><${TextLine} type="email" value=${c.directorEmail} onChange=${(v) => save({ directorEmail: v })} /></${Field}>
      ${c.directorEmail ? html`<a class="btn small" href=${`mailto:${c.directorEmail}`}>Lui écrire</a>` : null}
      <h3>Style de ses documents</h3>
      <${Seg} value=${c.style || 'classique'} onChange=${(v) => save({ style: v })} options=${Object.entries(STYLES).map(([k, l]) => [k, l[0].toUpperCase() + l.slice(1)])} />
      <h3>Couleur</h3>
      <div class="row wrap">${['#A9C4B0', '#A7C7CF', '#F2C9AE', '#EBC4C0', '#C9B8D9', '#E6D49A', '#B5CDA3', '#9FB8D8'].map((col) => html`<button onClick=${() => save({ color: col })} aria-label="Couleur"
        style=${`width:36px;height:36px;border-radius:12px;background:${col};box-shadow:${c.color === col ? '0 0 0 3px var(--ink)' : 'var(--shadow-sm)'}`}></button>`)}</div>
    </div>

    <div class="card">
      <h2>Liens utiles</h2>
      ${[['drive', 'Son Drive'], ['rappels', 'Son tableau de rappels'], ['boite', 'Sa boîte mail']].map(([k, l]) => html`<${Field} label=${l}>
        <div class="row"><div class="grow"><${TextLine} type="url" value=${c.links?.[k]} onChange=${setLink(k)} placeholder="https://…" /></div>
        ${c.links?.[k] ? html`<a class="icon-btn" href=${c.links[k]} target="_blank" rel="noopener" aria-label=${`Ouvrir ${l}`}><${Icon} name="link" /></a>` : null}</div></${Field}>`)}
      ${settings.libraryUrl ? html`<a class="btn small block" href=${settings.libraryUrl} target="_blank" rel="noopener"><${Icon} name="link" /> Bibliothèque Serelys</a>` : html`<div class="small muted">Lien de la Bibliothèque Serelys : à mettre dans Réglages.</div>`}
    </div>

    <div class="card"><h2>Notes</h2><${Text} value=${c.notes} onChange=${(v) => save({ notes: v })} placeholder="Notes libres sur la crèche" /></div>

    <div class="card">
      <h2>Ses prochaines tâches</h2>
      ${upcoming.length ? html`<div class="timeline">${upcoming.map((t) => html`<div class="tl" style=${`--c:${t.late ? 'var(--peach)' : c.color}`}><div class="d">${fmtDate(t.date)}${t.due && t.due !== t.date ? ` → ${fmtShort(t.due)}` : ''}</div><div style="font-weight:700">${t.title}</div></div>`)}</div>
        <button class="btn small ghost" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Voir moins' : 'Voir les 3 prochains mois'}</button>` : html`<div class="empty">Rien de prévu.</div>`}
    </div>

    <div class="card">
      <h2>Factures</h2>
      ${invoices.length ? invoices.map((i) => html`<div class="kv"><span style="text-transform:capitalize">${monthLabel(i.month)}</span><b>${euro(i.amount)} · ${i.status === 'payee' ? 'payée' : i.status === 'envoyee' ? (i.late ? 'en retard' : 'envoyée') : 'à envoyer'}</b></div>`) : html`<div class="empty">Pas encore de facture.</div>`}
    </div>

    <div class="card">
      <h2>Arrêt du contrat</h2>
      ${c.stop?.requestDate ? html`
        <div class="kv"><span>Mail reçu le</span><b>${fmtDate(c.stop.requestDate)}</b></div>
        <div class="kv"><span>${d.noNotice ? 'Sans préavis (mois offert)' : 'Préavis d’un mois'} · fin le</span><b>${fmtDate(d.end)}</b></div>
        ${invoices.length ? html`<div class="kv"><span>Dernière facture</span><b>${euro(invoices[invoices.length - 1].amount)}${invoices[invoices.length - 1].prorata ? ' (au prorata)' : ''}</b></div>` : null}
        <div class="small muted" style="margin:8px 0">Elle passera dans « Anciennes clientes » après cette date (jamais supprimée). La checklist de fin arrivera le lendemain.</div>
        <button class="btn small ghost" onClick=${() => save({ stop: null })}>Annuler l’arrêt</button>`
      : html`<button class="btn peach block" onClick=${() => setStopOpen(true)}>La cliente arrête</button>`}
    </div>

    <details class="more" style="margin:10px 6px 30px"><summary>Supprimer définitivement (erreur de saisie, clientes de test)</summary>
      ${confirmDel ? html`<div class="warn">Tout ce qui concerne ${c.name} sera effacé. Sûre ?</div>
        <div class="row"><button class="btn rose" onClick=${async () => { await act.store.remove('client', c.id); onBack(); act.say('Cliente supprimée'); }}>Oui, supprimer</button><button class="btn ghost" onClick=${() => setConfirmDel(false)}>Non</button></div>`
      : html`<p class="small muted" style="margin:6px 0">Pour une vraie cliente qui arrête, utilise plutôt « La cliente arrête ».</p><button class="btn small ghost" onClick=${() => setConfirmDel(true)}><${Icon} name="trash" size=${16} /> Supprimer</button>`}
    </details>

    ${stopOpen ? html`<${StopSheet} c=${c} today=${today} onClose=${() => setStopOpen(false)} onSave=${(date) => { save({ stop: { requestDate: date } }); setStopOpen(false); }} />` : null}
  </div>`;
}

function SwapForm({ own, others, planLabel, onAdd }) {
  const [remove, setRemove] = useState('');
  const [add, setAdd] = useState('');
  return html`<div class="stack">
    <${Select} value=${remove} onChange=${setRemove} empty="Elle ne veut plus…" options=${own.map((s) => [s.id, s.label])} />
    <${Select} value=${add} onChange=${setAdd} empty="…et prend à la place" options=${others.map((s) => [s.id, `${s.label} (${planLabel(s)})`])} />
    <button class="btn small blue" disabled=${!remove || !add} onClick=${() => { onAdd({ remove, add }); setRemove(''); setAdd(''); }}>Échanger</button></div>`;
}

function StopSheet({ c, today, onClose, onSave }) {
  const [date, setDate] = useState(today);
  const d = clientDates({ ...c, stop: { requestDate: date } });
  return html`<${Sheet} title="La cliente arrête" onClose=${onClose}>
    <${Field} label="Date de son mail"><${Input} type="date" value=${date} onChange=${setDate} /></${Field}>
    ${isDate(date) ? html`<div class="info">${d.noNotice ? 'Pendant ou à la fin du mois offert : sans préavis.' : 'Préavis d’un mois.'} Fin du contrat : <b>${fmtDate(d.end)}</b>.</div>` : null}
    <button class="btn peach block" onClick=${() => onSave(date)}>Enregistrer l’arrêt</button></${Sheet}>`;
}
