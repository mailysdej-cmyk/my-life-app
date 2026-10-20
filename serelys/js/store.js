// Données : une seule table « items » dans Supabase (kind, id, data), protégée par la connexion.
// Copie locale pour un affichage instantané, et file d'attente si le réseau manque.
// Mode démo (?demo) : tout reste dans ce navigateur, pour essayer sans compte.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

export const isDemo = () => new URLSearchParams(location.search).has('demo') || !SUPABASE_URL;

export async function createStore() {
  const demo = isDemo();
  let sb = null;
  if (!demo) {
    const { createClient } = window.supabase; // vendor/supabase.js
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: 'serelys-auth', persistSession: true, autoRefreshToken: true } });
  }
  const listeners = new Set();
  let items = {};          // { kind: { id: data } }
  let userId = demo ? 'demo' : null;
  let status = { online: navigator.onLine, syncing: false, error: null, paused: false, lastSync: null };
  const cacheKey = () => `serelys:cache:${userId}`;
  const queueKey = () => `serelys:queue:${userId}`;
  const emit = () => listeners.forEach((f) => f());
  const setStatus = (s) => { status = { ...status, ...s }; emit(); };

  function applyLocal(kind, id, data) {
    items = { ...items, [kind]: { ...(items[kind] || {}) } };
    if (data === null) delete items[kind][id]; else items[kind][id] = data;
    LS.set(cacheKey(), items);
    emit();
  }

  async function flushQueue() {
    if (demo || !userId) return;
    const q = LS.get(queueKey(), []);
    if (!q.length) return;
    const rest = [];
    for (const op of q) {
      try {
        const r = op.data === null
          ? await sb.from('items').delete().match({ user_id: userId, kind: op.kind, id: op.id })
          : await sb.from('items').upsert({ user_id: userId, kind: op.kind, id: op.id, data: op.data, updated_at: new Date().toISOString() });
        if (r.error) throw r.error;
      } catch (e) { rest.push(op); setStatus({ error: e.message || String(e) }); }
    }
    LS.set(queueKey(), rest);
    if (!rest.length) setStatus({ error: null });
  }

  async function write(kind, id, data) {
    applyLocal(kind, id, data);
    if (demo) { LS.set('serelys:demo', items); return; }
    LS.set(queueKey(), [...LS.get(queueKey(), []).filter((o) => !(o.kind === kind && o.id === id)), { kind, id, data }]);
    await flushQueue();
  }

  async function load() {
    if (demo) { items = LS.get('serelys:demo', {}); emit(); return; }
    if (!userId) return;
    items = LS.get(cacheKey(), items);
    emit();
    setStatus({ syncing: true });
    try {
      await flushQueue();
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('items').select('kind,id,data').range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const next = {};
      for (const r of all) (next[r.kind] ||= {})[r.id] = r.data;
      // Les modifications pas encore envoyées restent prioritaires
      for (const op of LS.get(queueKey(), [])) { next[op.kind] ||= {}; if (op.data === null) delete next[op.kind][op.id]; else next[op.kind][op.id] = op.data; }
      items = next;
      LS.set(cacheKey(), items);
      setStatus({ syncing: false, error: null, paused: false, lastSync: new Date().toISOString() });
    } catch (e) {
      const msg = e?.message || String(e);
      // Projet en pause ou injoignable : on garde la copie locale et on le dit clairement
      setStatus({ syncing: false, error: msg, paused: /fetch|network|503|540|paused/i.test(msg) && navigator.onLine });
    }
  }

  const store = {
    demo,
    sb,
    get items() { return items; },
    get status() { return status; },
    get userId() { return userId; },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    put: (kind, id, data) => write(kind, id, data),
    remove: (kind, id) => write(kind, id, null),
    load,
    async replaceAll(next, { merge = true } = {}) {
      for (const [kind, rows] of Object.entries(next)) {
        if (kind === 'push' || kind === 'system') continue;
        for (const [id, data] of Object.entries(rows)) await write(kind, id, data);
      }
      if (!merge) {
        for (const [kind, rows] of Object.entries(items)) {
          if (kind === 'push' || kind === 'system') continue;
          for (const id of Object.keys(rows)) if (!next[kind]?.[id]) await write(kind, id, null);
        }
      }
    },

    // ---------------- Connexion
    async session() {
      if (demo) return { ok: true };
      const { data } = await sb.auth.getSession();
      if (!data.session) return { ok: false };
      userId = data.session.user.id;
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return { ok: false, mfa: true, email: data.session.user.email };
      return { ok: true, email: data.session.user.email };
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(frError(error.message));
      return store.session();
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw new Error(frError(error.message));
      return data.session ? store.session() : { ok: false, confirm: true };
    },
    async signOut() { if (!demo) await sb.auth.signOut(); userId = demo ? 'demo' : null; items = {}; emit(); },
    async mfaVerifyLogin(code) {
      const { data } = await sb.auth.mfa.listFactors();
      const f = data?.totp?.find((x) => x.status === 'verified');
      if (!f) throw new Error('Aucune double authentification trouvée.');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
      if (error) throw new Error('Code incorrect. Réessaie avec le nouveau code.');
      return store.session();
    },
    async mfaStatus() {
      if (demo) return { enabled: false };
      const { data } = await sb.auth.mfa.listFactors();
      return { enabled: !!data?.totp?.some((x) => x.status === 'verified'), factors: data?.totp || [] };
    },
    async mfaEnroll() {
      const { data: list } = await sb.auth.mfa.listFactors();
      for (const f of list?.all || []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Serelys' });
      if (error) throw new Error(frError(error.message));
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async mfaConfirm(factorId, code) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) throw new Error('Code incorrect. Réessaie avec le nouveau code.');
    },

    // ---------------- Programme des notifications
    async callNotify(body) {
      if (demo) throw new Error('Pas disponible en mode démo.');
      const { data: s } = await sb.auth.getSession();
      const r = await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.session?.access_token || SUPABASE_ANON_KEY}` },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      return j;
    },
  };

  if (!demo) {
    sb.auth.onAuthStateChange((_e, s) => { if (s?.user) userId = s.user.id; });
    window.addEventListener('online', () => { setStatus({ online: true }); load(); });
    window.addEventListener('offline', () => setStatus({ online: false }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && userId) load(); });
  }
  return store;
}

function frError(m) {
  if (/Invalid login credentials/i.test(m)) return 'Adresse mail ou mot de passe incorrect.';
  if (/Signups not allowed/i.test(m)) return 'La création de compte est fermée (c’est normal : l’appli est réservée à toi).';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse : connecte-toi.';
  if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse mail (clique sur le lien reçu par mail).';
  return m;
}

export { LS };
