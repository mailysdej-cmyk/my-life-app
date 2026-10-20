import { html, render, useState, useEffect, useMemo } from '../vendor/preact-htm.js';
import { createStore } from './store.js';
import { computeAll, todayView, monthCycle } from './engine.js';
import { parisNow, fmtDate, day, diffDays } from './dates.js';
import { mergeSettings, CLIENT_COLORS } from './catalog.js';
import { Icon, TaskRow, Sheet, Field, Input, Select, Toast, PrivacyHint } from './ui.js';
import { ClientsScreen } from './screens/clients.js';
import { MoneyScreen } from './screens/money.js';
import { ProspectsScreen } from './screens/prospects.js';
import { CardsScreen } from './screens/cards.js';
import { SettingsScreen } from './screens/settings.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowISO = () => new Date().toISOString();

let store;

function derive(items) {
  const vals = (k) => Object.entries(items[k] || {}).map(([id, d]) => ({ ...d, id }));
  return {
    clients: vals('client'),
    prospects: vals('prospect'),
    manualTasks: vals('manual'),
    taskState: items.task || {},
    invoiceState: items.invoice || {},
    settings: items.settings?.main || {},
    cards: vals('card'),
    push: vals('push'),
    system: items.system || {},
  };
}

// ---------------------------------------------------------------- Connexion

function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (fn) => {
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (r?.ok) onDone(); else if (r?.mfa) setMode('mfa'); else if (r?.confirm) setErr('Compte créé. Ouvre le mail de confirmation reçu, clique sur le lien, puis reviens te connecter ici.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  useEffect(() => { store.session().then((r) => r.mfa && setMode('mfa')); }, []);
  return html`<div class="login">
    <img class="logo" src="icons/icon-192.png" alt="" />
    <h1 class="center" style="font-size:30px;font-weight:800">Serelys</h1>
    <p class="center muted" style="margin-bottom:26px">Mon espace privé</p>
    <div class="card">
      ${mode === 'mfa' ? html`
        <p style="margin-bottom:14px">Tape le code à 6 chiffres affiché par ton appli de codes (double authentification).</p>
        <${Field} label="Code"><input class="input" inputmode="numeric" autocomplete="one-time-code" value=${code} onInput=${(e) => setCode(e.target.value)} /></${Field}>
        <button class="btn primary block" disabled=${busy} onClick=${() => go(() => store.mfaVerifyLogin(code))}>Valider</button>
        <button class="btn ghost block" onClick=${async () => { await store.signOut(); setMode('login'); }}>Changer de compte</button>`
      : html`
        <${Field} label="Adresse mail"><input class="input" type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} /></${Field}>
        <${Field} label="Mot de passe"><input class="input" type="password" autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'} value=${pw} onInput=${(e) => setPw(e.target.value)}
          onKeyDown=${(e) => e.key === 'Enter' && go(() => (mode === 'signup' ? store.signUp(email, pw) : store.signIn(email, pw)))} /></${Field}>
        ${mode === 'signup'
          ? html`<button class="btn primary block" disabled=${busy} onClick=${() => go(() => store.signUp(email, pw))}>Créer mon compte</button>
                 <button class="btn ghost block" onClick=${() => setMode('login')}>J’ai déjà un compte</button>`
          : html`<button class="btn primary block" disabled=${busy} onClick=${() => go(() => store.signIn(email, pw))}>Me connecter</button>
                 <button class="btn ghost block small" onClick=${() => setMode('signup')}>Première fois ? Créer mon compte</button>`}`}
      ${err ? html`<div class="warn" style="margin-top:12px">${err}</div>` : null}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Aujourd'hui

function TodayScreen({ S, all, today, act, openSettings, banners }) {
  const v = useMemo(() => todayView(all, today), [all, today]);
  const cyc = monthCycle(today);
  const [showDone, setShowDone] = useState(false);
  const sec = (title, list, empty) => html`<div class="section-title"><span>${title}</span>${list.length ? html`<span>${list.length}</span>` : null}</div>
    ${list.length ? list.map((t) => html`<${TaskRow} key=${t.key} t=${t} today=${today} act=${act} />`) : empty ? html`<div class="empty">${empty}</div>` : null}`;
  return html`<div class="screen">
    <div class="topbar"><div><div class="sub">${fmtDate(today)}</div><h1>Aujourd’hui</h1></div>
      <button class="icon-btn" onClick=${openSettings} aria-label="Réglages"><${Icon} name="gear" /></button></div>
    ${banners}
    <div class="card">
      <h2><${Icon} name="leaf" size=${20} /> Où j’en suis ce mois-ci</h2>
      <div class="cycle">${cyc.phases.map((p) => html`<div class=${`ph ${cyc.phase === p.id ? 'on' : ''}`}>${p.label}<b>${p.range}</b></div>`)}</div>
      <div class="track" aria-label=${`Jour ${cyc.day} sur ${cyc.last}`}><span style=${`width:${(cyc.day / cyc.last) * 100}%`}></span></div>
      <div class="small muted" style="margin-top:8px">Jour ${cyc.day} sur ${cyc.last}</div>
    </div>
    ${v.late.length ? sec('En retard', v.late) : null}
    ${sec('Aujourd’hui', v.today, v.late.length ? 'Rien d’autre de prévu aujourd’hui.' : 'Rien de prévu aujourd’hui. Profites-en !')}
    ${v.ongoing.length ? sec('En cours (avec échéance)', v.ongoing) : null}
    ${sec('Cette semaine', v.week, 'Rien d’autre cette semaine.')}
    ${v.doneToday.length ? html`<div class="section-title"><button class="btn ghost small" onClick=${() => setShowDone(!showDone)}>${showDone ? 'Masquer' : 'Voir'} ce que j’ai fait aujourd’hui (${v.doneToday.length})</button></div>
      ${showDone ? v.doneToday.map((t) => html`<${TaskRow} key=${t.key} t=${t} today=${today} act=${act} />`) : null}` : null}
    <button class="fab" onClick=${() => act.editManual(null)} aria-label="Ajouter une tâche"><${Icon} name="plus" size=${28} stroke=${2.6} /></button>
  </div>`;
}

function ManualTaskSheet({ S, task, today, onClose, onSave, onDelete }) {
  const [t, setT] = useState(task || { title: '', date: today, time: '', clientId: '', notes: '' });
  const set = (k) => (v) => setT({ ...t, [k]: v });
  const clients = S.clients.filter((c) => !c.archived);
  return html`<${Sheet} title=${task ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose=${onClose}>
    <${Field} label="Quoi ?"><${Input} value=${t.title} onChange=${set('title')} placeholder="Ex. Appeler la directrice" autofocus /></${Field}>
    <div class="row"><div class="grow"><${Field} label="Date"><${Input} type="date" value=${day(t.date || today)} onChange=${set('date')} /></${Field}></div>
      <div style="width:42%"><${Field} label="Heure (facultatif)"><${Input} type="time" value=${t.time} onChange=${set('time')} /></${Field}></div></div>
    <${Field} label="Cliente (facultatif)"><${Select} value=${t.clientId} onChange=${set('clientId')} empty="Aucune" options=${clients.map((c) => [c.id, c.name])} /></${Field}>
    <${Field} label="Note"><textarea class="input" value=${t.notes} onInput=${(e) => set('notes')(e.target.value)}></textarea><${PrivacyHint} /></${Field}>
    <button class="btn primary block" disabled=${!t.title.trim()} onClick=${() => onSave(t)}>Enregistrer</button>
    ${task ? html`<button class="btn ghost block" style="margin-top:8px" onClick=${onDelete}>Supprimer cette tâche</button>` : null}
  </${Sheet}>`;
}

// ---------------------------------------------------------------- Application

const TABS = [
  ['today', 'Aujourd’hui', 'today'], ['clients', 'Clientes', 'clients'], ['money', 'Mon argent', 'money'],
  ['prospects', 'Prospection', 'prospect'], ['cards', 'Par cœur', 'cards'],
];

function App() {
  const [, force] = useState(0);
  const [authed, setAuthed] = useState(store.demo ? true : null);
  const [tab, setTab] = useState(() => (location.hash.slice(1).split('/')[0] || 'today'));
  const [clientId, setClientId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manual, setManual] = useState(undefined);
  const [toast, setToast] = useState('');
  const [today, setToday] = useState(parisNow().date);

  useEffect(() => store.subscribe(() => force((x) => x + 1)), []);
  useEffect(() => { if (!store.demo) store.session().then((r) => setAuthed(!!r.ok)); }, []);
  useEffect(() => { if (authed) store.load(); }, [authed]);
  useEffect(() => { const i = setInterval(() => setToday(parisNow().date), 60000); return () => clearInterval(i); }, []);
  useEffect(() => { location.hash = tab; window.scrollTo(0, 0); }, [tab, clientId, settingsOpen]);

  const S = useMemo(() => derive(store.items), [store.items]);
  const settings = mergeSettings(S.settings);
  useEffect(() => {
    // Première utilisation : rien n'est généré avant aujourd'hui
    if (authed && store.status.lastSync !== undefined && !store.items.settings?.main && (store.demo || store.status.lastSync)) {
      store.put('settings', 'main', { trackingStart: today });
    }
  }, [authed, store.status.lastSync]);

  const all = useMemo(() => computeAll(S, today, { monthsAhead: 3 }), [S, today]);

  const say = (m) => { setToast(m); clearTimeout(say.t); say.t = setTimeout(() => setToast(''), 2600); };

  const act = {
    store, S, all, today, say, uid,
    async toggle(t) {
      if (t.kind === 'invoice') {
        const inv = all.invoices.find((i) => i.key === t.invoiceKey);
        if (inv && inv.status === 'a_envoyer') { await act.setInvoice(inv, 'envoyee'); say('Facture marquée envoyée'); }
        return;
      }
      const st = S.taskState[t.stateKey] || {};
      const done = !t.done;
      await store.put('task', t.stateKey, { ...st, done, doneAt: done ? nowISO() : null, title: t.title, clientId: t.clientId || null });
      if (done) say('Bravo, c’est fait !');
    },
    async toggleItem(t, id) {
      const st = S.taskState[t.stateKey] || {};
      const items = { ...(st.items || {}), [id]: !st.items?.[id] };
      const allDone = (t.items || []).every((i) => items[i.id]);
      await store.put('task', t.stateKey, { ...st, items, done: allDone ? true : st.done && allDone, doneAt: allDone ? (st.doneAt || nowISO()) : null, title: t.title, clientId: t.clientId || null });
    },
    async answer(t, val) {
      const st = S.taskState[t.stateKey] || {};
      await store.put('task', t.stateKey, { ...st, answer: val, answeredAt: val ? today : null, doneAt: val ? nowISO() : null, title: t.title, clientId: t.clientId });
      if (val === 'non') say('Relance ajoutée pour aujourd’hui');
    },
    async setInvoice(inv, status, extra = {}) {
      const cur = S.invoiceState[inv.key] || {};
      const next = { ...cur, status, ...extra };
      if (status === 'a_envoyer') { delete next.sentAt; delete next.paidAt; delete next.amount; delete next.parrainageUsed; }
      else {
        next.sentAt = next.sentAt || extra.sentAt || today;
        if (typeof next.amount !== 'number') { next.amount = inv.amount; next.parrainageUsed = inv.parrainageUsed || 0; }
        if (status === 'payee') next.paidAt = extra.paidAt || next.paidAt || today; else delete next.paidAt;
      }
      await store.put('invoice', inv.key, next);
    },
    openClient(id) { setTab('clients'); setClientId(id); setSettingsOpen(false); },
    editManual(id) { setManual(id === null ? null : S.manualTasks.find((m) => m.id === id)); },
    async saveClient(c) { await store.put('client', c.id, { ...c, id: undefined }); },
    newClientColor() {
      const used = S.clients.map((c) => c.color);
      return CLIENT_COLORS.find((c) => !used.includes(c)) || CLIENT_COLORS[S.clients.length % CLIENT_COLORS.length];
    },
    async saveSettings(patch) { await store.put('settings', 'main', { ...S.settings, ...patch }); },
  };

  if (authed === null) return html`<div class="login"><img class="logo" src="icons/icon-192.png" alt="" /></div>`;
  if (!authed) return html`<${Login} onDone=${() => setAuthed(true)} />`;

  // Bandeaux d'alerte
  const st = store.status;
  const hb = S.system.heartbeat?.at;
  const hbAge = hb ? (Date.now() - new Date(hb).getTime()) / 3600000 : null;
  const banners = html`
    ${store.demo ? html`<div class="banner info"><${Icon} name="alert" /> Mode démo : les données restent dans ce navigateur.</div>` : null}
    ${st.paused ? html`<div class="banner warn"><${Icon} name="alert" /><div>Je n’arrive pas à joindre ta base Supabase : elle est peut-être en pause. Va sur supabase.com › ton projet › bouton « Restore project ». Tes données ne sont pas perdues. En attendant, tu vois ta dernière copie.</div></div>`
      : st.error && st.online ? html`<div class="banner warn"><${Icon} name="alert" /> Problème de synchronisation : ${st.error}. Tes modifications sont gardées et seront renvoyées.</div>` : null}
    ${!st.online ? html`<div class="banner info"><${Icon} name="alert" /> Pas de connexion : tes modifications seront envoyées au retour du réseau.</div>` : null}
    ${!store.demo && hbAge !== null && hbAge > 26 ? html`<div class="banner warn"><${Icon} name="alert" /><div>Attention : le programme des notifications n’a pas tourné depuis ${Math.round(hbAge / 24) || 1} jour(s). Ta base risque de se mettre en veille. Ouvre Réglages › Notifications pour voir quoi faire.</div></div>` : null}
    ${!store.demo && st.lastSync && !S.push.length ? html`<div class="banner info" onClick=${() => setSettingsOpen(true)}><${Icon} name="bell" /> Active les notifications sur ce téléphone : Réglages › Notifications.</div>` : null}`;

  let screen;
  const openSettings = () => setSettingsOpen(true);
  if (settingsOpen) screen = html`<${SettingsScreen} S=${S} settings=${settings} all=${all} today=${today} act=${act} onBack=${() => setSettingsOpen(false)} />`;
  else if (tab === 'today') screen = html`<${TodayScreen} S=${S} all=${all} today=${today} act=${act} openSettings=${openSettings} banners=${banners} />`;
  else if (tab === 'clients') screen = html`<${ClientsScreen} S=${S} all=${all} today=${today} act=${act} clientId=${clientId} setClientId=${setClientId} openSettings=${openSettings} settings=${settings} />`;
  else if (tab === 'money') screen = html`<${MoneyScreen} S=${S} all=${all} today=${today} act=${act} openSettings=${openSettings} />`;
  else if (tab === 'prospects') screen = html`<${ProspectsScreen} S=${S} all=${all} today=${today} act=${act} openSettings=${openSettings} />`;
  else screen = html`<${CardsScreen} S=${S} act=${act} openSettings=${openSettings} />`;

  return html`${screen}
    <nav class="tabs"><div class="tabs-in">${TABS.map(([id, label, icon]) => html`
      <button class=${`tab ${tab === id && !settingsOpen ? 'on' : ''}`} onClick=${() => { setTab(id); setSettingsOpen(false); if (id === 'clients') setClientId(null); }} aria-current=${tab === id ? 'page' : null}>
        <${Icon} name=${icon} /><span>${label}</span></button>`)}</div></nav>
    ${manual !== undefined ? html`<${ManualTaskSheet} S=${S} task=${manual && { ...manual, date: day(manual.date), time: manual.date?.slice(11, 16) || '' }} today=${today}
      onClose=${() => setManual(undefined)}
      onSave=${async (t) => { const id = manual?.id || uid(); await store.put('manual', id, { title: t.title.trim(), date: t.time ? `${day(t.date)}T${t.time}` : day(t.date), clientId: t.clientId || null, notes: t.notes || '' }); setManual(undefined); say('Tâche ajoutée'); }}
      onDelete=${async () => { await store.remove('manual', manual.id); setManual(undefined); }} />` : null}
    <${Toast} msg=${toast} />`;
}

export async function start() {
  store = await createStore();
  if (store.demo) await store.load();
  render(html`<${App} />`, document.getElementById('app'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

export { diffDays };
