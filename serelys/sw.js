// Service worker Serelys : fonctionnement hors ligne et notifications.
// Portée limitée au dossier /serelys/ : n'agit pas sur l'appli My Life.
const CACHE = 'serelys-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'vendor/preact-htm.js', 'vendor/supabase.js',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/push.js', 'js/config.js', 'js/engine.js', 'js/catalog.js', 'js/dates.js',
  'version.json', 'js/screens/clients.js', 'js/screens/money.js', 'js/screens/prospects.js', 'js/screens/cards.js', 'js/screens/settings.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('serelys-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), copie locale si pas de réseau.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Serelys', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.includes('/serelys/') && 'focus' in c) return c.focus();
    return self.clients.openWindow(e.notification.data?.url || './');
  }));
});
