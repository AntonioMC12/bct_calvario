import { validateMusicalSelection } from './catalog-values.mjs';
import { randomUUID } from 'node:crypto';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { transaction } from './store.mjs';
import { audit } from './events.mjs';
import { choice, requireThat, text } from './http.mjs';
import { checkPassword, getMember, startSession, tokenHash } from './security.mjs';

export function configureGoogle(env = process.env) {
  const { CALVARIO_FIREBASE_PROJECT_ID:projectId, CALVARIO_FIREBASE_API_KEY:apiKey, CALVARIO_FIREBASE_APP_ID:appId } = env;
  if (!projectId && !apiKey && !appId) return null;
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId || '') ||
      !/^[a-zA-Z0-9_-]{20,80}$/.test(apiKey || '') ||
      !/^1:[0-9]+:web:[a-f0-9]+$/.test(appId || '')) {
    throw new Error('Revisa el ID de proyecto, la API key pública y el App ID de Firebase.');
  }
  if (env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('El emulador de Firebase Auth no se admite en esta instancia.');
  }
  const authDomain = projectId + '.firebaseapp.com';
  const credential = env.CALVARIO_FIREBASE_ADMIN_JSON ? cert(JSON.parse(env.CALVARIO_FIREBASE_ADMIN_JSON)) : applicationDefault();
  const auth = getAuth(initializeApp({ projectId, credential },'calvario'));
  return { config:{ projectId, apiKey, appId, authDomain }, verifyToken:token => auth.verifyIdToken(token,true) };
}

function verifiedIdentity(claims) {
  const time = Math.floor(Date.now() / 1000);
  const subject = claims?.firebase?.identities?.['google.com'];
  requireThat(claims?.firebase?.sign_in_provider === 'google.com' && claims.email_verified === true &&
    typeof claims.uid === 'string' && claims.uid.length > 0 && claims.uid.length <= 128 &&
    Number.isInteger(claims.auth_time) && claims.auth_time >= time - 300 && claims.auth_time <= time + 30 &&
    Array.isArray(subject) && subject.length === 1 && typeof subject[0] === 'string' &&
    subject[0].length > 0 && subject[0].length <= 255, 401, 'Vuelve a identificarte con una cuenta de Google verificada.');
  const email = (typeof claims.email === 'string' ? claims.email : '').trim().toLowerCase();
  requireThat(email.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email), 401,
    'Google no proporcionó una dirección de correo utilizable.');
  return { email, uid:claims.uid, subject:subject[0] };
}

async function linkedAccount(db, identity) {
  const rows = await db.prepare(`
    SELECT g.google_subject, g.firebase_uid, m.id, m.status
    FROM google_identities g JOIN members m ON m.id = g.member_id
    WHERE g.google_subject = ? OR g.firebase_uid = ?
  `).all(identity.subject,identity.uid);
  if (!rows.length) return null;
  requireThat(rows.length === 1 && rows[0].google_subject === identity.subject && rows[0].firebase_uid === identity.uid,
    409, 'La identidad de Google ha cambiado. Contacta con la banda para revisar la vinculación.');
  return rows[0];
}

async function recordIdentity(db, identity, id) {
  await db.prepare('INSERT INTO google_identities VALUES (?, ?, ?)').run(identity.subject,identity.uid,id);
  await audit(db,id,'access.link_google',id);
}

export async function authenticateWithGoogle(db, provider, request, input) {
  requireThat(provider, 404, 'El acceso con Google todavía no está configurado.');
  const mode = choice(input.mode,['login','register','link'],'Acción');
  const idToken = text(input.idToken,8192,'Credencial de Firebase',true);
  let actor, matchedPassword, session;
  if (mode === 'link') {
    actor = await getMember(db,request);
    requireThat(actor?.status === 'active' && actor.password_enabled, 403, 'Inicia sesión con tu cuenta de Calvario.');
    requireThat(request.headers['x-calvario-account'] === actor.id, 409, 'La cuenta activa ha cambiado.');
    requireThat(typeof input.password === 'string' && input.password.length > 0 && input.password.length <= 128, 422,
      'Confirma tu contraseña de Calvario.');
    const credentials = await db.prepare('SELECT password FROM members WHERE id = ?').get(actor.id);
    matchedPassword = credentials?.password;
    requireThat(matchedPassword,403,'Tu sesión ha cambiado.');
    requireThat(await checkPassword(input.password,matchedPassword),401,'La contraseña de Calvario es incorrecta.');
    session = tokenHash(request);
  } else {
    requireThat(!await getMember(db,request),409,'Cierra tu sesión antes de entrar con Google.');
  }
  let decoded;
  try {
    decoded = await provider.verifyToken(idToken);
  } catch {
    requireThat(false,401,'No se pudo verificar el acceso con Google. Vuelve a intentarlo.');
  }
  const identity = verifiedIdentity(decoded);
  return transaction(db, async () => {
    const linked = await linkedAccount(db,identity);
    if (mode === 'link') {
      const current = await db.prepare(`
        SELECT m.id, email, password FROM sessions s JOIN members m ON m.id = s.member_id
        WHERE s.token = ? AND s.expires > ? AND m.status = 'active' AND m.password_enabled = 1
      `).get(session,Date.now());
      requireThat(current?.id === actor.id && current.password === matchedPassword,403,'Tu sesión ha cambiado. Vuelve a entrar.');
      requireThat(current.email === identity.email,409,'El correo de Google debe coincidir con el de tu cuenta de Calvario.');
      requireThat(!linked || linked.id === actor.id,409,'Esta cuenta de Google ya tiene una vinculación.');
      if (!linked) {
        requireThat(!await db.prepare('SELECT 1 FROM google_identities WHERE member_id = ?').get(actor.id),
          409,'Tu cuenta de Calvario ya está vinculada con otra identidad de Google.');
        await recordIdentity(db,identity,actor.id);
      }
      return { linked:true };
    }
    requireThat(!await getMember(db,request),409,'La sesión ha cambiado. Cierra sesión y vuelve a intentarlo.');
    if (linked) {
      requireThat(['pending','active'].includes(linked.status),403,'La cuenta de Calvario no tiene acceso.');
      return { token:await startSession(db,linked.id,request.hosted) };
    }
    requireThat(!await db.prepare('SELECT 1 FROM members WHERE email = ?').get(identity.email),409,
      'Ya hay una cuenta con ese correo. Entra con tu contraseña y vincula Google desde Perfil.', 'link_required');
    requireThat(mode === 'register',409,'Completa los datos de tu solicitud.', 'profile_required');
    const name = text(input.name,120,'Nombre y apellidos',true);
    const instrument = text(input.instrument,80,'Instrumento',true);
    const voice = text(input.voice,80,'Voz');
    await validateMusicalSelection(db,instrument,voice);
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    await db.prepare(`
      INSERT INTO members(id,email,password,name,instrument,voice,created_at,email_verified_at,password_enabled)
      VALUES (?, ?, '', ?, ?, ?, ?, ?, 0)
    `).run(id,identity.email,name,instrument,voice,timestamp,timestamp);
    await recordIdentity(db,identity,id);
    return { token:await startSession(db,id,request.hosted) };
  });
}
