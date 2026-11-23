import { randomUUID } from 'node:crypto';
import { body, choice, HttpError, json, requireThat, text } from './http.mjs';
import { checkPassword, endSession, expiredCookie, getMember, hashPassword, startSession } from './security.mjs';
import { audit, calendarFile, cancelEvent, eventById, eventDetail, eventList, managers, notify, saveEvent, saveIntention, savePresence, sendDueReminders } from './events.mjs';
import { catalog, createWork, servePdf, approveScore, uploadPdf } from './music.mjs';
import { formation, saveFormation, saveTemplate } from './formations.mjs';
import { transaction } from './db.mjs';

const directors = ['director'];
const admins = ['admin'];
const pdfLimit = 7_100_000;
const now = () => new Date().toISOString();

function publicAccount(member) {
  if (!member) return null;
  return member.status === 'active' ? member : { id: member.id, name: member.name, status: member.status };
}

function email(value) {
  const address = text(value, 254, 'Correo electrónico', true).toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address), 422, 'Introduce un correo electrónico válido.');
  return address;
}

function password(value, min) {
  requireThat(typeof value === 'string' && value.length >= min && value.length <= 128,
    422, 'La contraseña debe tener entre ' + min + ' y 128 caracteres.');
  return value;
}

function review(db, actor, id, input) {
  const status = choice(input.status, ['active','rejected'], 'Resolución');
  return transaction(db, () => {
    const result = db.prepare(`
      UPDATE members SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ? AND status = 'pending'
    `).run(status, now(), actor.id, id);
    requireThat(result.changes, 409, 'La solicitud ya no está pendiente.');
    audit(db, actor.id, 'access.' + status, id);
    return { status };
  });
}

function dashboard(db, member) {
  sendDueReminders(db);
  const notices = db.prepare(`
    SELECT n.id, n.title, n.message, n.created_at, n.event_id, i.read_at
    FROM notices n JOIN inbox i ON i.notice_id = n.id
    WHERE i.member_id = ? ORDER BY n.created_at DESC, n.rowid DESC
  `).all(member.id);
  return { member, events: eventList(db, member), notices, works: catalog(db, member), updatedAt: now() };
}

export function createApi(db) {
  const dummyHash = hashPassword(randomUUID());
  const loginAttempts = new Map();

  async function handle(request, response, pathname) {
    const method = request.method;
    const member = getMember(db, request);
    if (method !== 'GET') {
      const origin = request.headers.origin;
      requireThat(!origin || origin === 'http://' + request.headers.host, 403, 'Origen no autorizado.');
    }

    if (method === 'GET' && pathname === '/api/session') {
      return json(response, 200, { member: publicAccount(member) });
    }

    if (method === 'POST' && pathname === '/api/logout') {
      await body(request);
      endSession(db, request);
      return json(response, 200, {}, { 'Set-Cookie': expiredCookie });
    }

    if (method === 'POST' && ['/api/login','/api/request-access'].includes(pathname)) {
      const input = await body(request);
      const signup = pathname === '/api/request-access';
      const key = request.socket.remoteAddress;
      const expires = Date.now() + 60000;
      const attempt = loginAttempts.get(key);
      const attempts = attempt?.expires > Date.now() ? attempt.count : 0;
      requireThat(attempts < 20, 429, 'Espera un minuto antes de volver a intentarlo.');
      loginAttempts.set(key, { count: attempts + 1, expires: attempt?.expires > Date.now() ? attempt.expires : expires });
      const address = email(input.email);
      const secret = password(input.password, signup ? 12 : 1);
      let id;
      if (signup) {
        const name = text(input.name, 120, 'Nombre y apellidos', true);
        const instrument = text(input.instrument, 80, 'Instrumento', true);
        const voice = text(input.voice, 80, 'Voz');
        const hash = await hashPassword(secret);
        id = randomUUID();
        const inserted = db.prepare(`
          INSERT INTO members(id, email, password, name, instrument, voice, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING
        `).run(id, address, hash, name, instrument, voice, now());
        requireThat(inserted.changes, 409, 'Ya existe una cuenta con este correo. Prueba a iniciar sesión.');
      } else {
        const match = db.prepare('SELECT id, password FROM members WHERE email = ?').get(address);
        const valid = await checkPassword(secret, match?.password ?? await dummyHash);
        requireThat(valid && match, 401, 'El correo o la contraseña son incorrectos.');
        id = match.id;
      }
      const session = transaction(db, () => {
        endSession(db, request);
        return startSession(db, id);
      });
      return json(response, signup ? 201 : 200, {}, { 'Set-Cookie': session });
    }

    requireThat(member, 401, 'Tu sesión ha caducado. Vuelve a entrar.');
    requireThat(member.status === 'active', 403, 'Tu membresía no está activa.', 'inactive');
    requireThat(!request.headers['x-calvario-account'] || request.headers['x-calvario-account'] === member.id,
      409, 'La cuenta activa ha cambiado.', 'account_changed');

    async function inputFor(roles, limit) {
      if (roles) requireThat(roles.includes(member.role), 403, 'Tu perfil no puede realizar esta operación.');
      const input = await body(request, limit);
      const current = getMember(db, request);
      requireThat(current?.id === member.id && current.status === 'active', 403, 'Tu membresía no está activa.', 'inactive');
      if (roles) requireThat(roles.includes(current.role), 403, 'Tu perfil no puede realizar esta operación.');
      Object.assign(member, current);
      return input;
    }

    if (method === 'GET' && pathname === '/api/dashboard') return json(response, 200, dashboard(db, member));

    if (method === 'GET' && pathname === '/api/management') {
      requireThat(managers.includes(member.role), 403, 'Tu perfil no puede consultar los contactos.');
      const members = db.prepare('SELECT id, name, email, instrument, voice, role, status, created_at FROM members ORDER BY name').all();
      return json(response, 200, { members });
    }

    let route = pathname.match(/^\/api\/requests\/([\w-]+)$/);
    if (route && method === 'PUT') return json(response, 200, review(db, member, route[1], await inputFor(managers)));
    if (method === 'POST' && pathname === '/api/events') {
      return json(response, 201, saveEvent(db, member, await inputFor(managers)));
    }

    route = pathname.match(/^\/api\/events\/([\w-]+)(?:\/(calendar|cancel|intention|presence|attachments|formation|template)(?:\/([\w-]+))?)?$/);
    if (route) {
      const [, id, action, related] = route;
      if (!action && method === 'GET') return json(response, 200, eventDetail(db, member, id));
      if (!action && method === 'PUT') return json(response, 200, saveEvent(db, member, await inputFor(managers), id));
      if (action === 'calendar' && method === 'GET') {
        const data = calendarFile(eventById(db, id));
        return response.writeHead(200, {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename=calvario.ics', 'Cache-Control': 'no-store',
        }).end(data);
      }
      if (action === 'cancel' && method === 'POST') {
        const input = await inputFor(managers);
        return json(response, 200, cancelEvent(db, member, id, input.version));
      }
      if (action === 'intention' && method === 'PUT') {
        const input = await inputFor(related ? directors : null);
        return json(response, 200, saveIntention(db, member, id, related ?? member.id, input));
      }
      if (action === 'presence' && method === 'PUT') return json(response, 200, savePresence(db, member, id, await inputFor(directors, 100000)));
      if (action === 'attachments' && method === 'POST') {
        return json(response, 201, uploadPdf(db, member, await inputFor(managers, pdfLimit), { eventId: id }));
      }
      if (action === 'formation' && method === 'GET') {
        requireThat(admins.includes(member.role), 403, 'La gestión de formaciones corresponde a administración.');
        const templates = db.prepare('SELECT * FROM templates ORDER BY name').all();
        const sources = db.prepare('SELECT e.id, e.title, e.starts FROM formations f JOIN events e ON e.id = f.event_id WHERE e.id <> ? ORDER BY e.starts DESC').all(id);
        const members = db.prepare(`
          SELECT m.id, m.name, m.instrument, m.voice, m.status, coalesce(i.value,'unset') AS intention
          FROM members m LEFT JOIN intentions i ON i.member_id = m.id AND i.event_id = ?
          WHERE m.status IN ('active','inactive') ORDER BY m.name
        `).all(id);
        return json(response, 200, { ...formation(db, id), templates, sources, members });
      }
      if (action === 'formation' && method === 'PUT') return json(response, 200, saveFormation(db, member, id, await inputFor(admins)));
      if (action === 'template' && method === 'POST') return json(response, 201, saveTemplate(db, id, await inputFor(admins)));
    }

    if (method === 'POST' && pathname === '/api/notices') {
      const input = await inputFor(directors);
      const title = text(input.title, 120, 'Asunto', true);
      const message = text(input.message, 4000, 'Mensaje', true);
      const id = transaction(db, () => notify(db, title, message, null, member.id));
      return json(response, 201, { id });
    }
    route = pathname.match(/^\/api\/notices\/([\w-]+)\/read$/);
    if (route && method === 'PUT') {
      await inputFor();
      const result = db.prepare('UPDATE inbox SET read_at = coalesce(read_at, ?) WHERE notice_id = ? AND member_id = ?')
        .run(now(), route[1], member.id);
      requireThat(result.changes, 404, 'Aviso no encontrado.');
      return json(response, 200, {});
    }
    if (method === 'POST' && pathname === '/api/works') return json(response, 201, createWork(db, await inputFor(admins)));
    route = pathname.match(/^\/api\/works\/([\w-]+)\/scores$/);
    if (route && method === 'POST') {
      return json(response, 201, uploadPdf(db, member, await inputFor(admins, pdfLimit), { workId: route[1] }));
    }
    route = pathname.match(/^\/api\/files\/([\w-]+)(\/approve)?$/);
    if (route) {
      if (!route[2] && method === 'GET') return servePdf(db, member, route[1], response);
      if (route[2] && method === 'PUT') {
        await inputFor(directors);
        return json(response, 200, approveScore(db, member, route[1]));
      }
    }
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  return async (request, response, pathname) => {
    try {
      await handle(request, response, pathname);
    } catch (error) {
      if (error instanceof HttpError) return json(response, error.status, { error: error.message, code: error.code });
      console.error(error);
      if (!response.headersSent) return json(response, 500, { error: 'No se pudo completar la operación.' });
      response.destroy();
    }
  };
}
