import { html, useState } from '../../vendor/preact-htm.js';
import { Icon, Check, Switch, Field, Input, fmtDate } from '../ui.js';
import { currentLaunchStep } from '../engine.js';
import { day } from '../dates.js';

// Petit résumé sur la fiche du jour : la prochaine étape est dans la fiche elle-même
export function LaunchSummary({ all, act }) {
  const steps = all.launch;
  const done = steps.filter((x) => x.done).length;
  const cur = currentLaunchStep(steps);
  return html`<div class="card flat">
    <div class="spread"><h2 style="margin:0"><${Icon} name="leaf" size=${20} /> Mon lancement</h2><b>${done}/${steps.length}</b></div>
    <div class="progress"><span style=${`width:${steps.length ? Math.round((done / steps.length) * 100) : 0}%`}></span></div>
    ${cur ? html`<div class="small" style="margin-top:8px"><span class="muted">Prochaine étape :</span> <b>${cur.label}</b></div>` : null}
    <div class="row" style="margin-top:10px">
      <button class="btn small grow" onClick=${() => act.openSettings('lancement')}>Mon lancement</button>
      <button class="btn small grow" onClick=${() => act.openSettings('avancement')}>Mon avancement</button>
    </div>
  </div>`;
}

// Mon avancement : 3 réglages simples (les clientes réelles sont comptées toutes seules)
export function Avancement({ all, act, S }) {
  const { ctx } = all;
  const setEntreprise = async (v, date) => {
    await act.saveSettings({ aeCreated: v, ...(date !== undefined ? { aeCreationDate: date || null } : {}) });
    if (S.launch.some((x) => x.id === 'entreprise')) await act.saveStep('entreprise', { done: v, doneAt: v ? new Date().toISOString() : null });
  };
  const real = ctx.realActive.length;
  return html`<div class="card">
    <${Switch} label="Site en ligne" value=${ctx.siteOnline} onChange=${(v) => act.saveSettings({ siteOnline: v })}>
      <div class="small muted" style="font-weight:600">Débloque LinkedIn, Instagram, Facebook et Google Business.</div></${Switch}>
    <${Switch} label="Instagram" value=${ctx.instagram} onChange=${(v) => act.saveSettings({ instagram: v })}>
      <div class="small muted" style="font-weight:600">Affiche les tâches Instagram (masquées par défaut).</div></${Switch}>
    <${Switch} label="Entreprise créée" value=${ctx.entrepriseCreated} onChange=${(v) => setEntreprise(v)}>
      <div class="small muted" style="font-weight:600">Débloque les mails de prospection et les relances.</div></${Switch}>
    ${ctx.entrepriseCreated ? html`<${Field} label="Date de création" hint="Lance le compte à rebours de l’ACRE (60 jours, rappels à J+7, J+30, J+50 et J+58).">
      <${Input} type="date" value=${ctx.settings.aeCreationDate || ''} onChange=${(v) => setEntreprise(true, v)} /></${Field}>` : null}
    <div class="kv" style="margin-top:6px"><span><b>Clientes réelles</b><div class="small muted">Comptées toutes seules depuis l’onglet Clientes (les clientes test ne comptent pas).</div></span><b style="font-size:22px">${real}</b></div>
    <p class="small muted" style="margin-top:10px">${real ? 'Mode clientes actives : les rappels de tes clientes sont dans tes fiches.' : 'Pas encore de vraie cliente : aucun rappel lié aux clientes.'}</p>
  </div>`;
}

// Mon lancement : la liste complète, dans l'ordre, à cocher, modifier et compléter + l'historique « Fait »
export function Lancement({ S, all, act }) {
  const steps = all.launch;
  const [editing, setEditing] = useState(null);
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState('');
  const current = currentLaunchStep(steps);
  const save = async () => { if (label.trim()) await act.saveStep(editing, { label: label.trim() }); setEditing(null); };
  const todos = S.recurring.filter((r) => r.freq?.type === 'todo').map((r) => ({ label: r.title, doneAt: S.taskState[`r:${r.id}`]?.done ? S.taskState[`r:${r.id}`].doneAt : null }));
  const history = [...steps.filter((x) => x.done).map((x) => ({ label: x.label, doneAt: x.doneAt })), ...todos.filter((x) => x.doneAt)]
    .sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
  return html`
    <p class="small muted" style="margin:0 6px 14px">Une étape à la fois : seule la prochaine apparaît sur ma fiche du jour. Touche une étape pour la modifier.</p>
    <div class="card">
      ${steps.map((x, i) => html`<div class="item" key=${x.id} style=${x === current ? 'font-weight:800' : ''}>
        <${Check} on=${!!x.done} onClick=${() => act.saveStep(x.id, { done: !x.done, doneAt: x.done ? null : new Date().toISOString() })} label=${x.label} />
        <span class="small muted" style="width:22px;text-align:right">${i + 1}.</span>
        ${editing === x.id
          ? html`<input class="input grow" value=${label} onInput=${(e) => setLabel(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && save()} onBlur=${save} autofocus />`
          : html`<span class="grow" style=${x.done ? 'text-decoration:line-through;color:var(--ink-3)' : ''} onClick=${() => { setEditing(x.id); setLabel(x.label); }}>${x.label}</span>`}
        ${x === current ? html`<span class="chip sage">En cours</span>` : null}
        <button class="icon-btn" style="width:34px;height:34px;box-shadow:none" onClick=${() => act.deleteStep(x.id)} aria-label=${`Supprimer « ${x.label} »`}><${Icon} name="close" size=${15} /></button>
      </div>`)}
      ${!steps.length ? html`<div class="empty">Aucune étape.</div>` : !current ? html`<div class="small muted" style="margin:6px 0">Toutes les étapes sont faites. Bravo !</div>` : null}
      <div class="row" style="margin-top:10px">
        <input class="input grow" placeholder="Ajouter une étape" value=${adding} onInput=${(e) => setAdding(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && adding.trim()) { act.addStep(adding.trim()); setAdding(''); } }} />
        <button class="btn small" disabled=${!adding.trim()} onClick=${() => { act.addStep(adding.trim()); setAdding(''); }} aria-label="Ajouter l’étape"><${Icon} name="plus" size=${18} /></button>
      </div>
    </div>
    <div class="section-title"><span>Fait</span><span>${history.length}</span></div>
    <div class="card flat">${history.length ? history.map((h) => html`<div class="kv"><span style="text-decoration:line-through;color:var(--ink-2)">${h.label}</span><b class="small">${h.doneAt ? fmtDate(day(h.doneAt)) : ''}</b></div>`)
      : html`<div class="empty">Rien de coché pour l’instant.</div>`}</div>`;
}
