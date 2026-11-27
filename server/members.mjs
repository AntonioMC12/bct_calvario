import { validateMusicalSelection } from './catalog-values.mjs';
import { randomUUID } from 'node:crypto';
import { audit } from './events.mjs';
import { choice, requireThat, text } from './http.mjs';
import { transaction } from './store.mjs';

export async function reviewMember(db, actor, id, input) {
  const status = choice(input.status, ['active','rejected'], 'Resolución');
  const targetId = text(input.memberId, 64, 'Ficha existente');
  requireThat(!targetId || status === 'active', 422, 'Solo se puede vincular una solicitud al aprobarla.');
  return transaction(db, async () => {
    const pending = await db.prepare(`
      SELECT email, password, password_enabled, requires_email_verification, email_verified_at
      FROM members WHERE id = ? AND status = 'pending' AND role = 'musician'
    `).get(id);
    requireThat(pending, 409, 'La solicitud ya no está pendiente.');
    if (status === 'active') {
      requireThat(!pending.requires_email_verification || pending.email_verified_at, 409, 'El solicitante aún debe confirmar su correo.');
    }
    const timestamp = new Date().toISOString();
    if (targetId) {
      requireThat(pending.email_verified_at, 409, 'Para vincular la ficha hay que confirmar el correo de la solicitud.');
      const target = await db.prepare(`
        SELECT id FROM members WHERE id = ? AND email IS NULL AND status = 'active' AND role = 'musician'
      `).get(targetId);
      requireThat(target, 409, 'La ficha ya no está disponible para vincular.');
      await db.prepare('UPDATE sessions SET member_id = ? WHERE member_id = ?').run(targetId,id);
      await db.prepare('UPDATE google_identities SET member_id = ? WHERE member_id = ?').run(targetId,id);
      await db.prepare('UPDATE audit SET actor_id = ? WHERE actor_id = ?').run(targetId,id);
      await db.prepare('DELETE FROM members WHERE id = ?').run(id);
      await db.prepare(`
        UPDATE members SET email = ?, password = ?, password_enabled = ?, email_verified_at = ?, reviewed_at = ?, reviewed_by = ?
        WHERE id = ?
      `).run(pending.email,pending.password,pending.password_enabled,pending.email_verified_at,timestamp,actor.id,targetId);
      await audit(db, actor.id, 'access.link_member', targetId);
      return { status, id:targetId };
    }
    await db.prepare('UPDATE members SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
      .run(status,timestamp,actor.id,id);
    await audit(db, actor.id, 'access.' + status, id);
    return { status };
  });
}

export async function saveMember(db, actor, input, id = null) {
  const name = text(input.name, 120, 'Nombre y apellidos', true);
  const instrument = text(input.instrument, 80, 'Instrumento');
  const voice = text(input.voice, 80, 'Voz');

  return transaction(db, async () => {
    const previous = id ? await db.prepare("SELECT instrument,voice FROM members WHERE id = ? AND status = 'active' AND role = 'musician'").get(id) : null;
    if (id) requireThat(previous,404,'No se encuentra un músico activo.');
    if ((!previous || previous.instrument !== instrument || previous.voice !== voice) && (instrument || voice)) {
      await validateMusicalSelection(db,instrument,voice);
    }
    if (!id) {
      const memberId = randomUUID();
      await db.prepare(`
        INSERT INTO members(id, password, name, instrument, voice, status, created_at, password_enabled)
        VALUES (?, '', ?, ?, ?, 'active', ?, 0)
      `).run(memberId, name, instrument, voice, new Date().toISOString());
      await audit(db, actor.id, 'member.create', memberId);
      return { id:memberId };
    }
    const result = await db.prepare(`
      UPDATE members SET name = ?, instrument = ?, voice = ?
      WHERE id = ? AND status = 'active' AND role = 'musician'
    `).run(name, instrument, voice, id);
    requireThat(result.changes, 404, 'No se encuentra un músico activo.');
    await audit(db, actor.id, 'member.update', id);
    return { id };
  });
}

export async function deactivateMember(db, id, actorId = null) {
  return transaction(db, async () => {
    const result = await db.prepare(`
      UPDATE members SET status = 'inactive' WHERE id = ? AND status = 'active' AND role = 'musician'
    `).run(id);
    requireThat(result.changes, 404, 'No se encuentra un músico activo.');
    await db.prepare('DELETE FROM sessions WHERE member_id = ?').run(id);
    await db.prepare('DELETE FROM account_tokens WHERE member_id = ?').run(id);
    if (actorId) await audit(db, actorId, 'member.deactivate', id);
    return { id, status:'inactive' };
  });
}
