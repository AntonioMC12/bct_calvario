import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../server/db.mjs';
import { createApi } from '../server/api.mjs';
import { sendDueReminders } from '../server/events.mjs';
import { createMail } from '../server/mail.mjs';

const types = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', png: 'image/png', woff2: 'font/woff2',
  webmanifest: 'application/manifest+json',
};
const assetRoute = /^\/(?:src\/[\w-]+\.(?:js|css)|public\/[\w-]+\.(?:png|woff2)|sw\.js|manifest\.webmanifest)$/;

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

export function createAppServer(db, { sendMail = createMail(), accountClock, publicOrigin } = {}) {
  const api = createApi(db, { sendMail, accountClock });
  const external = configuredOrigin(publicOrigin);
  return createServer(async (request, response) => {
    const host = request.headers.host?.toLowerCase() ?? '';
    if (external ? host !== external.host : !/^(localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) {
      return response.writeHead(421).end();
    }
    const expectedOrigin = external?.origin ?? 'http://' + host;
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
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

export function start(filename, { demo = false } = {}) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
  }
  const publicOrigin = demo ? undefined : process.env.CALVARIO_PUBLIC_ORIGIN;
  if (publicOrigin && !process.env.CALVARIO_SMTP_URL) {
    throw new Error('Configura el correo SMTP para un origen público.');
  }
  const sendMail = createMail({ demo });
  const db = openDatabase(filename);
  const server = createAppServer(db, { sendMail, publicOrigin });
  const timer = setInterval(() => {
    try {
      sendDueReminders(db);
    } catch (error) {
      console.error('No se pudieron procesar los recordatorios', error);
    }
  }, 30000);
  timer.unref();
  server.on('close', () => {
    clearInterval(timer);
    db.close();
  });
  return server.listen(port, '127.0.0.1', () => console.log('Calvario · http://localhost:' + port));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
