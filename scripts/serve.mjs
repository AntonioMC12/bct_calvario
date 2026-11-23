import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Servidor local de desarrollo. Solo expone los recursos enumerados.
const routes = new Map([
  ['/', ['../index.html', 'text/html; charset=utf-8']],
  ['/src/main.js', ['../src/main.js', 'text/javascript; charset=utf-8']],
  ['/src/styles.css', ['../src/styles.css', 'text/css; charset=utf-8']],
]);
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const route = routes.get(pathname);
  if (!route) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    return;
  }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Error interno');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`BCT Calvario: http://localhost:${port}`);
});
