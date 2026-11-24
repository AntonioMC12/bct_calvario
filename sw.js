const SHELL = 'calvario-shell-v4';
const assets = ['/', '/manifest.webmanifest', '/public/escudo.png', '/public/icon-192.png', '/public/icon-512.png',
  '/public/inter.woff2', '/public/cinzel.woff2',
  '/src/main.js', '/src/ui.js', '/src/time.js', '/src/storage.js', '/src/styles.css',
  '/src/events.js', '/src/repertoire.js', '/src/management.js', '/src/access.js',
  '/src/google.js', '/src/push.js', '/public/google-g.png'];
const assetPaths = new Set(assets);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(assets)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith('calvario-shell-') && key !== SHELL).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !assetPaths.has(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(SHELL);
    return (await cache.match(url.pathname)) ?? Response.error();
  }));
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || !/^[0-9a-f-]{36}$/.test(payload.notice) || !/^[0-9a-f-]{36}$/.test(payload.binding)) return;
    const local = await (await caches.open('calvario-device-push')).match('/_calvario-push-binding');
    if (!local || await local.text() !== payload.binding) return;
    await self.registration.showNotification('Calvario',{
      body:'Tienes un aviso nuevo en la aplicación.', icon:'/public/icon-192.png',
      tag:'calvario-' + payload.notice, data:{ notice:payload.notice, binding:payload.binding },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const { notice, binding } = event.notification.data ?? {};
    if (!/^[0-9a-f-]{36}$/.test(notice) || !/^[0-9a-f-]{36}$/.test(binding)) return;
    const local = await (await caches.open('calvario-device-push')).match('/_calvario-push-binding');
    if (!local || await local.text() !== binding) return;
    const target = new URL('/#/avisos/' + notice,self.location.origin).href;
    const [window] = await self.clients.matchAll({ type:'window',includeUncontrolled:true });
    if (window) {
      try {
        const page = await window.navigate(target);
        if (page) return page.focus();
      } catch {
        // Abre una ventana si la que existía ya no está disponible.
      }
    }
    return self.clients.openWindow(target);
  })());
});
