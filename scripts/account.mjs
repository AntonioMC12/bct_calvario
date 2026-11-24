import { randomUUID } from 'node:crypto';
import { openData, transaction } from '../server/data.mjs';
import { hashPassword } from '../server/security.mjs';

const [action, rawEmail, role, name] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!['provision','deactivate'].includes(action) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Uso: npm run account -- provision correo admin|director "Nombre", o deactivate correo');
}
const db = await openData();
try {
  if (action === 'provision') {
    const secret = process.env.CALVARIO_PASSWORD;
    if (!['admin','director'].includes(role) || !name?.trim() || name.length > 120 || !secret || secret.length < 12 || secret.length > 128) {
      throw new Error('Indica un nombre, el perfil admin o director y CALVARIO_PASSWORD de 12 a 128 caracteres.');
    }
    const hash = await hashPassword(secret);
    await db.prepare(`
      INSERT INTO members(id,email,password,name,instrument,voice,role,status,created_at)
      VALUES (?, ?, ?, ?, '', '', ?, 'active', ?)
    `).run(randomUUID(),email,hash,name.trim(),role,new Date().toISOString());
    console.log('Cuenta de gestión creada.');
  } else {
    await transaction(db, async () => {
      const member = await db.prepare("SELECT id, role FROM members WHERE email = ? AND status = 'active'").get(email);
      if (!member) throw new Error('No se encuentra una membresía activa.');
      if (member.role !== 'musician') throw new Error('La retirada operativa se limita a miembros músicos.');
      await db.prepare("UPDATE members SET status = 'inactive' WHERE id = ?").run(member.id);
      await db.prepare('DELETE FROM sessions WHERE member_id = ?').run(member.id);
    });
    console.log('Acceso retirado. Se conserva el historial.');
  }
} finally {
  await db.close();
}
