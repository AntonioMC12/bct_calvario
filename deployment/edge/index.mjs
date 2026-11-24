import pg from 'pg';
import { postgresStore, safeNumber } from '../_shared/server/store.mjs';
import { configureGoogle } from '../_shared/server/google.mjs';
import { createPushWorker, configurePush } from '../_shared/server/push.mjs';
import { sendDueReminders } from '../_shared/server/events.mjs';
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createEdgeHandler } from './handler.mjs';
import { defaultSite } from './site.mjs';

const env = Deno.env.toObject();
const pool = new pg.Pool({
  connectionString:env.CALVARIO_EDGE_DATABASE_URL || env.SUPABASE_DB_URL,
  ssl:{ rejectUnauthorized:true,...(env.CALVARIO_DATABASE_CA_PEM ? { ca:env.CALVARIO_DATABASE_CA_PEM } : {}) },
  max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,
  types:{ getTypeParser:(oid,format) => oid === 20 && format !== 'binary' ? safeNumber : pg.types.getTypeParser(oid,format) },
});
pool.on('error',() => console.error('Se perdió la conexión con la base de datos.'));
const db = postgresStore(pool,{ transactionPool:true });
const google = configureGoogle(env);
const push = configurePush(env);
const pushWorker = push && createPushWorker(db,push.deliver);
const mail = env.CALVARIO_RESEND_API_KEY && env.CALVARIO_MAIL_FROM ? async message => {
  const response = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{ Authorization:'Bearer ' + env.CALVARIO_RESEND_API_KEY,'Content-Type':'application/json' },
    body:JSON.stringify({ from:env.CALVARIO_MAIL_FROM,...message }),
    signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('El proveedor no aceptó el correo.');
} : undefined;
const handler = createEdgeHandler(db,{
  site:env.CALVARIO_SITE_URL || defaultSite,
  google,push,sendMail:mail,
  background:action => EdgeRuntime.waitUntil(action()),
});
function isJobAuthorized(request) {
  const expected = env.CALVARIO_JOB_SECRET;
  const received = request.headers.get('x-calvario-job');
  if (!expected || expected.length < 32 || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a,b);
}
Deno.serve(async request => {
  if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/calvario-api/jobs')) {
    if (!isJobAuthorized(request)) return new Response(null,{ status:403 });
    await sendDueReminders(db);
    if (pushWorker) await pushWorker.drain();
    return new Response(null,{ status:204 });
  }
  return handler(request);
});
