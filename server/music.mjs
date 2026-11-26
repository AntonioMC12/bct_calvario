import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { pipeline } from 'node:stream/promises';
import { Zip, ZipPassThrough } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { digest } from './security.mjs';
import { requireThat, text } from './http.mjs';
import { audit, eventById } from './events.mjs';
import { canManage } from '../src/roles.js';
import { samePart } from '../src/parts.js';
import { transaction } from './store.mjs';

const archived = `CASE WHEN EXISTS (SELECT 1 FROM files newer WHERE newer.replaces_id = f.id AND newer.approved = 1)
  THEN 1 ELSE 0 END AS archived`;

const currentScore = file => file.approved && !file.archived;
const scoreAllowed = (file, member) => canManage(member.role) || (currentScore(file) && samePart(file, member));

export async function catalog(db, member) {
  const management = canManage(member.role);
  const scores = await db.prepare(`
    SELECT f.id, f.work_id, f.name, f.instrument, f.voice, f.approved, f.replaces_id, length(f.content) AS bytes, ${archived}
    FROM files f WHERE f.work_id IS NOT NULL AND (f.approved = 1 OR ? = 1)
    ORDER BY f.instrument, f.voice, f.name, f.id
  `).all(Number(management));
  const byWork = Map.groupBy(scores.filter(file => scoreAllowed(file,member)), file => file.work_id);
  const works = await db.prepare('SELECT * FROM works ORDER BY lower(title), title').all();
  return works
    .map(work => ({ ...work, scores: byWork.get(work.id) ?? [] }))
    .filter(work => work.scores.length || management);
}

export async function saveWork(db, input, id = null) {
  const fields = [text(input.title,150,'Título',true), text(input.authors,250,'Autoría',true), text(input.genre,80,'Género')];
  if (id) {
    const result = await db.prepare('UPDATE works SET title = ?, authors = ?, genre = ? WHERE id = ?').run(...fields,id);
    requireThat(result.changes,404,'Obra no encontrada.');
    return { id };
  }
  const created = randomUUID();
  await db.prepare('INSERT INTO works VALUES (?, ?, ?, ?)').run(created,...fields);
  return { id:created };
}

export async function uploadPdf(db, actor, input, { workId = null, eventId = null, replacesId = null }) {
  if (workId) requireThat(await db.prepare('SELECT 1 FROM works WHERE id = ?').get(workId), 404, 'Obra no encontrada.');
  const name = text(input.name, 180, 'Archivo', true);
  const instrument = workId ? text(input.instrument, 80, 'Instrumento', true) : '';
  const voice = workId ? text(input.voice, 80, 'Voz') : '';
  requireThat(name.toLowerCase().endsWith('.pdf') && typeof input.content === 'string' &&
    input.content.length <= 7_000_000, 422, 'Selecciona un PDF de hasta 5 MB.');
  const content = Buffer.from(input.content, 'base64');
  requireThat(content.length <= 5_242_880 && content.subarray(0, 5).toString() === '%PDF-' &&
    content.subarray(-1024).includes('%%EOF'), 422, 'El archivo no tiene una estructura PDF reconocible o supera 5 MB.');
  let pages;
  try {
    const pdf = await PDFDocument.load(content, { throwOnInvalidObject:true, updateMetadata:false });
    pages = pdf.getPageCount();
  } catch {
    requireThat(false, 422, 'El PDF está dañado o protegido. Sube un PDF que se pueda abrir.');
  }
  requireThat(pages > 0, 422, 'El PDF debe contener al menos una página.');
  const hash = digest(content);
  const id = randomUUID();
  return transaction(db, async () => {
    if (eventId) requireThat(!(await eventById(db, eventId)).cancelled, 409, 'El evento está cancelado.');
    let part = { instrument, voice };
    if (replacesId) {
      const previous = await db.prepare(`SELECT id, work_id, instrument, voice FROM files
        WHERE id = ? AND work_id IS NOT NULL AND approved = 1`).get(replacesId);
      requireThat(previous, 404, 'No se encuentra una partitura publicada con ese identificador.');
      requireThat(!await db.prepare('SELECT id FROM files WHERE replaces_id = ?').get(replacesId),
        409, 'Ya hay una nueva versión para esta partitura.');
      workId = previous.work_id;
      part = previous;
    }
    const result = await db.prepare(`
      INSERT INTO files(id,work_id,event_id,name,instrument,voice,content,digest,approved,replaces_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
    `).run(id,workId,eventId,name,part.instrument,part.voice,content,hash,eventId ? 1 : 0,replacesId);
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

export async function discardScore(db, actor, id) {
  return transaction(db, async () => {
    const result = await db.prepare('DELETE FROM files WHERE id = ? AND work_id IS NOT NULL AND approved = 0').run(id);
    requireThat(result.changes, 409, 'Solo se pueden descartar partituras pendientes de validación.');
    await audit(db,actor.id,'score.discard',id);
    return { id };
  });
}

export async function servePdf(db, member, id, response) {
  const file = await db.prepare(`SELECT f.*, ${archived} FROM files f WHERE f.id = ?`).get(id);
  requireThat(file && (file.work_id ? scoreAllowed(file,member) : file.approved || canManage(member.role)),
    404, 'Documento no encontrado.');
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/['()*]/g, c =>
      '%' + c.charCodeAt(0).toString(16)),
    'Cache-Control': 'no-store',
    'Content-Security-Policy': 'sandbox',
    'Content-Length': file.content.length,
  }).end(file.content);
}

function archiveName(file, index) {
  const name = file.name.replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu,'_').replace(/^[. ]+|[. ]+$/g,'');
  return String(index + 1).padStart(3,'0') + '-' + (name || 'partitura.pdf');
}

async function* zipScores(db, member, files) {
  const chunks = [];
  let zipError;
  const zip = new Zip((error, chunk) => {
    if (error) zipError = error;
    else chunks.push(chunk);
  });
  const read = db.prepare(`SELECT f.*, ${archived}, m.role, m.instrument AS member_instrument, m.voice AS member_voice
    FROM files f JOIN members m ON m.id = ? AND m.status = 'active' WHERE f.id = ?`);
  for (const [index,selected] of files.entries()) {
    const file = await read.get(member.id,selected.id);
    if (!file || !currentScore(file) || !scoreAllowed(file,{ role:file.role,instrument:file.member_instrument,voice:file.member_voice })) {
      throw new Error('Las partituras disponibles cambiaron durante la descarga.');
    }
    const entry = new ZipPassThrough(archiveName(file,index));
    zip.add(entry);
    entry.push(file.content,true);
    if (zipError) throw zipError;
    yield* chunks.splice(0);
  }
  zip.end();
  if (zipError) throw zipError;
  yield* chunks;
}

export async function exportScores(db, request, response, member, input) {
  const available = (await catalog(db,member)).flatMap(work => work.scores.filter(currentScore));
  let files = available;
  if (input.ids !== undefined) {
    requireThat(Array.isArray(input.ids) && input.ids.length > 0 && input.ids.length <= 5000 &&
      input.ids.every(id => typeof id === 'string' && /^[\w-]{1,64}$/.test(id)), 422, 'Selecciona partituras para descargar.');
    const ids = new Set(input.ids);
    files = available.filter(file => ids.has(file.id));
    requireThat(files.length === ids.size, 404, 'Alguna partitura seleccionada ya no está disponible.');
  }
  requireThat(files.length, 404, 'No hay partituras disponibles para descargar.');
  requireThat(files.length < 65535 && files.reduce((bytes,file) => bytes + file.bytes + 2048,0) < 2 ** 32,
    422, 'El lote supera el tamaño de un ZIP. Selecciona varios lotes.');
  const archive = zipScores(db,member,files);
  response.writeHead(200, {
    'Content-Type':'application/zip', 'Content-Disposition':'attachment; filename=calvario-partituras.zip',
    'Cache-Control':'no-store',
  });
  if (request.hosted) return response.end(ReadableStream.from(archive));
  await pipeline(archive,response);
}
