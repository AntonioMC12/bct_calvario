import { randomBytes } from 'node:crypto';
import { transaction } from './db.mjs';
import { audit } from './events.mjs';
import { requireThat } from './http.mjs';
import { digest, hashPassword } from './security.mjs';

const minute = 60000;
const lifetime = { verify: 24 * 60 * minute, reset: 30 * minute };

export function createAccountMail(db, sendMail, { now = Date.now } = {}) {
  function issue(member, purpose, origin) {
    const timestamp = now();
    const id = randomBytes(32).toString('base64url');
    const hash = digest(id);
    const created = transaction(db, () => {
      db.prepare('DELETE FROM account_tokens WHERE expires <= ?').run(timestamp);
      const count = db.prepare(`
        SELECT created FROM account_tokens WHERE member_id = ? AND purpose = ? ORDER BY created DESC LIMIT 1
      `).get(member.id, purpose);
      if (count && count.created > timestamp - 2 * minute) return false;
      db.prepare('INSERT INTO account_tokens VALUES (?, ?, ?, ?, ?)').run(hash, member.id, purpose, timestamp, timestamp + lifetime[purpose]);
      return true;
    });
    if (!created) return;
    const verification = purpose === 'verify';
    const link = new URL('/', origin);
    link.hash = (verification ? '/verificar/' : '/restablecer/') + id;
    const message = {
      to: member.email,
      subject: verification ? 'Confirma tu correo en Calvario' : 'Recupera el acceso a Calvario',
      text: (verification ? 'Confirma el correo de tu solicitud con este enlace. Caduca en 24 horas.' :
        'Elige una contraseña nueva con este enlace. Caduca en 30 minutos.') +
        '\n\n' + link.href + '\n\nSi no hiciste esta solicitud, puedes ignorar este mensaje.',
    };
    setImmediate(async () => {
      try {
        await sendMail(message);
      } catch {
        console.error('Calvario no pudo entregar un correo técnico.');
      }
    });
  }

  function lookup(token, purpose) {
    requireThat(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 422, 'El enlace es inválido o ha caducado.');
    const row = db.prepare(`
      SELECT m.id FROM account_tokens t JOIN members m ON m.id = t.member_id
      WHERE t.digest = ? AND t.purpose = ? AND t.expires > ? AND m.status IN ('active','pending')
    `).get(digest(token), purpose, now());
    requireThat(row, 422, 'El enlace es inválido o ha caducado.');
    return row.id;
  }

  function verify(token) {
    transaction(db, () => {
      const id = lookup(token, 'verify');
      db.prepare('UPDATE members SET email_verified_at = coalesce(email_verified_at, ?) WHERE id = ?')
        .run(new Date(now()).toISOString(), id);
      db.prepare("DELETE FROM account_tokens WHERE member_id = ? AND purpose = 'verify'").run(id);
      audit(db, id, 'access.verify_email', id);
    });
  }

  async function reset(token, newPassword) {
    lookup(token, 'reset');
    const hash = await hashPassword(newPassword);
    transaction(db, () => {
      const id = lookup(token, 'reset');
      db.prepare('UPDATE members SET password = ?, email_verified_at = coalesce(email_verified_at, ?) WHERE id = ?')
        .run(hash, new Date(now()).toISOString(), id);
      db.prepare('DELETE FROM account_tokens WHERE member_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE member_id = ?').run(id);
      audit(db, id, 'access.reset_password', id);
    });
  }

  return { issue, verify, reset };
}
