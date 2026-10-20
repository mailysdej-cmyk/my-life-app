// Notifications web push (iPhone : iOS 16.4 ou plus, appli ajoutée à l'écran d'accueil).

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function b64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function hash(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function deviceName() {
  if (/iPhone/.test(navigator.userAgent)) return 'iPhone';
  if (isIOS()) return 'iPad';
  if (/Macintosh/.test(navigator.userAgent)) return 'Mac';
  return 'Ordinateur';
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// À appeler directement depuis un appui sur un bouton (exigé par Safari).
export async function enablePush(store) {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) throw new Error('Sur iPhone, ajoute d’abord l’appli à l’écran d’accueil, puis ouvre-la depuis son icône.');
    throw new Error('Ce navigateur ne gère pas les notifications.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Sur iPhone : Réglages › Notifications › Serelys › Autoriser.');
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await store.callNotify({ action: 'vapid' });
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey) {
    const cur = btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (cur !== publicKey) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const json = sub.toJSON();
  await store.put('push', await hash(json.endpoint), { subscription: json, device: deviceName(), createdAt: new Date().toISOString() });
  return true;
}

export async function disablePush(store) {
  const sub = await currentSubscription();
  if (sub) { await store.remove('push', await hash(sub.endpoint)); await sub.unsubscribe(); }
}

export async function thisDeviceId() {
  const sub = await currentSubscription();
  return sub ? hash(sub.endpoint) : null;
}
