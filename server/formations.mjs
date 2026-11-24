import { randomUUID } from 'node:crypto';
import { transaction } from './data.mjs';
import { integer, requireThat, text } from './http.mjs';
import { audit, eventById } from './events.mjs';

export async function formation(db, eventId) {
  await eventById(db, eventId);
  const row = await db.prepare('SELECT columns, positions, version FROM formations WHERE event_id = ?').get(eventId);
  if (!row) return { columns: 4, positions: Array(12).fill(null), version: 0 };
  return { ...row, positions: JSON.parse(row.positions) };
}

export async function saveFormation(db, actor, eventId, input) {
  const columns = integer(input.columns, 1, 12, 'Columnas');
  const positions = input.positions;
  requireThat(Array.isArray(positions) && positions.length > 0 && positions.length <= 240 &&
    positions.length % columns === 0, 422, 'La cuadrícula debe tener filas completas y hasta 240 posiciones.');
  return transaction(db, async () => {
    const current = await formation(db, eventId);
    requireThat(current.version === input.version, 409, 'Otra sesión guardó una versión nueva. Reabre la formación.');
    const used = new Set();
    const isActive = db.prepare("SELECT 1 FROM members WHERE id = ? AND status = 'active'");
    const existing = new Set(current.positions);
    for (const id of positions) {
      if (id === null) continue;
      requireThat(typeof id === 'string' && (existing.has(id) || await isActive.get(id)),
        422, 'Alguno de los componentes no está disponible.');
      requireThat(!used.has(id), 422, 'Un componente solo puede ocupar una posición.');
      used.add(id);
    }
    requireThat(input.confirmRemoval === true || current.positions.every(id => !id || used.has(id)),
      409, 'Confirma la retirada de los componentes que ya no están en la cuadrícula.', 'removal');
    await db.prepare(`
      INSERT INTO formations VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET columns = excluded.columns,
        positions = excluded.positions, version = excluded.version
    `).run(eventId, columns, JSON.stringify(positions), current.version + 1);
    await audit(db, actor.id, 'formation.save', eventId);
    return await formation(db, eventId);
  });
}

export async function saveTemplate(db, eventId, input) {
  const current = await formation(db, eventId);
  requireThat(current.version > 0, 409, 'Guarda la formación antes de crear una plantilla.');
  const name = text(input.name, 100, 'Nombre', true);
  const result = await db.prepare('INSERT INTO templates VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .run(randomUUID(), name, current.columns, current.positions.length);
  requireThat(result.changes, 409, 'Ya existe una plantilla con ese nombre.');
  return { name };
}
