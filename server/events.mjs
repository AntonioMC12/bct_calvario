import { randomUUID } from 'node:crypto';
import { transaction } from './data.mjs';
import { choice, integer, requireThat, text } from './http.mjs';
import { madridInstant } from '../src/time.js';

export const managers = ['admin', 'director'];
export const types = ['Ensayo', 'Actuación', 'Reunión', 'Procesión', 'Certamen', 'Concierto'];
const now = () => new Date().toISOString();

export async function audit(db, actor, action, target) {
  await db.prepare('INSERT INTO audit(actor_id, action, target, created_at) VALUES (?, ?, ?, ?)').run(actor, action, target, now());
}

export async function notify(db, title, message, event = null, author = null) {
  const id = randomUUID();
  return transaction(db, async () => {
    await db.prepare('INSERT INTO notices VALUES (?, ?, ?, ?, ?, ?)').run(id, title, message, now(), event, author);
    await db.prepare("INSERT INTO inbox(notice_id, member_id) SELECT ?, id FROM members WHERE status = 'active'").run(id);
    return id;
  });
}

export async function sendDueReminders(db, timestamp = now()) {
  const pending = await db.prepare(`
    SELECT id, title, meeting, location, version FROM events
    WHERE cancelled = 0 AND reminder_sent = 0 AND reminder_minutes IS NOT NULL
      AND starts > ? AND (unixepoch(starts) - reminder_minutes * 60) <= unixepoch(?)
  `).all(timestamp, timestamp);
  if (!pending.length) return;
  await transaction(db, async () => {
    const mark = db.prepare('UPDATE events SET reminder_sent = 1 WHERE id = ? AND version = ? AND reminder_sent = 0 AND cancelled = 0');
    for (const event of pending) {
      if ((await mark.run(event.id,event.version)).changes) {
        await notify(db, 'Recordatorio de evento', [event.title, event.meeting || event.location].filter(Boolean).join(' · '), event.id);
      }
    }
  });
}

export async function eventById(db, id) {
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  requireThat(event, 404, 'No se encuentra el evento.');
  return event;
}

export async function eventList(db, member) {
  return await db.prepare(`
    SELECT e.*, coalesce(i.value, 'unset') AS intention, coalesce(i.reason, '') AS reason,
      coalesce(i.version, 0) AS intention_version, coalesce(p.value,'unset') AS presence
    FROM events e
    LEFT JOIN intentions i ON i.event_id = e.id AND i.member_id = ?
    LEFT JOIN presence p ON p.event_id = e.id AND p.member_id = ?
    ORDER BY starts, id
  `).all(member.id, member.id);
}

export async function eventDetail(db, member, id) {
  const event = await eventById(db, id);
  const own = await db.prepare('SELECT value AS intention, reason, version AS intention_version FROM intentions WHERE event_id = ? AND member_id = ?')
    .get(id, member.id);
  const roster = await db.prepare(`
    SELECT m.id, m.name, m.instrument, m.voice, m.status = 'active' AS active, coalesce(i.value, 'unset') AS intention,
      CASE WHEN ? = 'director' THEN coalesce(p.value,'unset') END AS presence,
      CASE WHEN ? = 'director' THEN i.reason END AS reason,
      CASE WHEN ? = 'director' THEN coalesce(i.version, 0) END AS intention_version
    FROM members m
    LEFT JOIN intentions i ON i.member_id = m.id AND i.event_id = ?
    LEFT JOIN presence p ON p.member_id = m.id AND p.event_id = ?
    WHERE m.status = 'active' OR i.member_id IS NOT NULL OR p.member_id IS NOT NULL
    ORDER BY m.instrument, m.voice, m.name
  `).all(member.role, member.role, member.role, id, id);
  const attachments = await db.prepare('SELECT id, name, length(content) AS bytes FROM files WHERE event_id = ?').all(id);
  return { event: { ...event, intention: 'unset', reason: '', intention_version: 0, ...own }, roster, attachments };
}

export async function saveEvent(db, actor, input, id) {
  const title = text(input.title, 120, 'Título', true);
  const type = choice(input.type, types, 'Tipo');
  const starts = madridInstant(text(input.starts, 16, 'Inicio', true));
  const ends = madridInstant(text(input.ends, 16, 'Fin', true));
  requireThat(starts && ends, 422, 'Indica fechas y horas válidas y sin ambigüedad en la hora de Madrid.');
  requireThat(ends > starts, 422, 'El final aproximado debe ser posterior al inicio.');
  const location = text(input.location, 200, 'Lugar');
  const town = text(input.town, 120, 'Localidad');
  const meeting = text(input.meeting, 200, 'Punto de encuentro');
  const description = text(input.description, 3000, 'Descripción');
  const minutes = input.reminder_minutes == null ? null : integer(input.reminder_minutes, 1, 10080, 'Antelación');

  return transaction(db, async () => {
    if (!id) {
      id = randomUUID();
      await db.prepare(`
        INSERT INTO events(id, title, type, starts, ends, location, town, meeting, description, reminder_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title, type, starts, ends, location, town, meeting, description, minutes);
      await notify(db, 'Nueva convocatoria', title, id, actor.id);
      await audit(db, actor.id, 'event.create', id);
    } else {
      const event = await eventById(db, id);
      requireThat(!event.cancelled, 409, 'El evento está cancelado.');
      requireThat(input.version === event.version, 409, 'El evento cambió. Vuelve a abrirlo para editarlo.');
      const timeChanged = event.starts !== starts || event.ends !== ends;
      const reminderSent = event.starts === starts && event.reminder_minutes === minutes ? event.reminder_sent : 0;
      await db.prepare(`
        UPDATE events SET title = ?, type = ?, starts = ?, ends = ?, location = ?, town = ?, meeting = ?,
          description = ?, reminder_minutes = ?, reminder_sent = ?, version = version + 1 WHERE id = ?
      `).run(title, type, starts, ends, location, town, meeting, description, minutes, reminderSent, id);
      if (timeChanged) await notify(db, 'Cambio de horario', title + ' tiene un nuevo horario. Consulta la convocatoria.', id, actor.id);
      await audit(db, actor.id, 'event.update', id);
    }
    return await eventById(db, id);
  });
}

export async function cancelEvent(db, actor, id, version) {
  return transaction(db, async () => {
    const event = await eventById(db, id);
    if (event.cancelled) return event;
    requireThat(event.version === version, 409, 'El evento cambió. Revisa la convocatoria antes de cancelarla.');
    await db.prepare('UPDATE events SET cancelled = 1, version = version + 1 WHERE id = ?').run(id);
    await notify(db, 'Evento cancelado', event.title + ' ha sido cancelado.', id, actor.id);
    await audit(db, actor.id, 'event.cancel', id);
    return await eventById(db, id);
  });
}

export async function saveIntention(db, actor, eventId, memberId, input) {
  const correction = actor.id !== memberId;
  requireThat(!correction || actor.role === 'director', 403, 'Solo dirección puede corregir respuestas.');
  const value = choice(input.value, ['yes','no','unset'], 'Intención');
  const suppliedReason = value === 'no' ? text(input.reason, 500, 'Motivo') : '';
  const key = text(input.key, 80, 'Identificador de solicitud') || null;
  integer(input.version, 0, Number.MAX_SAFE_INTEGER, 'Versión');
  return transaction(db, async () => {
    const event = await eventById(db, eventId);
    const member = await db.prepare("SELECT id FROM members WHERE id = ? AND status = 'active'").get(memberId);
    requireThat(member, 404, 'El componente no está activo.');
    const current = await db.prepare('SELECT * FROM intentions WHERE event_id = ? AND member_id = ?').get(eventId, memberId);
    const version = current?.version ?? 0;
    const reason = correction ? (value === 'no' ? current?.reason ?? '' : '') : suppliedReason;
    if (key && current?.request_key === key && version === input.version + 1 &&
      current.updated_by === actor.id && current.value === value && current.reason === reason) {
      return { value, reason, version };
    }
    if (!correction) requireThat(!event.cancelled && event.starts > now(), 409,
      'La convocatoria ya ha empezado o está cancelada.', 'closed');
    requireThat(version === input.version, 409, 'La respuesta cambió desde otro dispositivo o por dirección.', 'conflict');
    if (current?.value === value && current.reason === reason) return { value, reason, version };
    await db.prepare(`
      INSERT INTO intentions VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id,member_id) DO UPDATE SET value = excluded.value, reason = excluded.reason,
        version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        request_key = excluded.request_key
    `).run(eventId, memberId, value, reason, version + 1, actor.id, now(), key);
    if (correction) await audit(db, actor.id, 'intention.correct', eventId + '/' + memberId);
    return { value, reason, version: version + 1 };
  });
}

export async function savePresence(db, actor, eventId, input) {
  return transaction(db, async () => {
    const event = await eventById(db, eventId);
    requireThat(!event.cancelled && event.starts <= now(), 409,
      'La lista de presencia se abre al empezar un evento sin cancelar.');
    requireThat(Array.isArray(input.rows) && input.rows.length <= 1000, 422, 'Lista de presencia no válida.');
    const member = db.prepare("SELECT id FROM members WHERE id = ? AND status = 'active'");
    const save = db.prepare(`
      INSERT INTO presence VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(event_id,member_id) DO UPDATE SET value = excluded.value,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `);
    for (const row of input.rows) {
      const id = text(row?.id, 64, 'Componente', true);
      const value = choice(row?.value, ['present','absent','unset'], 'Presencia');
      requireThat(await member.get(id), 404, 'El componente no está activo.');
      await save.run(eventId, id, value, actor.id, now());
    }
    if (input.rows.length) await audit(db, actor.id, 'presence.update', eventId);
    return { saved: input.rows.length };
  });
}

export function calendarFile(event) {
  const field = value => value.replaceAll('\\', '\\\\').replace(/\r\n|[\r\n]/g, '\\n').replace(/[;,]/g, '\\$&');
  const utc = iso => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calvario//Calendario//ES', 'BEGIN:VEVENT',
    'UID:' + event.id + '@calvario', 'DTSTAMP:' + utc(now()), 'DTSTART:' + utc(event.starts), 'DTEND:' + utc(event.ends),
    'SUMMARY:' + field(event.title), 'LOCATION:' + field([event.location, event.town].filter(Boolean).join(', ')),
    'DESCRIPTION:' + field(event.description), 'STATUS:' + (event.cancelled ? 'CANCELLED' : 'CONFIRMED'),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(line => {
    let output = '';
    let bytes = 0;
    for (const char of line) {
      const size = Buffer.byteLength(char);
      if (bytes + size > 75) {
        output += '\r\n ';
        bytes = 1;
      }
      bytes += size;
      output += char;
    }
    return output;
  }).join('\r\n') + '\r\n';
}
