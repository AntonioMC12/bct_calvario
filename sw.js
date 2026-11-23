const SHELL = 'calvario-shell-v3';
const assets = ['/', '/manifest.webmanifest', '/public/escudo.png', '/public/icon-192.png', '/public/icon-512.png',
  '/public/inter.woff2', '/public/cinzel.woff2',
  '/src/main.js', '/src/ui.js', '/src/time.js', '/src/storage.js', '/src/styles.css',
  '/src/events.js', '/src/repertoire.js', '/src/management.js', '/src/access.js'];
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
