import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { applicationStore, openData } from '../server/data.mjs';
import { createApi } from '../server/api.mjs';
import { sendDueReminders } from '../server/events.mjs';
import { createMail } from '../server/mail.mjs';
import { configureGoogle } from '../server/google.mjs';
import { configurePush, createPushWorker } from '../server/push.mjs';

const types = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', png: 'image/png', woff2: 'font/woff2', svg: 'image/svg+xml',
  webmanifest: 'application/manifest+json',
};
const assetRoute = /^\/(?:src\/[\w-]+\.(?:js|css)|public\/[\w-]+\.(?:png|woff2|svg)|sw\.js|manifest\.webmanifest)$/;

function configuredOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) return url;
  } catch {
    // La configuración debe indicar un origen HTTPS completo.
  }
  throw new Error('CALVARIO_PUBLIC_ORIGIN debe contener solo el origen HTTPS de Calvario.');
}

export function createAppServer(database, { sendMail = createMail(), accountClock, publicOrigin, google, push } = {}) {
  const db = applicationStore(database);
  const api = createApi(db, { sendMail, accountClock, google, push });
  const external = configuredOrigin(publicOrigin);
  const authDomain = google?.config.authDomain;
  const googleSources = authDomain
    ? "script-src 'self' https://www.gstatic.com https://apis.google.com; " +
      "frame-src https://" + authDomain + " https://apis.google.com https://accounts.google.com; " +
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://" + authDomain + "; "
    : "script-src 'self'; ";
  return createServer(async (request, response) => {
    const host = request.headers.host?.toLowerCase() ?? '';
    if (external ? host !== external.host : !/^(localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) {
      return response.writeHead(421).end();
    }
    const expectedOrigin = external?.origin ?? 'http://' + host;
    response.setHeader('Content-Security-Policy', "default-src 'self'; " + googleSources +
      "style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (authDomain) response.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');

    let pathname;
    try {
      pathname = new URL(request.url, expectedOrigin).pathname;
    } catch {
      return response.writeHead(400).end();
    }

    if (pathname.startsWith('/api/')) return api(request, response, pathname, expectedOrigin);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    }
    if (pathname !== '/' && !assetRoute.test(pathname)) return response.writeHead(404).end();
    const path = pathname === '/' ? '/index.html' : pathname;
    try {
      const content = await readFile(new URL('..' + path, import.meta.url));
      return response.writeHead(200, {
        'Content-Type': types[path.split('.').at(-1)],
        'Cache-Control': 'no-cache',
      }).end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      return response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
}

export async function start(filename, { demo = false } = {}) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
  }
  const publicOrigin = demo ? undefined : process.env.CALVARIO_PUBLIC_ORIGIN;
  if (publicOrigin && !process.env.CALVARIO_SMTP_URL) {
    throw new Error('Configura el correo SMTP para un origen público.');
  }
  const sendMail = createMail({ demo });
  const google = configureGoogle();
  const push = demo ? null : configurePush();
  const db = await openData(filename,{ demo });
  const server = createAppServer(db, { sendMail, publicOrigin, google, push });
  const pushWorker = push && createPushWorker(db,push.deliver);
  const pushTimer = pushWorker && setInterval(() => {
    pushWorker.drain().catch(() => console.error('No se pudo procesar la cola de notificaciones.'));
  },5000);
  pushTimer?.unref?.();
  const timer = setInterval(() => {
    sendDueReminders(db).catch(() => console.error('No se pudieron procesar los recordatorios.'));
  }, 30000);
  timer.unref();
  server.on('close', () => {
    clearInterval(timer);
    clearInterval(pushTimer);
    db.close().catch(() => console.error('No se pudo cerrar la base de datos.'));
  });
  const database = db.dialect === 'postgres' ? 'Supabase PostgreSQL' : 'SQLite';
  return server.listen(port, '127.0.0.1', () => console.log('Calvario · http://localhost:' + port + ' · ' + database));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await start();
