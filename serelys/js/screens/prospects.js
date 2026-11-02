import { html, useState } from '../../vendor/preact-htm.js';
import { Icon, Sheet, Field, Input, Select, Seg, PrivacyHint, fmtDate, fmtShort } from '../ui.js';
import { PROSPECT_STAGES, PRIORITIES } from '../engine.js';
import { day } from '../dates.js';
import { importProspects } from '../csv.js';
import { NewClient } from './clients.js';

const CHIP = { a_contacter: '', contactee: 'blue', visio: 'sage', devis: 'peach', cliente: 'sage', non: 'rose' };
const PRIO_CHIP = { haute: 'peach', moyenne: 'blue', basse: '' };
const PRIO_ORDER = ['haute', 'moyenne', 'basse'];
const STAGE_ORDER = Object.keys(PROSPECT_STAGES);

export function ProspectsScreen({ S, all, today, act, openSettings }) {
  const [edit, setEdit] = useState(undefined);
  const [convert, setConvert] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = [...S.prospects].sort((a, b) => PRIO_ORDER.indexOf(a.priorite || 'moyenne') - PRIO_ORDER.indexOf(b.priorite || 'moyenne')
    || STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || (a.name || '').localeCompare(b.name || ''));
  const open = list.filter((p) => p.stage !== 'non' && !(p.stage === 'cliente' && p.clientId));
  const closed = list.filter((p) => !open.includes(p));
  const followUp = (p) => all.tasks.find((t) => t.prospectId === p.id && t.key.startsWith(`p:${p.id}:relance`));
  const put = (p, patch) => act.store.put('prospect', p.id, { ...p, id: undefined, ...patch });
  const setStage = (p, stage) => {
    if (stage === p.stage) return;
    put(p, { stage, stageChangedAt: today, firstContact: stage === 'contactee' && !p.firstContact ? today : p.firstContact || null });
  };

  const importFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = importProspects(await file.text(), S.prospects, today);
      for (const p of r.toAdd) await act.store.put('prospect', act.uid(), p);
      act.say(`${r.toAdd.length} crèche${r.toAdd.length > 1 ? 's' : ''} ajoutée${r.toAdd.length > 1 ? 's' : ''}${r.duplicates ? ` · ${r.duplicates} doublon${r.duplicates > 1 ? 's' : ''} ignoré${r.duplicates > 1 ? 's' : ''}` : ''}`);
    } catch (e) { act.say(`Import impossible : ${e.message}`); }
    setBusy(false);
  };

  const row = (p) => {
    const f = followUp(p);
    return html`<div class="card flat" key=${p.id}>
      <div class="spread" style="align-items:flex-start">
        <button class="grow" style="text-align:left" onClick=${() => setEdit(p)}>
          ${p.entreprise && p.entreprise !== p.name ? html`<div class="small muted" style="font-weight:800">${p.entreprise}</div>` : null}
          <div style="font-size:17px;font-weight:800">${p.name}</div>
          ${p.ville ? html`<div class="small muted">${p.ville}</div>` : null}
        </button>
        <span class=${`chip ${PRIO_CHIP[p.priorite || 'moyenne']}`}>Priorité ${PRIORITIES[p.priorite || 'moyenne'].toLowerCase()}</span>
      </div>
      ${p.pourquoi ? html`<p class="small" style="margin-top:8px">${p.pourquoi}</p>` : null}
      ${f && !f.done ? html`<div class=${`banner ${f.date <= today ? 'warn' : 'info'}`} style="margin:10px 0 0;padding:10px 12px">
        <div class="grow">${f.late || f.date <= today ? 'Contactée il y a 7 jours sans nouvelles : la relancer ?' : `Relance prévue le ${fmtShort(f.date)}`}</div>
        ${f.date <= today ? html`<button class="btn small" onClick=${() => act.toggle(f)}>Relancée</button>` : null}</div>` : null}
      <div class="row wrap" style="gap:6px;margin-top:12px">${STAGE_ORDER.map((k) => html`
        <button class=${`chip ${p.stage === k ? CHIP[k] || 'sage' : ''}`} style=${p.stage === k ? 'box-shadow:var(--shadow-sm)' : 'opacity:.75'}
          onClick=${() => setStage(p, k)} aria-pressed=${p.stage === k}>${PROSPECT_STAGES[k]}</button>`)}</div>
      ${p.stage === 'cliente' && !p.clientId ? html`<button class="btn primary block" style="margin-top:12px" onClick=${() => setConvert(p)}>En faire une cliente</button>` : null}
      ${p.clientId ? html`<button class="btn ghost small" style="margin-top:8px" onClick=${() => act.openClient(p.clientId)}>Voir sa fiche cliente</button>` : null}
    </div>`;
  };

  const marraine = (p) => {
    const r = (p.recommendedBy || '').trim().toLowerCase();
    return r ? S.clients.find((c) => c.name.trim().toLowerCase() === r)?.id || null : null;
  };

  return html`<div class="screen">
    <div class="topbar"><h1>Prospection</h1><button class="icon-btn" onClick=${openSettings} aria-label="Réglages"><${Icon} name="gear" /></button></div>
    <div class="row" style="margin-bottom:14px">
      <button class="btn primary grow" onClick=${() => setEdit(null)}><${Icon} name="plus" /> Ajouter une crèche</button>
      <label class="btn" aria-label="Importer un fichier CSV"><${Icon} name="upload" /> CSV
        <input type="file" accept=".csv,text/csv,text/plain" class="hidden" disabled=${busy} onChange=${(e) => { importFile(e.target.files[0]); e.target.value = ''; }} /></label>
    </div>
    <p class="small muted" style="margin:0 6px 14px">Triées par priorité. Touche une étape pour la changer. Après 7 jours en « Contactée » sans changement, je te propose une relance.</p>
    ${open.length ? open.map(row) : html`<div class="empty">Aucune crèche en cours.</div>`}
    ${closed.length ? html`<div class="section-title"><button class="btn ghost small" onClick=${() => setShowClosed(!showClosed)}>Terminées (${closed.length})</button></div>${showClosed ? closed.map(row) : null}` : null}
    <details class="more" style="margin:16px 6px"><summary>Format du fichier CSV</summary>
      <p class="small muted" style="margin-top:6px">Une ligne par crèche, avec ces colonnes : priorité, entreprise, nom de la crèche, ville, mail, téléphone, site, pourquoi cette crèche. Depuis Excel ou Numbers : « Exporter » au format CSV. Les crèches déjà dans la liste (même mail, ou même nom dans la même ville) sont ignorées.</p></details>
    ${edit !== undefined ? html`<${ProspectSheet} p=${edit} today=${today} clients=${S.clients} onClose=${() => setEdit(undefined)}
      onDelete=${async () => { await act.store.remove('prospect', edit.id); setEdit(undefined); }}
      onSave=${async (p) => {
        const changed = !edit || edit.stage !== p.stage;
        await act.store.put('prospect', edit?.id || act.uid(), { ...p, id: undefined, stageChangedAt: changed ? today : (edit.stageChangedAt || today),
          firstContact: p.stage === 'contactee' && !p.firstContact ? today : p.firstContact || null, createdAt: edit?.createdAt || today });
        setEdit(undefined); act.say('Enregistré');
      }} />` : null}
    ${convert ? html`<${NewClient} S=${S} act=${act} today=${today} config=${all.ctx.config} onClose=${() => setConvert(null)}
      initial=${{ name: convert.name, directorFirstName: convert.directorFirstName || '', directorEmail: convert.directorEmail || '', marraineId: marraine(convert),
        howKnown: convert.recommendedBy ? `Recommandée par ${convert.recommendedBy}` : (convert.howKnown || 'Prospection'), discoveryDate: convert.visioDate ? day(convert.visioDate) : '', fromProspect: convert.id }}
      onCreated=${(id) => { setConvert(null); act.openClient(id); }} />` : null}
  </div>`;
}

function ProspectSheet({ p, today, clients, onClose, onSave, onDelete }) {
  const [v, setV] = useState({ entreprise: '', name: '', ville: '', priorite: 'moyenne', stage: 'a_contacter', pourquoi: '', directorEmail: '', telephone: '', site: '',
    firstContact: '', visioDate: '', recommendedBy: '', directorFirstName: '', notes: '', ...(p || {}) });
  const set = (k) => (x) => setV({ ...v, [k]: x });
  const area = (k) => html`<textarea class="input" value=${v[k]} onInput=${(e) => set(k)(e.target.value)}></textarea>`;
  return html`<${Sheet} title=${p ? p.name : 'Nouvelle crèche'} onClose=${onClose}>
    <${Field} label="Entreprise" hint="Le groupe ou la structure qui gère la crèche (laisse vide si c’est la même)."><${Input} value=${v.entreprise} onChange=${set('entreprise')} /></${Field}>
    <${Field} label="Nom de la crèche"><${Input} value=${v.name} onChange=${set('name')} /></${Field}>
    <${Field} label="Ville"><${Input} value=${v.ville} onChange=${set('ville')} /></${Field}>
    <${Field} label="Priorité"><${Seg} value=${v.priorite} onChange=${set('priorite')} options=${Object.entries(PRIORITIES)} /></${Field}>
    <${Field} label="Étape"><${Select} value=${v.stage} onChange=${(x) => x && set('stage')(x)} options=${Object.entries(PROSPECT_STAGES)} /></${Field}>
    <${Field} label="Pourquoi cette crèche">${area('pourquoi')}<${PrivacyHint} /></${Field}>
    <${Field} label="Mail"><${Input} type="email" value=${v.directorEmail} onChange=${set('directorEmail')} /></${Field}>
    <${Field} label="Téléphone"><${Input} type="tel" value=${v.telephone} onChange=${set('telephone')} /></${Field}>
    <${Field} label="Site"><${Input} type="url" value=${v.site} onChange=${set('site')} placeholder="https://…" /></${Field}>
    ${v.site ? html`<a class="btn small" style="margin:-6px 0 14px" href=${/^https?:/.test(v.site) ? v.site : `https://${v.site}`} target="_blank" rel="noopener"><${Icon} name="link" size=${16} /> Ouvrir le site</a>` : null}
    <${Field} label="Date du premier contact"><${Input} type="date" value=${v.firstContact || ''} onChange=${set('firstContact')} /></${Field}>
    ${v.stage === 'visio' ? html`<${Field} label="Visio prévue le"><${Input} type="datetime-local" value=${v.visioDate || ''} onChange=${set('visioDate')} /></${Field}>` : null}
    <${Field} label="Recommandée par (crèche marraine)" hint=${clients.length ? `Écris le nom exact d’une cliente (ex. ${clients[0].name}) pour le parrainage.` : null}>
      <${Input} value=${v.recommendedBy} onChange=${set('recommendedBy')} list="clients-list" /></${Field}>
    <datalist id="clients-list">${clients.map((c) => html`<option value=${c.name} />`)}</datalist>
    <${Field} label="Prénom de la directrice"><${Input} value=${v.directorFirstName} onChange=${set('directorFirstName')} /></${Field}>
    <${Field} label="Notes">${area('notes')}<${PrivacyHint} /></${Field}>
    ${p?.firstContact ? html`<p class="small muted" style="margin-bottom:10px">Premier contact : ${fmtDate(p.firstContact)}</p>` : null}
    <button class="btn primary block" disabled=${!v.name?.trim()} onClick=${() => onSave({ ...v, name: v.name.trim(), entreprise: (v.entreprise || '').trim() })}>Enregistrer</button>
    ${p ? html`<button class="btn ghost block" style="margin-top:8px" onClick=${onDelete}>Supprimer</button>` : null}
  </${Sheet}>`;
}
