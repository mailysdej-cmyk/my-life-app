import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Icon, Field, Input, TextLine, Seg, Switch, Select, euro, fmtDate } from '../ui.js';
import { DEFAULT_CONFIG } from '../catalog.js';
import { describeFreq, prospectionSettings, WEEKDAYS } from '../engine.js';
import { Sheet, PrivacyHint } from '../ui.js';
import { enablePush, disablePush, isIOS, isStandalone, pushSupported, thisDeviceId } from '../push.js';
import { day } from '../dates.js';

export function SettingsScreen({ S, settings, all, today, act, onBack, initial = null }) {
  const [sec, setSec] = useState(initial);
  const save = act.saveSettings;
  const S_ = { S, settings, all, today, act, save };
  const sections = [
    ['recurring', 'calendar', 'Mes tâches récurrentes', 'Ajouter, modifier, choisir la fréquence'],
    ['prospection', 'prospect', 'Prospection', `${prospectionSettings(settings).goal} mails par semaine · ${prospectionSettings(settings).mode === 'bloc' ? 'en un bloc' : '5 par jour'}`],
    ['notif', 'bell', 'Notifications', 'Activer, tester, heures'],
    ['activity', 'leaf', 'Mon activité', 'SIRET, ACRE, assurance, dates'],
    ['money', 'euro', 'Urssaf, taux et seuils', `${settings.urssafPeriod}, ${String(settings.urssafRate).replace('.', ',')} %, TVA ${euro(settings.tvaThreshold)}`],
    ['rules', 'calendar', 'Mes règles', 'Catalogue des tâches et leurs dates'],
    ['backup', 'download', 'Sauvegarde', 'Automatique en ligne · copie de secours'],
    ['security', 'lock', 'Sécurité et compte', 'Double authentification, déconnexion'],
  ];
  const Cur = { recurring: Recurring, prospection: Prospection, notif: Notifications, activity: Activity, money: MoneySettings, rules: Rules, backup: Backup, security: Security }[sec];
  return html`<div class="screen">
    <div class="topbar"><button class="icon-btn" onClick=${() => (sec ? setSec(null) : onBack())} aria-label="Retour"><${Icon} name="back" /></button>
      <h1 class="grow">${sec ? sections.find((s) => s[0] === sec)[2] : 'Réglages'}</h1></div>
    ${Cur ? html`<${Cur} ...${S_} />` : html`${sections.map(([id, icon, title, sub]) => html`<button class="card client-card" style="padding:16px" onClick=${() => setSec(id)}>
      <div class="row"><span class="icon-btn" style="box-shadow:none;background:var(--card-2)"><${Icon} name=${icon} /></span>
        <div class="grow"><div style="font-weight:800;font-size:17px">${title}</div><div class="small muted">${sub}</div></div></div></button>`)}
      <${Field} label="Lien de la Bibliothèque Serelys"><${TextLine} type="url" value=${settings.libraryUrl} onChange=${(v) => save({ libraryUrl: v })} placeholder="https://…" /></${Field}>
      <button class="btn block" style="margin-bottom:12px" onClick=${() => downloadCopy(act)}><${Icon} name="download" /> Télécharger une copie</button>
      <a class="btn block" href="mode-d-emploi.html">Mode d’emploi</a>
      <p class="small muted center" style="margin-top:20px">Serelys · ${act.store.demo ? 'mode démo' : 'données en ligne (Supabase)'}</p>`}
  </div>`;
}

function Notifications({ S, settings, act, save }) {
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState(null);
  useEffect(() => { thisDeviceId().then(setMe).catch(() => {}); }, [S.push.length]);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); act.say(ok); } catch (e) { act.say(e.message); } setBusy(false); };
  const hb = S.system.heartbeat;
  const times = settings.notifTimes;
  const iosNeedsInstall = isIOS() && !isStandalone();
  const enabledHere = me && S.push.some((p) => p.id === me);
  return html`
    <div class="card">
      <h2><${Icon} name="bell" /> Sur cet appareil</h2>
      ${iosNeedsInstall ? html`<div class="warn">Sur iPhone, les notifications ne marchent que si l’appli est sur l’écran d’accueil. Suis les étapes ci-dessous, puis reviens ici depuis l’icône Serelys.</div>` : null}
      ${enabledHere ? html`<div class="info">Les notifications sont activées sur cet appareil.</div>` : null}
      <div class="stack">
        <button class="btn primary block" disabled=${busy || act.store.demo} onClick=${() => run(() => enablePush(act.store), 'Notifications activées')}>${enabledHere ? 'Réactiver les notifications' : 'Activer les notifications'}</button>
        <button class="btn blue block" disabled=${busy || act.store.demo || !S.push.length} onClick=${() => run(() => act.store.callNotify({ action: 'test' }), 'Notification de test envoyée')}>Tester une notification</button>
        ${enabledHere ? html`<button class="btn ghost block small" onClick=${() => run(() => disablePush(act.store), 'Notifications désactivées ici')}>Désactiver sur cet appareil</button>` : null}
      </div>
      ${S.push.length ? html`<h3>Appareils qui reçoivent les notifications</h3>${S.push.map((p) => html`<div class="kv"><span>${p.device}${p.id === me ? ' (celui-ci)' : ''}</span><b>depuis le ${fmtDate(day(p.createdAt))}</b></div>`)}` : null}
    </div>
    <div class="card">
      <h2>Activer les notifications sur mon iPhone</h2>
      <ol class="steps">
        <li>Ouvre l’adresse de l’appli dans <b>Safari</b> (pas Chrome).</li>
        <li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut), puis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
        <li>Ferme Safari et ouvre <b>Serelys depuis sa nouvelle icône</b>. Connecte-toi.</li>
        <li>Viens ici et touche <b>Activer les notifications</b>, puis <b>Autoriser</b>.</li>
        <li>Touche <b>Tester une notification</b> : elle arrive en quelques secondes.</li>
      </ol>
      <p class="small muted" style="margin-top:8px">iOS 16.4 ou plus. Si rien n’arrive : Réglages de l’iPhone › Notifications › Serelys › Autoriser les notifications. Et vérifie que le mode Concentration ne les bloque pas.</p>
    </div>
    <div class="card">
      <h2>Quand je reçois quoi</h2>
      <${Field} label="Résumé du jour (et le lundi : résumé de la semaine)"><${Input} type="time" value=${times.summary} onChange=${(v) => v && save({ notifTimes: { ...times, summary: v, weekly: v } })} /></${Field}>
      <div class="row"><div class="grow"><${Field} label="1er rappel"><${Input} type="time" value=${times.reminders[0]} onChange=${(v) => v && save({ notifTimes: { ...times, reminders: [v, times.reminders[1]] } })} /></${Field}></div>
        <div class="grow"><${Field} label="2e rappel"><${Input} type="time" value=${times.reminders[1]} onChange=${(v) => v && save({ notifTimes: { ...times, reminders: [times.reminders[0], v] } })} /></${Field}></div></div>
      <p class="small muted">Les rappels ne partent que s’il reste des tâches du jour non cochées ou des tâches en retard. Les visios ont en plus un rappel 1 h avant. Heure de Paris.</p>
    </div>
    <div class="card">
      <h2>Le programme en ligne</h2>
      <div class="kv"><span>Dernier passage</span><b>${hb?.at ? new Date(hb.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'pas encore'}</b></div>
      <p class="small muted" style="margin-top:8px">Il passe toutes les 15 minutes. Cela garde aussi ta base Supabase éveillée (un projet gratuit se met en veille après 7 jours sans activité). S’il n’a pas tourné depuis plus d’un jour, un bandeau te prévient sur l’écran « Aujourd’hui ».</p>
    </div>`;
}

function Activity({ settings, save }) {
  return html`<div class="card">
    <${Switch} label="Auto-entreprise créée (j’ai mon SIRET)" value=${settings.aeCreated} onChange=${(v) => save({ aeCreated: v, aeCreationDate: v ? settings.aeCreationDate : settings.aeCreationDate })} />
    ${!settings.aeCreated ? html`<div class="warn small">Tant que cette case n’est pas cochée, le bouton « Envoyer le devis » est bloqué : aucun devis ni facture sans SIRET.</div>` : null}
    <${Field} label="Date de création de l’auto-entreprise" hint="Déclenche les rappels « Demander l’ACRE » (J+7, J+30, J+50) et les déclarations Urssaf."><${Input} type="date" value=${settings.aeCreationDate || ''} onChange=${(v) => save({ aeCreationDate: v || null })} /></${Field}>
    <${Switch} label="ACRE demandée" value=${settings.acreDone} onChange=${(v) => save({ acreDone: v })} />
    <h3>Avant la première signature</h3>
    <${Field} label="Souscrire mon assurance RC pro : le"><${Input} type="date" value=${settings.rcProDate || ''} onChange=${(v) => save({ rcProDate: v || null })} /></${Field}>
    <${Field} label="Créer mon auto-entreprise : le"><${Input} type="date" value=${settings.aeTaskDate || ''} onChange=${(v) => save({ aeTaskDate: v || null })} /></${Field}>
    <${Field} label="Date anniversaire de mon assurance RC pro" hint="Chaque année à cette date : « Renouveler mon assurance RC pro »."><${Input} type="date" value=${settings.rcProRenewal ? `${new Date().getFullYear()}-${settings.rcProRenewal}` : ''} onChange=${(v) => save({ rcProRenewal: v ? v.slice(5, 10) : null })} /></${Field}>
    <h3>Rappels annuels et uniques</h3>
    <${Field} label="Relire mes obligations d’entrepreneuse, chaque année le"><${Input} type="date" value=${`${new Date().getFullYear()}-${settings.obligationsDate}`} onChange=${(v) => v && save({ obligationsDate: v.slice(5, 10) })} /></${Field}>
    <${Field} label="Préparer la facture électronique : le"><${Input} type="date" value=${settings.eInvoiceDate || ''} onChange=${(v) => save({ eInvoiceDate: v || null })} /></${Field}>
    <${Field} label="1er objectif : clientes pour compléter le chômage"><${Input} type="number" min="1" value=${settings.goalClients} onChange=${(v) => save({ goalClients: Math.max(1, Number(v) || 2) })} /></${Field}>
    <${Field} label="2e objectif : clientes pour remplacer mon salaire"><${Input} type="number" min="1" value=${settings.goalClients2} onChange=${(v) => save({ goalClients2: Math.max(1, Number(v) || 5) })} /></${Field}>
  </div>`;
}

function MoneySettings({ settings, save }) {
  const num = (k, f = Number) => (v) => { const n = f(String(v).replace(',', '.')); if (!Number.isNaN(n)) save({ [k]: n }); };
  return html`<div class="card">
    <${Field} label="Déclaration Urssaf"><${Seg} value=${settings.urssafPeriod} onChange=${(v) => save({ urssafPeriod: v })} options=${[['mensuel', 'Mensuelle'], ['trimestriel', 'Trimestrielle']]} /></${Field}>
    <${Field} label="Rappel avant la date limite (jours)"><${Input} type="number" value=${settings.urssafReminderDays} onChange=${num('urssafReminderDays', parseInt)} /></${Field}>
    <${Field} label="Taux de cotisations Urssaf (%)"><${Input} inputmode="decimal" value=${String(settings.urssafRate).replace('.', ',')} onChange=${num('urssafRate')} /></${Field}>
    <${Field} label="Seuil de TVA (€ par an)"><${Input} type="number" value=${settings.tvaThreshold} onChange=${num('tvaThreshold')} /></${Field}>
    <${Field} label="Alerte TVA à (% du seuil)"><${Input} type="number" value=${Math.round(settings.tvaAlertRatio * 100)} onChange=${(v) => save({ tvaAlertRatio: (Number(v) || 80) / 100 })} /></${Field}>
    <p class="small muted">Vérifie ces chiffres chaque année : les règles changent.</p>
  </div>`;
}

function Rules({ S, all, act, save }) {
  const config = all.ctx.config;
  const over = S.settings.config || {};
  const setOver = (patch) => save({ config: { ...over, ...patch } });
  const upd = (list, id, patch) => {
    const cur = over[list] || [];
    const found = cur.find((x) => x.id === id);
    setOver({ [list]: found ? cur.map((x) => (x.id === id ? { ...x, ...patch } : x)) : [...cur, { id, ...patch }] });
  };
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const [newMoteur, setNewMoteur] = useState({ label: '', plan: 'premium' });
  const svcLabel = (id) => config.services.find((s) => s.id === id)?.label;
  return html`
    <p class="small muted" style="margin:0 6px 14px">Ici tu changes les règles une fois pour toutes : tout se recalcule aussitôt. Dans les titres, {creche} = nom de la crèche, {mois} = mois en cours, {mois1} = mois suivant.</p>
    <div class="card"><h2>Prix</h2>
      ${Object.entries(config.plans).map(([k, p]) => html`<${Field} label=${`Forfait ${p.label} (€/mois)`}><${Input} type="number" value=${p.price} onChange=${(v) => setOver({ plans: { ...(over.plans || {}), [k]: { ...(over.plans?.[k] || {}), price: Number(v) } } })} /></${Field}>`)}
      <${Field} label="Prestation ajoutée (€/mois)"><${Input} type="number" value=${config.addonPrice} onChange=${(v) => setOver({ addonPrice: Number(v) })} /></${Field}>
    </div>
    <div class="card"><h2>Tâches de chaque mois</h2>
      ${config.rules.map((r) => html`<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div class="small muted" style="font-weight:800;margin-bottom:6px">${r.service ? `Si la cliente a : ${svcLabel(r.service)}` : 'Toutes les clientes'}</div>
        <${TextLine} value=${r.title} onChange=${(v) => upd('rules', r.id, { title: v })} />
        <div class="row" style="margin-top:8px"><span class="small">Le</span><div style="width:80px"><${Input} type="number" min="1" max="31" value=${r.day} onChange=${(v) => upd('rules', r.id, { day: Number(v) })} /></div>
          ${r.dueDay || r.id !== 'facture' ? html`<span class="small">échéance le</span><div style="width:80px"><${Input} type="number" min="1" max="31" value=${r.dueDay || ''} onChange=${(v) => upd('rules', r.id, { dueDay: v ? Number(v) : null })} /></div>` : null}</div>
        <${Switch} label="Active" value=${!r.disabled} onChange=${(v) => upd('rules', r.id, { disabled: !v })} /></div>`)}
    </div>
    <div class="card"><h2>Mes tâches d’entrepreneuse (chaque mois)</h2>
      ${config.myRules.map((r) => html`<div style="padding:8px 0"><${TextLine} value=${r.title} onChange=${(v) => upd('myRules', r.id, { title: v })} />
        <div class="row" style="margin-top:8px"><span class="small">Le</span><div style="width:80px"><${Input} type="number" value=${r.day} onChange=${(v) => upd('myRules', r.id, { day: Number(v) })} /></div>
        <${Switch} label="Active" value=${!r.disabled} onChange=${(v) => upd('myRules', r.id, { disabled: !v })} /></div></div>`)}
      <button class="btn small" onClick=${() => upd('myRules', `perso-${act.uid()}`, { title: 'Nouvelle tâche mensuelle', day: 1 })}><${Icon} name="plus" size=${16} /> Ajouter une tâche mensuelle</button>
    </div>
    <div class="card"><h2>Prestations et moteurs</h2>
      ${config.services.map((s) => html`<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div class="small muted" style="font-weight:800;margin-bottom:6px">Forfait ${config.plans[s.plan]?.label}</div>
        <${TextLine} value=${s.label} onChange=${(v) => upd('services', s.id, { label: v })} />
        ${s.moteur ? html`<div style="margin-top:8px"><${TextLine} value=${s.moteur} onChange=${(v) => upd('services', s.id, { moteur: v })} /></div>
          <${Switch} label="Moteur en service (dans la liste du 7)" value=${s.moteurActive !== false} onChange=${(v) => upd('services', s.id, { moteurActive: v })} />` : null}
        ${s.id.startsWith('perso-') ? html`<button class="btn small ghost" onClick=${() => upd('services', s.id, { deleted: true })}>Supprimer</button>` : null}</div>`)}
      <h3>Ajouter un moteur</h3>
      <${Field} label="Nom du moteur"><${Input} value=${newMoteur.label} onChange=${(v) => setNewMoteur({ ...newMoteur, label: v })} placeholder="Ex. Moteur suivi des contrats" /></${Field}>
      <${Field} label="Forfait"><${Seg} value=${newMoteur.plan} onChange=${(v) => setNewMoteur({ ...newMoteur, plan: v })} options=${Object.entries(config.plans).map(([k, p]) => [k, p.label])} /></${Field}>
      <button class="btn small blue" disabled=${!newMoteur.label.trim()} onClick=${() => { upd('services', `perso-${act.uid()}`, { label: newMoteur.label.trim(), moteur: newMoteur.label.trim(), plan: newMoteur.plan }); setNewMoteur({ label: '', plan: 'premium' }); }}>Ajouter</button>
    </div>
    <div class="card"><h2>Documents uniques (one-shots)</h2>
      ${Object.entries(config.plans).map(([k, p]) => html`<${Field} label=${`${p.label} (en plus du forfait d’en dessous) · un par ligne`}>
        <textarea class="input" value=${(config.oneshots[k] || []).join('\n')} onBlur=${(e) => setOver({ oneshots: { ...(over.oneshots || {}), [k]: lines(e.target.value) } })}></textarea></${Field}>`)}
      <${Field} label="Livrés le 29 à toutes les clientes · un par ligne"><textarea class="input" value=${config.baseDeliverables.join('\n')} onBlur=${(e) => setOver({ baseDeliverables: lines(e.target.value) })}></textarea></${Field}>
    </div>
    <button class="btn ghost block" onClick=${() => { if (confirm('Revenir aux règles de départ ? Tes tâches cochées sont gardées.')) save({ config: {} }); }}>Revenir aux règles de départ</button>`;
}

// Copie de secours de toutes mes données (fichier), en plus de la sauvegarde en ligne automatique.
export async function downloadCopy(act) {
  const items = {};
  for (const [k, rows] of Object.entries(act.store.items)) if (!['push', 'system', 'backup'].includes(k)) items[k] = rows;
  const data = JSON.stringify({ app: 'serelys', version: 1, exportedAt: new Date().toISOString(), items }, null, 1);
  const name = `serelys-copie-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  act.say('Copie téléchargée');
}

function Backup({ S, act }) {
  const [busy, setBusy] = useState(false);
  const exportData = () => downloadCopy(act);
  const importData = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== 'serelys' || !j.items) throw new Error('Ce fichier n’est pas une sauvegarde Serelys.');
      const n = Object.values(j.items).reduce((s, r) => s + Object.keys(r).length, 0);
      if (!confirm(`Importer ${n} éléments du ${new Date(j.exportedAt).toLocaleDateString('fr-FR')} ? Les éléments du fichier remplacent ceux qui ont le même identifiant ; le reste est gardé.`)) { setBusy(false); return; }
      await act.store.replaceAll(j.items, { merge: true });
      act.say('Données importées');
    } catch (e) { act.say(e.message); }
    setBusy(false);
  };
  return html`<div class="card">
    <p style="margin-bottom:10px">Chaque modification est sauvegardée toute seule en ligne, dans ton espace privé. Tu retrouves tout sur ton iPhone et ton Mac, même si tu changes de téléphone.</p>
    <p style="margin-bottom:14px">Sans internet, l’appli garde une copie sur l’appareil et envoie tes modifications dès que la connexion revient. Le fichier ci-dessous est une sécurité en plus : garde-le dans Fichiers ou ton Drive, par exemple une fois par mois.</p>
    <button class="btn primary block" onClick=${exportData}><${Icon} name="download" /> Télécharger une copie</button>
    <label class="btn block" style="margin-top:12px"><${Icon} name="upload" /> Importer une sauvegarde
      <input type="file" accept="application/json,.json" class="hidden" disabled=${busy} onChange=${(e) => importData(e.target.files[0])} /></label>
    <p class="small muted" style="margin-top:12px">${Object.keys(act.store.items.client || {}).length} clientes · ${Object.keys(act.store.items.task || {}).length} tâches cochées · ${Object.keys(act.store.items.card || {}).length} cartes</p>
  </div>`;
}

function Security({ act }) {
  const [st, setSt] = useState(null);
  const [enroll, setEnroll] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { act.store.mfaStatus().then(setSt).catch(() => setSt({ enabled: false })); }, []);
  if (act.store.demo) return html`<div class="card"><p>Mode démo : pas de compte.</p></div>`;
  return html`<div class="card">
    <h2><${Icon} name="shield" /> Double authentification</h2>
    ${st?.enabled ? html`<div class="info">Activée : à chaque connexion, l’appli te demande aussi un code à 6 chiffres.</div>`
      : enroll ? html`
        <ol class="steps">
          <li>Sur ton iPhone, ouvre l’appli <b>Mots de passe</b> (iOS 18) ou <b>Google Authenticator</b>.</li>
          <li>Ajoute un code en scannant ce QR code${isIOS() ? ' (ou copie la clé ci-dessous)' : ''}.</li>
          <li>Tape ici le code à 6 chiffres qu’elle affiche.</li></ol>
        <img class="qr" src=${enroll.qr} alt="QR code de double authentification" />
        <p class="small center muted" style="word-break:break-all">Clé : ${enroll.secret}</p>
        <${Field} label="Code à 6 chiffres"><input class="input" inputmode="numeric" autocomplete="one-time-code" value=${code} onInput=${(e) => setCode(e.target.value)} /></${Field}>
        <button class="btn primary block" onClick=${async () => { try { await act.store.mfaConfirm(enroll.id, code); setEnroll(null); setSt({ enabled: true }); act.say('Double authentification activée'); } catch (e) { setErr(e.message); } }}>Valider</button>`
      : html`<p style="margin-bottom:12px">Recommandé : même si quelqu’un trouvait ton mot de passe, il ne pourrait pas entrer sans ton téléphone.</p>
        <button class="btn primary block" onClick=${async () => { try { setEnroll(await act.store.mfaEnroll()); } catch (e) { setErr(e.message); } }}>Activer la double authentification</button>`}
    ${err ? html`<div class="warn" style="margin-top:10px">${err}</div>` : null}
  </div>
  <div class="card"><button class="btn block" onClick=${async () => { await act.store.signOut(); location.reload(); }}>Me déconnecter</button></div>`;
}

// ---------------------------------------------------------------- Mes tâches récurrentes

const FREQ_TYPES = [['daily', 'Tous les jours'], ['weekdays', 'Certains jours'], ['monthly', 'Chaque mois'], ['interval', 'Tous les X'], ['once', 'Une fois']];
const PLANS = [['essentiel', 'Essentiel'], ['confort', 'Confort'], ['premium', 'Premium']];

function Recurring({ S, act, today }) {
  const [edit, setEdit] = useState(undefined);
  const list = [...S.recurring].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return html`
    <p class="small muted" style="margin:0 6px 14px">Ces tâches arrivent toutes seules sur mes fiches du jour. Les tâches automatiques de chaque cliente (factures, moteurs, livraison…) se règlent dans « Mes règles ».</p>
    <button class="btn primary block" style="margin-bottom:16px" onClick=${() => setEdit(null)}><${Icon} name="plus" /> Ajouter une tâche récurrente</button>
    ${list.length ? list.map((r) => html`<button class="card client-card flat" style="padding:14px 16px;margin-bottom:12px" onClick=${() => setEdit(r)}>
      <div style="font-weight:800">${(r.title || '').replace('{creche}', '[la crèche]')}</div>
      <div class="small muted" style="margin-top:4px">${describeFreq(r.freq)} · ${r.scope === 'clients' ? `pour chaque cliente${r.plans?.length && r.plans.length < 3 ? ` (${r.plans.map((x) => PLANS.find((p) => p[0] === x)?.[1]).join(', ')})` : ''}` : r.clientsOnly ? 'pour moi, seulement avec des clientes' : 'pour moi'}${r.disabled ? ' · en pause' : ''}</div>
    </button>`) : html`<div class="empty">Aucune tâche récurrente.</div>`}
    ${edit !== undefined ? html`<${RecurringSheet} r=${edit} today=${today} onClose=${() => setEdit(undefined)}
      onDelete=${async () => { await act.store.remove('recurring', edit.id); setEdit(undefined); act.say('Tâche supprimée'); }}
      onSave=${async (r) => { await act.store.put('recurring', edit?.id || act.uid(), { ...r, id: undefined }); setEdit(undefined); act.say('Enregistré'); }} />` : null}`;
}

function RecurringSheet({ r, today, onClose, onSave, onDelete }) {
  const [v, setV] = useState({ title: '', scope: 'me', plans: ['essentiel', 'confort', 'premium'], clientsOnly: false, note: '', link: '', disabled: false, ...(r || {}),
    freq: { type: 'weekdays', weekdays: [1], monthDays: [1], every: 2, unit: 'days', start: today, date: today, ...(r?.freq || {}) } });
  const [daysText, setDaysText] = useState((v.freq.monthDays || []).join(', '));
  const [range, setRange] = useState(!!v.freq.rangeFrom);
  const set = (k) => (x) => setV({ ...v, [k]: x });
  const setF = (k) => (x) => setV({ ...v, freq: { ...v.freq, [k]: x } });
  const toggle = (list, x) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const f = v.freq;
  const clean = () => {
    const fr = { type: f.type };
    if (f.type === 'weekdays') fr.weekdays = [...(f.weekdays || [])].sort();
    if (f.type === 'monthly') {
      if (range) { fr.rangeFrom = Number(f.rangeFrom) || 1; fr.rangeTo = Number(f.rangeTo) || fr.rangeFrom; }
      else fr.monthDays = daysText.split(/[^0-9]+/).map(Number).filter((n) => n >= 1 && n <= 31);
    }
    if (f.type === 'interval') { fr.every = Math.max(1, Number(f.every) || 1); fr.unit = f.unit; fr.start = f.start || today; }
    if (f.type === 'once') fr.date = f.date || today;
    return { title: v.title.trim(), scope: v.scope, plans: v.scope === 'clients' ? v.plans : undefined, clientsOnly: v.scope === 'me' ? !!v.clientsOnly : undefined,
      note: v.note.trim() || undefined, link: v.link.trim() || undefined, disabled: !!v.disabled, freq: fr, createdAt: r?.createdAt || new Date().toISOString() };
  };
  const ok = v.title.trim() && (f.type !== 'weekdays' || (f.weekdays || []).length) && (v.scope !== 'clients' || v.plans.length);
  return html`<${Sheet} title=${r ? 'Modifier la tâche' : 'Nouvelle tâche récurrente'} onClose=${onClose}>
    <${Field} label="Ce que je fais" hint=${v.scope === 'clients' ? 'Le nom de la crèche est ajouté tout seul (ou écris {creche} où tu veux le voir).' : null}>
      <${Input} value=${v.title} onChange=${set('title')} placeholder="Ex. Faire le résumé de ma semaine" /></${Field}>
    <${Field} label="Pour qui"><${Seg} value=${v.scope} onChange=${set('scope')} options=${[['me', 'Pour moi'], ['clients', 'Chaque cliente']]} /></${Field}>
    ${v.scope === 'clients' ? html`<${Field} label="Forfaits concernés"><div class="row wrap" style="gap:6px">${PLANS.map(([k, l]) => html`
      <button class=${`chip ${v.plans.includes(k) ? 'sage' : ''}`} onClick=${() => set('plans')(toggle(v.plans, k))} aria-pressed=${v.plans.includes(k)}>${l}</button>`)}</div></${Field}>
      <p class="small muted" style="margin:-6px 4px 14px">Elle n’apparaît que quand j’ai des clientes.</p>`
      : html`<${Switch} label="Seulement quand j’ai des clientes" value=${!!v.clientsOnly} onChange=${set('clientsOnly')} />`}
    <${Field} label="Fréquence"><select class="input" value=${f.type} onChange=${(e) => setF('type')(e.target.value)}>${FREQ_TYPES.map(([k, l]) => html`<option value=${k} selected=${f.type === k}>${l}</option>`)}</select></${Field}>
    ${f.type === 'weekdays' ? html`<div class="row wrap" style="gap:6px;margin-bottom:14px">${WEEKDAYS.map((w, i) => html`
      <button class=${`chip ${(f.weekdays || []).includes(i + 1) ? 'sage' : ''}`} onClick=${() => setF('weekdays')(toggle(f.weekdays || [], i + 1))} aria-pressed=${(f.weekdays || []).includes(i + 1)}>${w}</button>`)}</div>` : null}
    ${f.type === 'monthly' ? html`<${Field} label="Quand"><${Seg} value=${range ? 'range' : 'days'} onChange=${(x) => setRange(x === 'range')} options=${[['days', 'Date(s) fixe(s)'], ['range', 'Du … au …']]} /></${Field}>
      ${range ? html`<div class="row"><div class="grow"><${Field} label="Du"><${Input} type="number" min="1" max="31" value=${f.rangeFrom || 1} onChange=${setF('rangeFrom')} /></${Field}></div>
        <div class="grow"><${Field} label="Au"><${Input} type="number" min="1" max="31" value=${f.rangeTo || 5} onChange=${setF('rangeTo')} /></${Field}></div></div>
        <p class="small muted" style="margin:-6px 4px 14px">Pour les clientes, le travail est réparti sur les jours de la plage. « Du 29 au 1 » va jusqu’au 1er du mois suivant.</p>`
      : html`<${Field} label="Jour(s) du mois" hint="Ex. 1, 20"><${Input} value=${daysText} onChange=${setDaysText} /></${Field}>`}` : null}
    ${f.type === 'interval' ? html`<div class="row"><div style="width:30%"><${Field} label="Tous les"><${Input} type="number" min="1" value=${f.every} onChange=${setF('every')} /></${Field}></div>
      <div class="grow"><${Field} label=" "><${Seg} value=${f.unit} onChange=${setF('unit')} options=${[['days', 'jours'], ['weeks', 'semaines']]} /></${Field}></div></div>
      <${Field} label="À partir du"><${Input} type="date" value=${f.start} onChange=${setF('start')} /></${Field}>` : null}
    ${f.type === 'once' ? html`<${Field} label="Le"><${Input} type="date" value=${f.date} onChange=${setF('date')} /></${Field}>` : null}
    <${Field} label="Détail (facultatif)"><textarea class="input" value=${v.note} onInput=${(e) => set('note')(e.target.value)}></textarea><${PrivacyHint} /></${Field}>
    <${Field} label="Lien à ouvrir (facultatif)"><${Input} type="url" value=${v.link} onChange=${set('link')} placeholder="https://…" /></${Field}>
    ${r ? html`<${Switch} label="Mettre en pause" value=${!!v.disabled} onChange=${set('disabled')} />` : null}
    <button class="btn primary block" style="margin-top:8px" disabled=${!ok} onClick=${() => onSave(clean())}>Enregistrer</button>
    ${r ? html`<button class="btn ghost block" style="margin-top:8px" onClick=${onDelete}>Supprimer cette tâche</button>` : null}
  </${Sheet}>`;
}

// ---------------------------------------------------------------- Prospection

function Prospection({ settings, save }) {
  const ps = prospectionSettings(settings);
  const set = (patch) => save({ prospection: { ...ps, ...patch } });
  return html`<div class="card">
    <${Switch} label="Prospection sur mes fiches du jour" value=${ps.enabled} onChange=${(v) => set({ enabled: v })} />
    <${Field} label="Objectif de mails par semaine"><${Input} type="number" min="1" value=${ps.goal} onChange=${(v) => set({ goal: Math.max(1, Number(v) || 25) })} /></${Field}>
    <${Field} label="Comment je les envoie"><${Seg} value=${ps.mode} onChange=${(v) => set({ mode: v })} options=${[['quotidien', '5 par jour'], ['bloc', 'Un jour « bloc »']]} /></${Field}>
    ${ps.mode === 'bloc' ? html`<${Field} label="Le jour du bloc"><select class="input" value=${ps.blocDay} onChange=${(e) => set({ blocDay: Number(e.target.value) })}>${WEEKDAYS.slice(0, 5).map((w, i) => html`<option value=${i + 1} selected=${Number(ps.blocDay) === i + 1}>${w}</option>`)}</select></${Field}>` : null}
    <p class="small muted" style="margin:-4px 4px 14px">Ce qui n’est pas fait est reporté au jour suivant de la même semaine. Le vendredi à 12 h, je te préviens s’il manque des mails.</p>
    <${Field} label="Lien de « Ma prospection » (Bibliothèque Serelys)" hint="Ouvre ta Bibliothèque sur l’onglet « Ma prospection », puis copie l’adresse ici.">
      <${TextLine} type="url" value=${ps.url || ''} onChange=${(v) => set({ url: v.trim() })} placeholder=${settings.libraryUrl || 'https://…'} /></${Field}>
  </div>`;
}
