/* Aladdin Tech — app instalável (PWA): abre rápido, funciona sem internet e recebe notificações */
const V = 'aladdin-v2';
const DATA = 'aladdin-data-v1';
const SHELL = ['/offline.html', '/css/style.css', '/css/store-v2.css', '/css/extras.css', '/css/herofx.css', '/css/navfx.css', '/css/rank.css',
  '/js/icons.js', '/js/devices.js', '/js/track.js', '/js/app.js', '/img/icon-192.png', '/img/logo-original.jpg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // vitrine: rede primeiro; sem internet, mostra a última versão guardada
  if (/^\/api\/(products|categories|settings)(\/|$)/.test(url.pathname)) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(DATA).then((x) => x.put(req, c)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  if (/^\/(api|admin|documento|feed)\b/.test(url.pathname)) return; // dados pessoais: sempre da rede, nunca guardados
  if (req.mode === 'navigate') { // páginas: rede primeiro; sem internet, página offline
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (/^\/(css|js)\//.test(url.pathname) && url.searchParams.has('v')) { // arquivo versionado nunca muda: cache direto
    e.respondWith(caches.open(V).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (/^\/(css|js|img|uploads)\//.test(url.pathname)) { // arquivos: cache e atualiza em segundo plano
    e.respondWith(caches.open(V).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Aladdin Tech', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Aladdin Tech', {
    body: d.body || '', icon: '/img/icon-192.png', badge: '/img/badge-96.png', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.startsWith(location.origin)) { w.focus(); return w.navigate(url); }
    return self.clients.openWindow(url);
  }));
});
