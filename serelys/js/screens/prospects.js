import { html, useState } from '../../vendor/preact-htm.js';
import { Icon, Sheet, Field, Input, Select, PrivacyHint, fmtDate, fmtShort } from '../ui.js';
import { PROSPECT_STAGES } from '../engine.js';
import { addDays, day } from '../dates.js';
import { NewClient } from './clients.js';

const CHIP = { a_contacter: '', contactee: 'blue', visio: 'sage', devis: 'peach', signee: 'sage', non: 'rose' };
const ORDER = Object.keys(PROSPECT_STAGES);

export function ProspectsScreen({ S, all, today, act, openSettings }) {
  const [edit, setEdit] = useState(undefined);
  const [convert, setConvert] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const list = [...S.prospects].sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || (a.name || '').localeCompare(b.name || ''));
  const open = list.filter((p) => p.stage !== 'non' && !(p.stage === 'signee' && p.clientId));
  const closed = list.filter((p) => !open.includes(p));
  const followUp = (p) => all.tasks.find((t) => t.key === `p:${p.id}:relance`);
  const setStage = (p, stage) => act.store.put('prospect', p.id, { ...p, id: undefined, stage, firstContact: stage === 'contactee' && !p.firstContact ? today : p.firstContact });

  const row = (p) => {
    const f = followUp(p);
    return html`<div class="card flat" key=${p.id}>
      <div class="spread"><b style="font-size:17px" class="grow">${p.name}</b><span class=${`chip ${CHIP[p.stage]}`}>${PROSPECT_STAGES[p.stage]}</span></div>
      <div class="small muted" style="margin-top:4px">
        ${p.firstContact ? `Premier contact : ${fmtDate(p.firstContact)}` : 'Pas encore contactée'}
        ${p.recommendedBy ? ` · recommandée par ${p.recommendedBy}` : ''}</div>
      ${f && !f.done ? html`<div class=${`small ${f.late ? '' : 'muted'}`} style="margin-top:4px;font-weight:700">${f.late ? 'À relancer depuis le' : 'Relance prévue le'} ${fmtShort(f.date)}</div>` : null}
      <div class="row wrap" style="margin-top:12px">
        <div class="grow"><${Select} value=${p.stage} onChange=${(v) => v && setStage(p, v)} options=${Object.entries(PROSPECT_STAGES)} /></div>
        <button class="icon-btn" onClick=${() => setEdit(p)} aria-label="Modifier"><${Icon} name="edit" /></button></div>
      ${p.stage === 'signee' && !p.clientId ? html`<button class="btn primary block" style="margin-top:10px" onClick=${() => setConvert(p)}>En faire une cliente</button>` : null}
      ${p.clientId ? html`<button class="btn ghost small" style="margin-top:8px" onClick=${() => act.openClient(p.clientId)}>Voir sa fiche cliente</button>` : null}
    </div>`;
  };

  const marraine = (p) => {
    const r = (p.recommendedBy || '').trim().toLowerCase();
    return r ? S.clients.find((c) => c.name.trim().toLowerCase() === r)?.id || null : null;
  };

  return html`<div class="screen">
    <div class="topbar"><h1>Prospection</h1><button class="icon-btn" onClick=${openSettings} aria-label="Réglages"><${Icon} name="gear" /></button></div>
    <button class="btn primary block" style="margin-bottom:18px" onClick=${() => setEdit(null)}><${Icon} name="plus" /> Ajouter une crèche à contacter</button>
    <p class="small muted" style="margin:0 6px 14px">Quand tu passes une crèche à « Contactée », je te rappelle de la relancer ${all.ctx.config.prospectFollowUpDays} jours après (une seule relance).</p>
    ${open.length ? open.map(row) : html`<div class="empty">Aucune crèche en cours.</div>`}
    ${closed.length ? html`<div class="section-title"><button class="btn ghost small" onClick=${() => setShowClosed(!showClosed)}>Terminées (${closed.length})</button></div>${showClosed ? closed.map(row) : null}` : null}
    ${edit !== undefined ? html`<${ProspectSheet} p=${edit} today=${today} clients=${S.clients} onClose=${() => setEdit(undefined)}
      onDelete=${async () => { await act.store.remove('prospect', edit.id); setEdit(undefined); }}
      onSave=${async (p) => { await act.store.put('prospect', edit?.id || act.uid(), { ...p, id: undefined }); setEdit(undefined); act.say('Enregistré'); }} />` : null}
    ${convert ? html`<${NewClient} S=${S} act=${act} today=${today} config=${all.ctx.config} onClose=${() => setConvert(null)}
      initial=${{ name: convert.name, directorFirstName: convert.directorFirstName || '', directorEmail: convert.directorEmail || '', marraineId: marraine(convert),
        howKnown: convert.recommendedBy ? `Recommandée par ${convert.recommendedBy}` : (convert.howKnown || 'Prospection'), discoveryDate: convert.visioDate ? day(convert.visioDate) : '', fromProspect: convert.id }}
      onCreated=${(id) => { setConvert(null); act.openClient(id); }} />` : null}
  </div>`;
}

function ProspectSheet({ p, today, clients, onClose, onSave, onDelete }) {
  const [v, setV] = useState(p || { name: '', stage: 'a_contacter', firstContact: '', recommendedBy: '', directorFirstName: '', directorEmail: '', notes: '', visioDate: '' });
  const set = (k) => (x) => setV({ ...v, [k]: x });
  return html`<${Sheet} title=${p ? p.name : 'Nouvelle crèche'} onClose=${onClose}>
    <${Field} label="Nom de la crèche"><${Input} value=${v.name} onChange=${set('name')} /></${Field}>
    <${Field} label="Étape"><${Select} value=${v.stage} onChange=${set('stage')} options=${Object.entries(PROSPECT_STAGES)} /></${Field}>
    <${Field} label="Date du premier contact"><${Input} type="date" value=${v.firstContact} onChange=${set('firstContact')} /></${Field}>
    ${v.stage === 'visio' ? html`<${Field} label="Visio découverte"><${Input} type="datetime-local" value=${v.visioDate} onChange=${set('visioDate')} /></${Field}>` : null}
    <${Field} label="Recommandée par (crèche marraine)" hint=${clients.length ? `Écris le nom exact d’une cliente (ex. ${clients[0].name}) pour le parrainage.` : null}>
      <${Input} value=${v.recommendedBy} onChange=${set('recommendedBy')} list="clients-list" /></${Field}>
    <datalist id="clients-list">${clients.map((c) => html`<option value=${c.name} />`)}</datalist>
    <${Field} label="Prénom de la directrice"><${Input} value=${v.directorFirstName} onChange=${set('directorFirstName')} /></${Field}>
    <${Field} label="Mail professionnel"><${Input} type="email" value=${v.directorEmail} onChange=${set('directorEmail')} /></${Field}>
    <${Field} label="Notes"><textarea class="input" value=${v.notes} onInput=${(e) => set('notes')(e.target.value)}></textarea><${PrivacyHint} /></${Field}>
    <button class="btn primary block" disabled=${!v.name?.trim()} onClick=${() => onSave({ ...v, name: v.name.trim() })}>Enregistrer</button>
    ${p ? html`<button class="btn ghost block" style="margin-top:8px" onClick=${onDelete}>Supprimer</button>` : null}
  </${Sheet}>`;
}
