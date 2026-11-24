import { createECDH, randomUUID } from 'node:crypto';
import { sendNotification } from 'web-push';
import { transaction } from './data.mjs';
import { requireThat } from './http.mjs';

const publicHosts = ['fcm.googleapis.com'];
const suffixes = ['.push.apple.com','.push.services.mozilla.com','.notify.windows.com'];
const attemptLimit = 4;
const windowMs = 24 * 60 * 60 * 1000;
const keyBytes = (value, length) => typeof value === 'string' && /^[\w-]+$/.test(value) &&
  Buffer.from(value,'base64url').length === length && Buffer.from(value,'base64url').toString('base64url') === value;

export function configurePush(env = process.env) {
  const { CALVARIO_PUSH_PUBLIC_KEY:publicKey, CALVARIO_PUSH_PRIVATE_KEY:privateKey, CALVARIO_PUSH_CONTACT:contact } = env;
  if (!publicKey && !privateKey && !contact) return null;
  if (!keyBytes(publicKey,65) || !keyBytes(privateKey,32) || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact || '')) {
    throw new Error('Configura las dos claves VAPID y CALVARIO_PUSH_CONTACT con una dirección mailto:.');
  }
  const pair = createECDH('prime256v1');
  try {
    pair.setPrivateKey(Buffer.from(privateKey,'base64url'));
    if (pair.getPublicKey().toString('base64url') !== publicKey) throw new Error();
  } catch {
    throw new Error('Las claves VAPID no forman un par válido.');
  }
  return {
    publicKey,
    deliver: (subscription,payload) => sendNotification(subscription,JSON.stringify(payload),{
      vapidDetails:{ subject:contact, publicKey, privateKey }, TTL:3600, timeout:10000,
    }),
  };
}

function endpointUrl(value) {
  let url;
  try {
    if (typeof value === 'string' && value.length <= 2048) url = new URL(value);
  } catch {
    // Se rechaza una dirección que no pertenezca a un servicio admitido.
  }
  requireThat(url && url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    !url.hash && url.pathname !== '/' && (publicHosts.includes(url.hostname) ||
      suffixes.some(suffix => url.hostname.endsWith(suffix))),422,'El servicio push del dispositivo no es compatible.');
  return url.href;
}

export async function subscribe(db, member, session, input) {
  const endpoint = endpointUrl(input.endpoint);
  const { p256dh, auth } = input.keys ?? {};
  requireThat(keyBytes(p256dh,65) && Buffer.from(p256dh,'base64url')[0] === 4 && keyBytes(auth,16),
    422,'La suscripción del dispositivo no es válida.');
  return transaction(db, async () => {
    const current = await db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    requireThat(!current || current.p256dh === p256dh && current.auth === auth,409,'El dispositivo debe renovar su suscripción.');
    if (current?.session_token === session && current.member_id === member.id) return { id:current.id };
    const { total } = await db.prepare('SELECT count(*) AS total FROM push_subscriptions WHERE session_token = ?').get(session);
    requireThat(total < 5,409,'Has alcanzado el límite de suscripciones de esta sesión.');
    if (current) await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(current.id);
    const id = randomUUID();
    await db.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, ?)').run(id,endpoint,p256dh,auth,session,member.id);
    return { id };
  });
}

export async function unsubscribe(db, session, input) {
  const endpoint = endpointUrl(input.endpoint);
  await db.prepare('DELETE FROM push_subscriptions WHERE session_token = ? AND endpoint = ?').run(session,endpoint);
}

export function createPushWorker(db, deliver, { now = Date.now } = {}) {
  let running = false;
  const remove = db.prepare('DELETE FROM push_jobs WHERE notice_id = ? AND subscription_id = ? AND lease = ?');
  async function drain() {
    if (running) return;
    running = true;
    try {
      const time = now();
      const claim = randomUUID();
      const jobs = await transaction(db, async () => {
        await db.prepare(`
          DELETE FROM push_subscriptions WHERE session_token IN (SELECT token FROM sessions WHERE expires <= ?)
          OR member_id IN (SELECT id FROM members WHERE status <> 'active')
        `).run(time);
        await db.prepare(`
          DELETE FROM push_jobs WHERE notice_id IN (SELECT id FROM notices WHERE unixepoch(created_at) * 1000 < ?)
        `).run(time - windowMs);
        const ready = await db.prepare(`
          SELECT j.notice_id, p.* FROM push_jobs j JOIN push_subscriptions p ON p.id = j.subscription_id
          WHERE j.due <= ? ORDER BY j.due LIMIT 10
        `).all(time);
        const mark = db.prepare('UPDATE push_jobs SET due = ?, lease = ? WHERE notice_id = ? AND subscription_id = ?');
        for (const job of ready) await mark.run(time + 120000,claim,job.notice_id,job.id);
        return ready;
      });
      for (const job of jobs) {
        const current = await db.prepare(`
          SELECT j.attempts FROM push_jobs j JOIN push_subscriptions p ON p.id = j.subscription_id
          JOIN members m ON m.id = p.member_id JOIN sessions s ON s.token = p.session_token
          WHERE j.notice_id = ? AND j.subscription_id = ? AND j.lease = ? AND m.status = 'active'
            AND s.expires > ?
        `).get(job.notice_id,job.id,claim,now());
        if (!current) continue;
        try {
          await deliver({ endpoint:job.endpoint, keys:{ p256dh:job.p256dh,auth:job.auth } },
            { notice:job.notice_id, binding:job.id });
          await remove.run(job.notice_id,job.id,claim);
        } catch (error) {
          const status = error?.statusCode;
          if (status === 404 || status === 410) {
            await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(job.id);
          } else if (current.attempts + 1 < attemptLimit && (!status || status === 429 || status >= 500)) {
            const due = now() + (current.attempts + 1) * 60000;
            await db.prepare(`
              UPDATE push_jobs SET due = ?, attempts = attempts + 1, lease = NULL
              WHERE notice_id = ? AND subscription_id = ? AND lease = ?
            `).run(due,job.notice_id,job.id,claim);
          } else {
            await remove.run(job.notice_id,job.id,claim);
          }
        }
      }
    } finally {
      running = false;
    }
  }
  return { drain };
}
