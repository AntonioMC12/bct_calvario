import { randomUUID } from 'node:crypto';
import { audit } from './events.mjs';
import { choice, integer, requireThat, text } from './http.mjs';
import { transaction } from './store.mjs';

export async function materialDirectory(db) {
  const [items, loans, members] = await Promise.all([
    db.prepare('SELECT * FROM material_items ORDER BY archived, name, code').all(),
    db.prepare(`
      SELECT l.id, l.item_id, l.member_id, m.name AS member_name, l.lent_at, l.returned_at
      FROM material_loans l JOIN members m ON m.id = l.member_id ORDER BY l.lent_at DESC, l.id
    `).all(),
    db.prepare("SELECT id, name, instrument FROM members WHERE status = 'active' ORDER BY name, id").all(),
  ]);
  return { items, loans, members };
}

async function checkVersion(db, id, input) {
  const item = await db.prepare('SELECT * FROM material_items WHERE id = ?').get(id);
  requireThat(item, 404, 'No se encuentra el material.');
  requireThat(item.version === input.version, 409, 'La ficha ha cambiado. Vuelve a abrirla.');
  return item;
}

export async function saveMaterial(db, actor, input, id) {
  const code = text(input.code, 40, 'Código', true).toUpperCase();
  const name = text(input.name, 120, 'Nombre', true);
  const category = text(input.category, 80, 'Categoría', true);
  const condition = choice(input.condition, ['usable','repair','unusable'], 'Estado');
  const notes = text(input.notes, 1200, 'Notas');
  return transaction(db, async () => {
    if (id) await checkVersion(db,id,input);
    requireThat(!await db.prepare('SELECT id FROM material_items WHERE code = ? AND id <> ?').get(code,id ?? ''),
      409, 'Ya existe material con ese código.');
    if (id) {
      await db.prepare(`
        UPDATE material_items SET code = ?, name = ?, category = ?, condition = ?, notes = ?, version = version + 1 WHERE id = ?
      `).run(code,name,category,condition,notes,id);
    } else {
      id = randomUUID();
      await db.prepare('INSERT INTO material_items(id,code,name,category,condition,notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id,code,name,category,condition,notes);
    }
    await audit(db,actor.id,'material.save',id);
    return { id };
  });
}

export async function changeMaterial(db, actor, id, action, input) {
  integer(input.version, 1, Number.MAX_SAFE_INTEGER, 'Versión');
  return transaction(db, async () => {
    const item = await checkVersion(db,id,input);
    const loan = await db.prepare('SELECT id FROM material_loans WHERE item_id = ? AND returned_at IS NULL').get(id);
    const timestamp = new Date().toISOString();
    if (action === 'loan') {
      const memberId = text(input.memberId, 64, 'Miembro', true);
      requireThat(!item.archived && item.condition === 'usable' && !loan, 409, 'El material no está disponible para préstamo.');
      requireThat(await db.prepare("SELECT id FROM members WHERE id = ? AND status = 'active'").get(memberId),
        422, 'Selecciona un miembro activo.');
      await db.prepare('INSERT INTO material_loans(id,item_id,member_id,lent_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(),id,memberId,timestamp);
    } else if (action === 'return') {
      requireThat(loan, 409, 'Este material no tiene un préstamo abierto.');
      await db.prepare('UPDATE material_loans SET returned_at = ? WHERE id = ?').run(timestamp,loan.id);
    } else {
      requireThat(!loan, 409, 'Registra la devolución antes de archivar el material.');
      await db.prepare('UPDATE material_items SET archived = ? WHERE id = ?').run(action === 'archive' ? 1 : 0,id);
    }
    await db.prepare('UPDATE material_items SET version = version + 1 WHERE id = ?').run(id);
    await audit(db,actor.id,'material.' + action,id);
    return { id };
  });
}
