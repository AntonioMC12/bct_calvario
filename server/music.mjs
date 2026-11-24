import { randomUUID } from 'node:crypto';
import { digest } from './security.mjs';
import { requireThat, text } from './http.mjs';
import { audit, eventById } from './events.mjs';
import { transaction } from './data.mjs';

export async function catalog(db, member) {
  const scores = await db.prepare(`
    SELECT id, work_id, name, instrument, voice, approved, length(content) AS bytes
    FROM files WHERE work_id IS NOT NULL AND (approved = 1 OR ? IN ('admin','director'))
    ORDER BY instrument, voice, name
  `).all(member.role);
  const byWork = Map.groupBy(scores, file => file.work_id);
  const works = await db.prepare('SELECT * FROM works ORDER BY lower(title), title').all();
  return works
    .map(work => ({ ...work, scores: byWork.get(work.id) ?? [] }))
    .filter(work => work.scores.length || member.role === 'admin');
}

export async function createWork(db, input) {
  const id = randomUUID();
  await db.prepare('INSERT INTO works VALUES (?, ?, ?, ?)').run(id,
    text(input.title, 150, 'Título', true), text(input.authors, 250, 'Autoría', true), text(input.genre, 80, 'Género'));
  return { id };
}

export async function uploadPdf(db, actor, input, { workId = null, eventId = null }) {
  if (workId) requireThat(await db.prepare('SELECT 1 FROM works WHERE id = ?').get(workId), 404, 'Obra no encontrada.');
  const name = text(input.name, 180, 'Archivo', true);
  const instrument = workId ? text(input.instrument, 80, 'Instrumento', true) : '';
  const voice = workId ? text(input.voice, 80, 'Voz') : '';
  requireThat(name.toLowerCase().endsWith('.pdf') && typeof input.content === 'string' &&
    input.content.length <= 7_000_000, 422, 'Selecciona un PDF de hasta 5 MB.');
  const content = Buffer.from(input.content, 'base64');
  requireThat(content.length <= 5_242_880 && content.subarray(0, 5).toString() === '%PDF-' &&
    content.subarray(-1024).includes('%%EOF'), 422, 'El archivo no tiene una estructura PDF reconocible o supera 5 MB.');
  const hash = digest(content);
  const id = randomUUID();
  return transaction(db, async () => {
    if (eventId) requireThat(!(await eventById(db, eventId)).cancelled, 409, 'El evento está cancelado.');
    const result = await db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .run(id, workId, eventId, name, instrument, voice, content, hash, eventId ? 1 : 0);
    requireThat(result.changes, 409, 'Ya existe ese PDF con la misma asignación.');
    await audit(db, actor.id, 'file.upload', id);
    return { id };
  });
}

export async function approveScore(db, actor, id) {
  return transaction(db, async () => {
    const result = await db.prepare('UPDATE files SET approved = 1 WHERE id = ? AND work_id IS NOT NULL').run(id);
    requireThat(result.changes, 404, 'Partitura no encontrada.');
    await audit(db, actor.id, 'score.approve', id);
    return { id };
  });
}

export async function servePdf(db, member, id, response) {
  const file = await db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  requireThat(file && (file.approved || ['admin','director'].includes(member.role)), 404, 'Documento no encontrado.');
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/['()*]/g, c =>
      '%' + c.charCodeAt(0).toString(16)),
    'Cache-Control': 'no-store',
    'Content-Security-Policy': 'sandbox',
    'Content-Length': file.content.length,
  }).end(file.content);
}
