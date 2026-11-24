import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');

export async function hashPassword(secret) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await derive(secret, salt, 64)).toString('hex');
}

export async function checkPassword(secret, hash) {
  const [salt, expected] = hash.split(':');
  const calculated = await derive(secret, salt, 64);
  return timingSafeEqual(calculated, Buffer.from(expected, 'hex'));
}

const LIFETIME = 7 * 86400;
const cookie = (value, secure) => 'calvario_session=' + value + '; HttpOnly; SameSite=Strict; Path=/' +
  (secure ? '; Secure' : '');
export const expiredCookie = secure => cookie('',secure) + '; Max-Age=0';

export function startSession(db, memberId, secure = false) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), memberId, Date.now() + LIFETIME * 1000);
  return cookie(token,secure) + '; Max-Age=' + LIFETIME;
}

export function tokenHash(request) {
  const match = request.headers.cookie?.match(/(?:^|;\s*)calvario_session=([0-9a-f]{64})(?:;|$)/);
  return match ? digest(match[1]) : '';
}

export function getMember(db, request) {
  return db.prepare(`
    SELECT m.id, email, name, instrument, voice, role, status, email_verified_at, requires_email_verification,
      password_enabled, EXISTS (SELECT 1 FROM google_identities g WHERE g.member_id = m.id) AS google_linked
    FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token = ? AND s.expires > ?
  `).get(tokenHash(request), Date.now());
}

export function endSession(db, request) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(request));
}
