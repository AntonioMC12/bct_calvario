import { randomUUID } from 'node:crypto';
import { body, choice, HttpError, json, requireThat, text } from './http.mjs';
import { checkPassword, endSession, expiredCookie, getMember, hashPassword, sessionCookie, startSession, tokenHash } from './security.mjs';
import { audit, calendarFile, cancelEvent, eventById, eventDetail, eventList, managers, notify, saveEvent, saveIntention, savePresence, sendDueReminders } from './events.mjs';
import { catalog, createWork, servePdf, approveScore, uploadPdf } from './music.mjs';
import { formation, saveFormation, saveTemplate } from './formations.mjs';
import { transaction } from './store.mjs';
import { createAccountMail } from './account-mail.mjs';
import { authenticateWithGoogle } from './google.mjs';
import { subscribe, unsubscribe } from './push.mjs';

const directors = ['director'];
const admins = ['admin'];
const pdfLimit = 7_100_000;
const now = () => new Date().toISOString();

function loginResult(request,response,status,token,secure,value = {}) {
  if (!token) return json(response,status,value);
  if (request.hosted) return json(response,status,{ ...value,sessionToken:token });
  return json(response,status,value,{ 'Set-Cookie':sessionCookie(token,secure) });
}

function publicAccount(member) {
  if (!member) return null;
  if (member.status === 'pending') return {
    id: member.id, name: member.name, status: member.status, email: member.email,
    needsEmailVerification: Boolean(member.requires_email_verification && !member.email_verified_at),
  };
  return member.status === 'active' ? member : { id: member.id, name: member.name, status: member.status };
}

function email(value) {
  const address = text(value, 254, 'Correo electrónico', true).toLowerCase();
  requireThat(/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address), 422, 'Introduce un correo electrónico válido.');
  return address;
}

function password(value, min) {
  requireThat(typeof value === 'string' && value.length >= min && value.length <= 128,
    422, 'La contraseña debe tener entre ' + min + ' y 128 caracteres.');
  return value;
}

async function review(db, actor, id, input) {
  const status = choice(input.status, ['active','rejected'], 'Resolución');
  return transaction(db, async () => {
    if (status === 'active') {
      const pending = await db.prepare("SELECT requires_email_verification, email_verified_at FROM members WHERE id = ? AND status = 'pending'").get(id);
      requireThat(!pending?.requires_email_verification || pending.email_verified_at, 409, 'El solicitante aún debe confirmar su correo.');
    }
    const result = await db.prepare(`
      UPDATE members SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(status, now(), actor.id, id);
    requireThat(result.changes, 409, 'La solicitud ya no está pendiente.');
    await audit(db, actor.id, 'access.' + status, id);
    return { status };
  });
}

async function dashboard(db, member) {
  await sendDueReminders(db);
  const [notices,events,works] = await Promise.all([
    db.prepare(`
      SELECT n.id, n.title, n.message, n.created_at, n.event_id, i.read_at
      FROM notices n JOIN inbox i ON i.notice_id = n.id
      WHERE i.member_id = ? ORDER BY n.created_at DESC, n.id DESC
    `).all(member.id),
    eventList(db, member),
    catalog(db, member),
  ]);
  return { member, events, notices, works, updatedAt: now() };
}

export function createApi(db, { sendMail, accountClock, google, push, publicSite, background } = {}) {
  const dummyHash = hashPassword(randomUUID());
  const accountMail = sendMail && createAccountMail(db,sendMail,{ now:accountClock,background });
  const attempts = new Map();

  function rateLimit(request, operation, limit, interval) {
    const time = Date.now();
    const key = operation + ':' + request.socket.remoteAddress;
    const record = attempts.get(key);
    const stillValid = record?.expires > time;
    const count = stillValid ? record.count : 0;
    requireThat(count < limit, 429, 'Demasiados intentos. Inténtalo más tarde.');
    attempts.set(key, { count: count + 1, expires: stillValid ? record.expires : time + interval });
  }

  async function handle(request, response, pathname, expectedOrigin) {
    const method = request.method;
    const member = await getMember(db, request);
    const secure = expectedOrigin.startsWith('https://');
    if (method !== 'GET') {
      const origin = request.headers.origin;
      requireThat(!origin || origin === expectedOrigin, 403, 'Origen no autorizado.');
    }

    if (method === 'GET' && pathname === '/api/session') {
      return json(response, 200, { member: publicAccount(member), google: google?.config ?? null,
        pushEnabled: Boolean(push), mailEnabled:Boolean(accountMail) });
    }

    if (method === 'POST' && pathname === '/api/logout') {
      await body(request);
      await endSession(db, request);
      return json(response, 200, {}, request.hosted ? {} : { 'Set-Cookie':expiredCookie(secure) });
    }

    if (method === 'POST' && pathname === '/api/auth/google') {
      rateLimit(request, 'google', 20, 60000);
      const result = await authenticateWithGoogle(db,google,request,await body(request));
      return loginResult(request,response,200,result.token,secure,{ linked:Boolean(result.linked) });
    }

    if (method === 'POST' && ['/api/account/forgot','/api/account/resend','/api/account/verify','/api/account/reset'].includes(pathname)) {
      requireThat(accountMail,503,'El envío de correo aún no está configurado para este piloto.');
      const input = await body(request);
      if (pathname === '/api/account/forgot') {
        rateLimit(request, 'technical-mail', 8, 300000);
        const recipient = await db.prepare(`
          SELECT id, email FROM members WHERE email = ? AND status IN ('active','pending') AND password_enabled = 1
        `).get(email(input.email));
        if (recipient) await accountMail.issue(recipient, 'reset', publicSite ?? expectedOrigin);
        return json(response, 202, {});
      }
      if (pathname === '/api/account/resend') {
        rateLimit(request, 'technical-mail', 8, 300000);
        const current = await getMember(db, request);
        requireThat(current && current.id === member?.id && current.status === 'pending', 403, 'Inicia sesión con la solicitud pendiente.');
        requireThat(!request.headers['x-calvario-account'] || request.headers['x-calvario-account'] === current.id,
          409, 'La cuenta activa ha cambiado.', 'account_changed');
        if (!current.email_verified_at) await accountMail.issue(current, 'verify', publicSite ?? expectedOrigin);
        return json(response, 202, {});
      }
      rateLimit(request, 'account-token', 20, 60000);
      if (pathname === '/api/account/verify') await accountMail.verify(input.token);
      else await accountMail.reset(input.token, password(input.password, 12));
      return json(response, 200, {});
    }

    if (method === 'POST' && ['/api/login','/api/request-access'].includes(pathname)) {
      const input = await body(request);
      const signup = pathname === '/api/request-access';
      rateLimit(request, signup ? 'signup' : 'login', signup ? 8 : 20, 60000);
      const address = email(input.email);
      const secret = password(input.password, signup ? 12 : 1);
      let id;
      let verifiedHash;
      if (signup) {
        requireThat(accountMail,503,'El alta por correo aún no está configurada para este piloto.');
        const name = text(input.name, 120, 'Nombre y apellidos', true);
        const instrument = text(input.instrument, 80, 'Instrumento', true);
        const voice = text(input.voice, 80, 'Voz');
        const hash = await hashPassword(secret);
        id = randomUUID();
        const inserted = await db.prepare(`
          INSERT INTO members(id, email, password, name, instrument, voice, created_at, requires_email_verification)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(email) DO NOTHING
        `).run(id, address, hash, name, instrument, voice, now());
        requireThat(inserted.changes, 409, 'Ya existe una cuenta con este correo. Prueba a iniciar sesión.');
        await accountMail.issue({ id, email: address }, 'verify', publicSite ?? expectedOrigin);
      } else {
        const match = await db.prepare('SELECT id, password FROM members WHERE email = ? AND password_enabled = 1').get(address);
        const valid = await checkPassword(secret, match?.password ?? await dummyHash);
        requireThat(valid && match, 401, 'El correo o la contraseña son incorrectos.');
        id = match.id;
        verifiedHash = match.password;
      }
      const session = await transaction(db, async () => {
        if (!signup) {
          const current = await db.prepare('SELECT password FROM members WHERE id = ?').get(id);
          requireThat(current?.password === verifiedHash, 401, 'El correo o la contraseña son incorrectos.');
        }
        await endSession(db, request);
        return await startSession(db,id,request.hosted);
      });
      return loginResult(request,response,signup ? 201 : 200,session,secure);
    }

    requireThat(member, 401, 'Tu sesión ha caducado. Vuelve a entrar.');
    requireThat(member.status === 'active', 403, 'Tu membresía no está activa.', 'inactive');
    requireThat(!request.headers['x-calvario-account'] || request.headers['x-calvario-account'] === member.id,
      409, 'La cuenta activa ha cambiado.', 'account_changed');

    async function inputFor(roles, limit) {
      if (roles) requireThat(roles.includes(member.role), 403, 'Tu perfil no puede realizar esta operación.');
      const input = await body(request, limit);
      const current = await getMember(db, request);
      requireThat(current?.id === member.id && current.status === 'active', 403, 'Tu membresía no está activa.', 'inactive');
      if (roles) requireThat(roles.includes(current.role), 403, 'Tu perfil no puede realizar esta operación.');
      Object.assign(member, current);
      return input;
    }

    if (method === 'GET' && pathname === '/api/dashboard') return json(response, 200, await dashboard(db, member));

    if (pathname === '/api/push') {
      requireThat(push,404,'Los avisos push todavía no están configurados.');
      if (method === 'GET') {
        const devices = await db.prepare('SELECT id FROM push_subscriptions WHERE session_token = ?').all(tokenHash(request));
        return json(response,200,{ publicKey:push.publicKey, bindings:devices.map(device => device.id) });
      }
      if (method === 'POST') {
        const input = await inputFor();
        return json(response,200,await subscribe(db,member,tokenHash(request),input));
      }
      if (method === 'DELETE') {
        await unsubscribe(db,tokenHash(request),await inputFor());
        return json(response,200,{});
      }
    }

    if (method === 'GET' && pathname === '/api/management') {
      requireThat(managers.includes(member.role), 403, 'Tu perfil no puede consultar los contactos.');
      const members = await db.prepare(`
        SELECT id, name, email, instrument, voice, role, status, created_at, email_verified_at, requires_email_verification
        FROM members ORDER BY name
      `).all();
      return json(response, 200, { members });
    }

    let route = pathname.match(/^\/api\/requests\/([\w-]+)$/);
    if (route && method === 'PUT') return json(response, 200, await review(db, member, route[1], await inputFor(managers)));
    if (method === 'POST' && pathname === '/api/events') {
      return json(response, 201, await saveEvent(db, member, await inputFor(managers)));
    }

    route = pathname.match(/^\/api\/events\/([\w-]+)(?:\/(calendar|cancel|intention|presence|attachments|formation|template)(?:\/([\w-]+))?)?$/);
    if (route) {
      const [, id, action, related] = route;
      if (!action && method === 'GET') return json(response, 200, await eventDetail(db, member, id));
      if (!action && method === 'PUT') return json(response, 200, await saveEvent(db, member, await inputFor(managers), id));
      if (action === 'calendar' && method === 'GET') {
        const data = calendarFile(await eventById(db, id));
        return response.writeHead(200, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename=calvario.ics', 'Cache-Control': 'no-store',
        }).end(data);
      }
      if (action === 'cancel' && method === 'POST') {
        const input = await inputFor(managers);
        return json(response, 200, await cancelEvent(db, member, id, input.version));
      }
      if (action === 'intention' && method === 'PUT') {
        const input = await inputFor(related ? directors : null);
        return json(response, 200, await saveIntention(db, member, id, related ?? member.id, input));
      }
      if (action === 'presence' && method === 'PUT') return json(response, 200, await savePresence(db, member, id, await inputFor(directors, 100000)));
      if (action === 'attachments' && method === 'POST') {
        return json(response, 201, await uploadPdf(db, member, await inputFor(managers, pdfLimit), { eventId: id }));
      }
      if (action === 'formation' && method === 'GET') {
        requireThat(admins.includes(member.role), 403, 'La gestión de formaciones corresponde a administración.');
        const templates = await db.prepare('SELECT * FROM templates ORDER BY name').all();
        const sources = await db.prepare('SELECT e.id, e.title, e.starts FROM formations f JOIN events e ON e.id = f.event_id WHERE e.id <> ? ORDER BY e.starts DESC').all(id);
        const members = await db.prepare(`
          SELECT m.id, m.name, m.instrument, m.voice, m.status, coalesce(i.value,'unset') AS intention
          FROM members m LEFT JOIN intentions i ON i.member_id = m.id AND i.event_id = ?
          WHERE m.status IN ('active','inactive') ORDER BY m.name
        `).all(id);
        return json(response, 200, { ...await formation(db, id), templates, sources, members });
      }
      if (action === 'formation' && method === 'PUT') return json(response, 200, await saveFormation(db, member, id, await inputFor(admins)));
      if (action === 'template' && method === 'POST') return json(response, 201, await saveTemplate(db, id, await inputFor(admins)));
    }

    if (method === 'POST' && pathname === '/api/notices') {
      const input = await inputFor(directors);
      const title = text(input.title, 120, 'Asunto', true);
      const message = text(input.message, 4000, 'Mensaje', true);
      const id = await notify(db, title, message, null, member.id);
      return json(response, 201, { id });
    }
    route = pathname.match(/^\/api\/notices\/([\w-]+)\/read$/);
    if (route && method === 'PUT') {
      await inputFor();
      const result = await db.prepare('UPDATE inbox SET read_at = coalesce(read_at, ?) WHERE notice_id = ? AND member_id = ?')
        .run(now(), route[1], member.id);
      requireThat(result.changes, 404, 'Aviso no encontrado.');
      return json(response, 200, {});
    }
    if (method === 'POST' && pathname === '/api/works') return json(response, 201, await createWork(db, await inputFor(admins)));
    route = pathname.match(/^\/api\/works\/([\w-]+)\/scores$/);
    if (route && method === 'POST') {
      return json(response, 201, await uploadPdf(db, member, await inputFor(admins, pdfLimit), { workId: route[1] }));
    }
    route = pathname.match(/^\/api\/files\/([\w-]+)(\/approve)?$/);
    if (route) {
      if (!route[2] && method === 'GET') return await servePdf(db, member, route[1], response);
      if (route[2] && method === 'PUT') {
        await inputFor(directors);
        return json(response, 200, await approveScore(db, member, route[1]));
      }
    }
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  return async (request, response, pathname, expectedOrigin) => {
    try {
      await handle(request, response, pathname, expectedOrigin);
    } catch (error) {
      if (error instanceof HttpError) return json(response, error.status, { error: error.message, code: error.code });
      console.error(error);
      if (!response.headersSent) return json(response, 500, { error: 'No se pudo completar la operación.' });
      response.destroy();
    }
  };
}
