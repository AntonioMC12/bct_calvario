import { randomUUID } from 'node:crypto';
import { audit } from './events.mjs';
import { choice, integer, requireThat, text } from './http.mjs';
import { transaction } from './store.mjs';

export async function materialDirectory(db) {
  const [items, loans, members, requests] = await Promise.all([
    db.prepare('SELECT * FROM material_items ORDER BY archived, name, code').all(),
    db.prepare(`
      SELECT l.id, l.item_id, l.member_id, m.name AS member_name, l.lent_at, l.returned_at
      FROM material_loans l JOIN members m ON m.id = l.member_id ORDER BY l.lent_at DESC, l.id
    `).all(),
    db.prepare("SELECT id, name, instrument FROM members WHERE status = 'active' ORDER BY name, id").all(),
    db.prepare(`
      SELECT r.*, m.name AS member_name, m.status AS member_status, i.name AS item_name, i.code AS item_code
      FROM material_requests r JOIN members m ON m.id = r.member_id JOIN material_items i ON i.id = r.item_id
      WHERE r.status = 'pending' ORDER BY r.created_at, r.id
    `).all(),
  ]);
  return { items, loans, members, requests };
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

export async function personalMaterial(db, actor) {
  const [items, requests, loans] = await Promise.all([
    db.prepare(`
      SELECT i.id, i.name, i.code, i.category FROM material_items i
      WHERE i.archived = 0 AND i.condition = 'usable'
        AND NOT EXISTS (SELECT 1 FROM material_loans l WHERE l.item_id = i.id AND l.returned_at IS NULL)
      ORDER BY i.name, i.code
    `).all(),
    db.prepare(`
      SELECT r.id, r.item_id, r.status, r.created_at, r.reviewed_at, i.name AS item_name, i.code AS item_code
      FROM material_requests r JOIN material_items i ON i.id = r.item_id
      WHERE r.member_id = ? ORDER BY r.created_at DESC, r.id
    `).all(actor.id),
    db.prepare(`
      SELECT l.id, l.item_id, l.lent_at, l.returned_at, i.name AS item_name, i.code AS item_code
      FROM material_loans l JOIN material_items i ON i.id = l.item_id
      WHERE l.member_id = ? ORDER BY l.lent_at DESC, l.id
    `).all(actor.id),
  ]);
  return { items, requests, loans };
}

async function availableForRequest(db, itemId) {
  const item = await db.prepare(`
    SELECT id FROM material_items WHERE id = ? AND archived = 0 AND condition = 'usable'
      AND NOT EXISTS (SELECT 1 FROM material_loans WHERE item_id = material_items.id AND returned_at IS NULL)
  `).get(itemId);
  requireThat(item,409,'Este material ya no está disponible. Actualiza el catálogo.');
}

export async function requestMaterial(db, actor, input) {
  const itemId = text(input.itemId,64,'Material',true);
  return transaction(db,async () => {
    await availableForRequest(db,itemId);
    requireThat(!await db.prepare("SELECT id FROM material_requests WHERE item_id = ? AND member_id = ? AND status = 'pending'")
      .get(itemId,actor.id),409,'Ya tienes una solicitud pendiente para este material.');
    const id = randomUUID();
    await db.prepare('INSERT INTO material_requests(id,item_id,member_id,created_at) VALUES (?, ?, ?, ?)')
      .run(id,itemId,actor.id,new Date().toISOString());
    await audit(db,actor.id,'material.request',id);
    return { id };
  });
}

export async function resolveMaterialRequest(db, actor, id, action) {
  return transaction(db,async () => {
    const request = await db.prepare('SELECT * FROM material_requests WHERE id = ?').get(id);
    requireThat(request && (action !== 'cancel' || request.member_id === actor.id),404,'No se encuentra la solicitud.');
    requireThat(request.status === 'pending',409,'La solicitud ya no está pendiente.');
    const timestamp = new Date().toISOString();
    if (action === 'approve') {
      requireThat(await db.prepare("SELECT id FROM members WHERE id = ? AND status = 'active'").get(request.member_id),
        409,'El solicitante ya no es un miembro activo.');
      const requested = await db.prepare('SELECT name,category FROM material_items WHERE id = ?').get(request.item_id);
      const unit = await db.prepare(`
        SELECT i.id FROM material_items i WHERE i.name = ? AND i.category = ? AND i.archived = 0 AND i.condition = 'usable'
          AND NOT EXISTS (SELECT 1 FROM material_loans l WHERE l.item_id = i.id AND l.returned_at IS NULL)
        ORDER BY CASE WHEN i.id = ? THEN 0 ELSE 1 END, i.code LIMIT 1
      `).get(requested.name,requested.category,request.item_id);
      requireThat(unit,409,'Este material ya no está disponible. Actualiza el catálogo.');
      await db.prepare("UPDATE material_requests SET item_id = ?, status = 'approved' WHERE id = ?").run(unit.id,id);
      await db.prepare('INSERT INTO material_loans(id,item_id,member_id,lent_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(),unit.id,request.member_id,timestamp);
      await db.prepare('UPDATE material_items SET version = version + 1 WHERE id = ?').run(unit.id);
      await db.prepare(`
        UPDATE material_requests SET status = 'rejected', reviewed_at = ?, reviewed_by = ?
        WHERE item_id IN (SELECT id FROM material_items WHERE name = ? AND category = ?) AND status = 'pending' AND id <> ?
          AND NOT EXISTS (
            SELECT 1 FROM material_items i WHERE i.name = ? AND i.category = ? AND i.archived = 0 AND i.condition = 'usable'
              AND NOT EXISTS (SELECT 1 FROM material_loans l WHERE l.item_id = i.id AND l.returned_at IS NULL)
          )
      `).run(timestamp,actor.id,requested.name,requested.category,id,requested.name,requested.category);
    }
    const status = { approve:'approved',reject:'rejected',cancel:'cancelled' }[action];
    requireThat(status,422,'Acción no válida.');
    await db.prepare('UPDATE material_requests SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
      .run(status,timestamp,actor.id,id);
    await audit(db,actor.id,'material.request.' + status,id);
    return { id,status };
  });
}
