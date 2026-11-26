const app = new URL(self.registration.scope);
const cachePrefix = 'calvario-shell-' + app.pathname + ':';
const SHELL = cachePrefix + 'v22';
const pushCache = 'calvario-device-push' + (app.pathname === '/' ? '' : app.pathname);
const pushBinding = new URL('_calvario-push-binding',app).href;
const assets = ['/', '/manifest.webmanifest', '/public/escudo.png', '/public/escudo_calvario_vector.svg', '/public/icon-192.png', '/public/icon-512.png',
  '/public/inter.woff2', '/public/cinzel.woff2', '/public/plus-jakarta-sans.woff2', '/public/login-hero.jpg',
  '/src/main.js', '/src/ui.js', '/src/roles.js', '/src/time.js', '/src/storage.js', '/src/styles.css', '/src/theme.js',
  '/src/events.js', '/src/repertoire.js', '/src/management.js', '/src/material.js', '/src/part-options.js', '/src/parts.js',
  '/src/access.js', '/src/report.js',
  '/src/google.js', '/src/push.js', '/public/google-g.png', '/src/connection.js', '/src/runtime.js']
  .map(path => new URL(path.slice(1),app).href);
const assetPaths = new Set(assets);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(assets.map(url => new Request(url,{ cache:'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    (key.startsWith(cachePrefix) || (app.pathname === '/' && key === 'calvario-shell-v4')) && key !== SHELL).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !assetPaths.has(url.origin + url.pathname)) return;
  event.respondWith(fetch(event.request,{ cache:'no-cache' }).catch(async () => {
    const cache = await caches.open(SHELL);
    return (await cache.match(url.origin + url.pathname)) ?? Response.error();
  }));
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || !/^[0-9a-f-]{36}$/.test(payload.notice) || !/^[0-9a-f-]{36}$/.test(payload.binding)) return;
    const local = await (await caches.open(pushCache)).match(pushBinding);
    if (!local || await local.text() !== payload.binding) return;
    await self.registration.showNotification('Calvario',{
      body:'Tienes un aviso nuevo en la aplicación.', icon:new URL('public/icon-192.png',app).href,
      tag:'calvario-' + payload.notice, data:{ notice:payload.notice, binding:payload.binding },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const { notice, binding } = event.notification.data ?? {};
    if (!/^[0-9a-f-]{36}$/.test(notice) || !/^[0-9a-f-]{36}$/.test(binding)) return;
    const local = await (await caches.open(pushCache)).match(pushBinding);
    if (!local || await local.text() !== binding) return;
    const target = new URL('#/avisos/' + notice,app).href;
    const windows = await self.clients.matchAll({ type:'window',includeUncontrolled:true });
    const window = windows.find(client => client.url.startsWith(app.href));
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
