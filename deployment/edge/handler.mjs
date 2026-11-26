import { createApi } from '../_shared/server/api.mjs';
import { postgresSchemaVersion } from '../_shared/server/schema-version.mjs';

const headers = {
  'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':'content-type, x-calvario-account, x-calvario-session',
  'Access-Control-Expose-Headers':'content-disposition',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  Vary:'Origin',
};

export function createEdgeHandler(db,{ site, ...options }) {
  const url = new URL(site);
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password || !url.pathname.endsWith('/')) {
    throw new Error('CALVARIO_SITE_URL debe ser la URL HTTPS de Pages terminada en /.');
  }
  const api = createApi(db,{ ...options,publicSite:url.href });
  const cors = { ...headers,'Access-Control-Allow-Origin':url.origin };

  function json(status,value,withCors = false) {
    return Response.json(value,{ status,headers:withCors ? cors : { 'Cache-Control':'no-store' } });
  }

  return async request => {
    const pathname = new URL(request.url).pathname.replace(/^\/(?:functions\/v1\/)?calvario-api(?=\/|$)/,'');
    const origin = request.headers.get('origin');
    if (pathname === '/health' && request.method === 'GET') {
      try {
        const { version } = await db.prepare('SELECT version FROM calvario.schema_version WHERE singleton = 1').get();
        const ready = version === postgresSchemaVersion;
        return json(ready ? 200 : 503,{ status:ready ? 'ready' : 'schema' },origin === url.origin);
      } catch {
        return json(503,{ status:'schema' },origin === url.origin);
      }
    }
    if (origin !== url.origin) return json(403,{ error:'Origen no autorizado.' });
    if (request.method === 'OPTIONS') return new Response(null,{ status:204,headers:cors });
    if (!pathname.startsWith('/api/')) return json(404,{ error:'Ruta no encontrada.' },true);

    const incoming = {
      method:request.method, hosted:true, headers:Object.fromEntries(request.headers),
      socket:{ remoteAddress:'edge' },
      async *[Symbol.asyncIterator]() {
        if (request.body) yield* request.body;
      },
    };
    let result, status = 500, responseHeaders = new Headers(cors);
    const outgoing = {
      headersSent:false,
      writeHead(code,additions) {
        this.headersSent = true;
        status = code;
        for (const [name,value] of Object.entries(additions)) responseHeaders.set(name,value);
        return this;
      },
      end(content = null) { result = new Response(content,{ status,headers:responseHeaders }); },
      destroy() { result = json(500,{ error:'No se pudo completar la operación.' },true); },
    };
    await api(incoming,outgoing,pathname,url.origin);
    return result ?? json(500,{ error:'No se pudo completar la operación.' },true);
  };
}
