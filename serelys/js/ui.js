// Petits composants partagés : icônes arrondies, champs, feuilles, ligne de tâche.
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { fmtDate, fmtShort, day } from './dates.js';
import { euro } from './engine.js';

export { html };

const P = {
  today: 'M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4L6 18M18 6l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
  clients: 'M4 20v-1a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v1M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM16 11a3 3 0 1 0 0-6M17 14a4.5 4.5 0 0 1 3.5 4.4V20',
  money: 'M4 7.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17V9A1.5 1.5 0 0 1 4 7.5zM12 15.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM6 4.5h12',
  prospect: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20.5 20.5l-4.5-4.5M11 8v6M8 11h6',
  cards: 'M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5zM9.5 10a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4M12 16.5h.01',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.6l-2-3.4l-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1l-2 3.4l2 1.6a7.5 7.5 0 0 0 0 3l-2 1.6l2 3.4l2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1l2-3.4z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M14.5 5.5L8 12l6.5 6.5',
  close: 'M6 6l12 12M18 6L6 18',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5zM10 20.5a2 2 0 0 0 4 0',
  star: 'M12 3.8l2.5 5.1l5.6.8l-4 3.9l.9 5.6L12 16.6l-5 2.6l.9-5.6l-4-3.9l5.6-.8z',
  edit: 'M4.5 19.5l1-4L15.5 5.5a2 2 0 0 1 3 3L8.5 18.5zM14 7l3 3',
  flip: 'M4 10a8 8 0 0 1 14.5-3.5M20 4v4h-4M20 14a8 8 0 0 1-14.5 3.5M4 20v-4h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19v-7A1.5 1.5 0 0 1 6 10.5z',
  heart: 'M12 19.5s-7.5-4.5-7.5-10a4 4 0 0 1 7.5-2a4 4 0 0 1 7.5 2c0 5.5-7.5 10-7.5 10z',
  alert: 'M12 4l9 15.5H3zM12 10v4M12 17h.01',
  calendar: 'M5 5.5h14A1.5 1.5 0 0 1 20.5 7v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5zM3.5 10h17M8 3.5v4M16 3.5v4',
  video: 'M4 7h10.5A1.5 1.5 0 0 1 16 8.5v7a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15.5v-7A1.5 1.5 0 0 1 4 7zM16 10.5l5-3v9l-5-3',
  euro: 'M17.5 6.5A7 7 0 1 0 17.5 17.5M4 10.5h9M4 13.5h9',
  download: 'M12 4v11M7 10.5l5 5l5-5M5 19.5h14',
  upload: 'M12 20V9M7 13.5l5-5l5 5M5 4.5h14',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7',
  leaf: 'M5 19c0-8 5-13 14-14c0 9-5 14-13 14zM5 19l7-7',
  shield: 'M12 3.5l7 3v5.5c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6.5z',
};

export function Icon({ name, size = 22, stroke = 2 }) {
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name] || ''} /></svg>`;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="sheet-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-label=${title}>
      <div class="grab"></div>
      <div class="spread" style="margin-bottom:6px"><h2 style="margin:0">${title}</h2>
        <button class="icon-btn" style="width:40px;height:40px" onClick=${onClose} aria-label="Fermer"><${Icon} name="close" size=${18} /></button></div>
      <div style="margin-top:14px">${children}</div>
    </div></div>`;
}

export function Field({ label, children, hint }) {
  return html`<label class="f"><span>${label}</span>${children}${hint ? html`<div class="small muted" style="margin:6px 4px 0">${hint}</div>` : null}</label>`;
}

export const PrivacyHint = () => html`<div class="privacy"><${Icon} name="shield" size=${14} /> Pas de nom d’enfant ni d’info de santé ici</div>`;

export function Input({ value, onChange, type = 'text', placeholder, ...rest }) {
  return html`<input class="input" type=${type} value=${value ?? ''} placeholder=${placeholder}
    onInput=${(e) => onChange(e.target.value)} ...${rest} />`;
}

export function Text({ value, onChange, placeholder, privacy = true }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return html`<div><textarea class="input" value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== (value || '') && onChange(v)}></textarea>${privacy ? html`<${PrivacyHint} />` : null}</div>`;
}

export function TextLine({ value, onChange, placeholder, type = 'text', privacy = false }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return html`<div><input class="input" type=${type} value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)}
    onBlur=${() => v !== (value || '') && onChange(v)} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />${privacy ? html`<${PrivacyHint} />` : null}</div>`;
}

export function Seg({ value, options, onChange }) {
  return html`<div class="seg">${options.map(([v, l]) => html`<button type="button" class=${value === v ? 'on' : ''} onClick=${() => onChange(v)}>${l}</button>`)}</div>`;
}

export function Switch({ label, value, onChange, children }) {
  return html`<div class="switch" onClick=${() => onChange(!value)} role="switch" aria-checked=${!!value}><span class="grow">${label}${children}</span><span class=${`sw ${value ? 'on' : ''}`}></span></div>`;
}

export function Select({ value, onChange, options, empty }) {
  return html`<select class="input" value=${value ?? ''} onChange=${(e) => onChange(e.target.value || null)}>
    ${empty !== undefined ? html`<option value="">${empty}</option>` : null}
    ${options.map(([v, l]) => html`<option value=${v} selected=${v === value}>${l}</option>`)}</select>`;
}

export function Check({ on, onClick, disabled, label }) {
  return html`<button type="button" class=${`check ${on ? 'on' : ''} ${disabled ? 'dis' : ''}`} onClick=${(e) => { e.stopPropagation(); if (!disabled) onClick(); }} aria-label=${label || (on ? 'Fait' : 'À faire')} aria-pressed=${!!on}><${Icon} name="check" size=${18} stroke=${3} /></button>`;
}

export function Ring({ value, max, size = 96, label, color = 'var(--sage)' }) {
  const r = (size - 14) / 2; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return html`<svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${label}>
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--card-2)" stroke-width="12" />
    ${p > 0 ? html`<circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${color} stroke-width="12" stroke-linecap="round"
      stroke-dasharray=${`${c * p} ${c}`} transform=${`rotate(-90 ${size / 2} ${size / 2})`} />` : null}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="800" fill="var(--ink)">${label}</text></svg>`;
}

export function Toast({ msg }) { return msg ? html`<div class="toast" role="status">${msg}</div>` : null; }

// ---------------------------------------------------------------- Ligne de tâche

export function TaskRow({ t, today, act, showClient = true, showDate = true }) {
  const [open, setOpen] = useState(false);
  const color = t.client?.color || (t.mine ? 'var(--blue)' : 'transparent');
  const items = t.items || [];
  const st = t.state || {};
  const canToggle = !t.autoDone && !t.question && !(t.blocked && !t.softBlock);
  const dateChip = () => {
    if (!showDate) return null;
    if (t.late) return html`<span class="chip peach">En retard · ${fmtShort(t.end)}</span>`;
    if (t.due && t.due !== t.date) return html`<span class="chip">${fmtShort(t.date)} → ${fmtShort(t.due)}</span>`;
    if (t.date !== today) return html`<span class="chip">${fmtDate(t.date)}</span>`;
    return null;
  };
  return html`<div class=${`task ${t.late ? 'late' : ''} ${t.done ? 'done' : ''}`} style=${`--c:${color}`} onClick=${() => setOpen(!open)}>
    ${t.question ? html`<span class="check ${t.done ? 'on' : 'dis'}" aria-hidden="true"><${Icon} name="check" size=${18} stroke=${3} /></span>`
      : html`<${Check} on=${t.done} disabled=${!canToggle && !t.done} onClick=${() => act.toggle(t)} label=${t.title} />`}
    <div class="t-body">
      ${showClient && (t.client || t.mine) ? html`<div class="t-client"><span class="dot" style=${`background:${color}`}></span>${t.client ? t.client.name : 'Mon entreprise'}</div>` : null}
      <div class="t-title">${t.title}</div>
      <div class="t-meta">
        ${dateChip()}
        ${t.time ? html`<span class="chip blue"><${Icon} name="calendar" size=${13} /> ${t.time.replace(':', ' h ')}</span>` : null}
        ${items.length ? html`<span class="chip">${t.itemsDone}/${items.length}</span>` : null}
        ${t.ongoing ? html`<span class="chip sage">En cours</span>` : null}
        ${t.blocked && !t.done ? html`<span class="chip rose"><${Icon} name="lock" size=${13} /> Bloqué</span>` : null}
        ${t.done && t.doneAt ? html`<span class="chip sage">Fait le ${fmtShort(day(t.doneAt))}</span>` : null}
      </div>
      ${t.question && !st.answer ? html`<div class="row" style="margin-top:12px" onClick=${(e) => e.stopPropagation()}>
        <button class="btn small primary" onClick=${() => act.answer(t, 'oui')}>Oui, reçues</button>
        <button class="btn small peach" onClick=${() => act.answer(t, 'non')}>Non</button></div>` : null}
      ${t.question && st.answer ? html`<div class="small muted" style="margin-top:6px">Réponse : ${st.answer === 'oui' ? 'oui' : 'non, relance prévue'} · <a href="#" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); act.answer(t, null); }}>changer</a></div>` : null}
      ${open || (items.length && !t.done && t.today) ? html`<div class="t-detail" onClick=${(e) => e.stopPropagation()}>
        ${t.warning ? html`<div class="warn">${t.warning}</div>` : null}
        ${t.blocked ? html`<div class="warn"><${Icon} name="lock" size=${15} /> ${t.blocked}</div>` : null}
        ${items.map((i) => html`<div class="item"><${Check} on=${!!st.items?.[i.id]} onClick=${() => act.toggleItem(t, i.id)} label=${i.label} /><span>${i.label}</span></div>`)}
        ${t.note?.length ? html`<ul>${t.note.map((l) => html`<li>${l}</li>`)}</ul>` : null}
        ${t.notes ? html`<p class="small" style="margin-top:6px;white-space:pre-wrap">${t.notes}</p>` : null}
        ${t.kind === 'invoice' ? html`<div class="row wrap" style="margin-top:10px">
          ${t.autoDone ? html`<span class="small muted">Facture marquée envoyée. Pour la suite : onglet « Mon argent ».</span>`
            : html`<button class="btn small primary" disabled=${!!t.blocked} onClick=${() => act.toggle(t)}>Je l’ai envoyée</button>`}</div>` : null}
        <div class="row wrap" style="margin-top:10px">
          ${t.clientId ? html`<button class="btn small ghost" onClick=${() => act.openClient(t.clientId)}>Voir la fiche</button>` : null}
          ${t.manual ? html`<button class="btn small ghost" onClick=${() => act.editManual(t.manualId)}>Modifier</button>` : null}
          ${t.autoDone && t.kind !== 'invoice' ? html`<span class="small muted">Cochée automatiquement</span>` : null}
        </div>
      </div>` : null}
    </div></div>`;
}

export { euro, fmtDate, fmtShort };
