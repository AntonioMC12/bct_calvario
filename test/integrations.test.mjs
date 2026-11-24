import assert from 'node:assert/strict';
import { randomBytes, createECDH } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createAppServer } from '../scripts/serve.mjs';
import { testStore } from '../scripts/test-store.mjs';
import { hashPassword } from '../server/security.mjs';
import { notify } from '../server/events.mjs';
import { configurePush, createPushWorker } from '../server/push.mjs';

const { db,close } = await testStore();
const password = 'Prueba-efimera-2';
const mail = [];
const claims = new Map();
const pair = createECDH('prime256v1');
pair.generateKeys();

const server = createAppServer(db,{
  google:{
    config:{ projectId:'calvario-test',authDomain:'calvario-test.firebaseapp.com',apiKey:'public-key',appId:'fixture' },
    verifyToken:async token => {
      if (!claims.has(token)) throw new Error('Firma incorrecta');
      return claims.get(token);
    },
  },
  push:{ publicKey:pair.getPublicKey().toString('base64url') },
  sendMail:async message => mail.push(message),
});
let origin;

function browser() {
  let session;
  return async (path,method = 'GET',body,headers = {}) => {
    const response = await fetch(origin + '/api' + path,{
      method, headers:{
        ...(session ? { cookie:session } : {}), ...(body ? { 'Content-Type':'application/json' } : {}), ...headers,
      }, body:body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.has('set-cookie')) session = response.headers.get('set-cookie').split(';')[0];
    return { status:response.status, data:await response.json() };
  };
}

function identity(key,email,extra) {
  claims.set(key,{
    uid:'firebase:' + key, auth_time:Math.floor(Date.now() / 1000), email, email_verified:true,
    firebase:{ sign_in_provider:'google.com',identities:{ 'google.com':['provider:' + key] } }, ...extra,
  });
  return key;
}

function google(client,idToken,mode = 'login',data = {},headers) {
  return client('/auth/google','POST',{ idToken,mode,...data },headers);
}

const signIn = (client,name) => client('/login','POST',{ email:name + '@test.invalid',password });

before(async () => {
  const hash = await hashPassword(password);
  for (const [id,role] of [['admin','admin'],['member','musician'],['another','musician'],['director','director']]) {
    await db.prepare(`
      INSERT INTO members(id,email,password,name,instrument,voice,role,status,created_at)
      VALUES (?, ?, ?, ?, 'Corneta', '', ?, 'active', ?)
    `).run(id,id + '@test.invalid',hash,id,role,new Date().toISOString());
  }
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await close();
});

test('Google requiere un token válido, alta completa y aprobación', async () => {
  const user = browser();
  assert.equal((await google(user,'firma-inválida')).status,401);
  const email = 'nuevo@gmail.com';
  assert.equal((await google(user,identity('unverified',email,{ email_verified:false }))).status,401);
  assert.equal((await google(user,identity('stale',email,{ auth_time:100 }))).status,401);
  const token = identity('new',email);
  assert.equal((await google(user,token)).data.code,'profile_required');
  assert.equal((await google(user,token,'register',{ name:'Nueva cuenta' })).status,422);
  assert.equal((await google(user,token,'register',{ name:'Nueva cuenta',instrument:'Corneta',role:'director' })).status,200);
  const { member } = (await user('/session')).data;
  assert.equal(member.status,'pending');
  assert.equal(member.needsEmailVerification,false);
  assert.equal((await user('/dashboard')).status,403);
  assert.equal((await user('/push')).status,403);
  const admin = browser();
  assert.equal((await signIn(admin,'admin')).status,200);
  assert.equal((await admin('/requests/' + member.id,'PUT',{ status:'active' })).status,200);
  assert.equal((await user('/dashboard')).data.member.role,'musician');
  assert.equal((await user('/account/forgot','POST',{ email })).status,202);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(mail,[]);
  assert.equal((await user('/login','POST',{ email,password })).status,401);
  assert.equal((await google(browser(),token)).status,200);
  await db.prepare("UPDATE members SET status='inactive' WHERE id = ?").run(member.id);
  assert.equal((await google(browser(),token)).status,403);
  assert.equal((await user('/dashboard')).status,403);
});

test('no fusiona por correo y la vinculación requiere contraseña, sesión y coincidencia', async () => {
  const token = identity('existing','member@test.invalid');
  const local = browser();
  assert.equal((await google(local,token)).data.code,'link_required');
  assert.equal((await signIn(local,'member')).status,200);
  const data = { password };
  assert.equal((await google(local,token,'link',data)).status,409);
  const headers = { 'x-calvario-account':'member' };
  assert.equal((await google(local,token,'link',{ password:'incorrecta' },headers)).status,401);
  assert.equal((await google(local,identity('mismatch','other@test.invalid'),'link',data,headers)).status,409);
  assert.equal((await google(local,token,'link',data,headers)).status,200);
  assert.equal((await local('/dashboard')).data.member.google_linked,1);
  const other = browser();
  assert.equal((await google(other,token)).status,200);
  assert.equal((await other('/dashboard')).data.member.id,'member');
  claims.set('damaged',{ ...claims.get(token), firebase:{ sign_in_provider:'google.com',identities:{ 'google.com':['different'] } } });
  assert.equal((await google(browser(),'damaged')).status,409);
});

test('las claves VAPID deben corresponder al mismo par', () => {
  const scalar = pair.getPrivateKey();
  const privateKey = Buffer.concat([Buffer.alloc(32 - scalar.length),scalar]).toString('base64url');
  const env = {
    CALVARIO_PUSH_PUBLIC_KEY:pair.getPublicKey().toString('base64url'),
    CALVARIO_PUSH_PRIVATE_KEY:privateKey,
    CALVARIO_PUSH_CONTACT:'mailto:prueba@example.invalid',
  };
  assert.equal(configurePush(env).publicKey,env.CALVARIO_PUSH_PUBLIC_KEY);
  assert.throws(() => configurePush({ ...env,CALVARIO_PUSH_PRIVATE_KEY:Buffer.alloc(32).toString('base64url') }),/par válido/);
});

test('Web Push protege las suscripciones, reintenta y conserva la lectura independiente', async () => {
  const one = browser();
  const two = browser();
  assert.equal((await signIn(one,'another')).status,200);
  assert.equal((await signIn(two,'director')).status,200);
  const keys = { p256dh:pair.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url') };
  const data = { endpoint:'https://fcm.googleapis.com/fcm/send/test-unique',keys };
  assert.equal((await one('/push','POST',{ ...data,endpoint:'https://127.0.0.1/send/test' })).status,422);
  const enrolled = await one('/push','POST',data);
  assert.equal(enrolled.status,200);
  assert.equal((await one('/push','POST',data)).data.id,enrolled.data.id);
  assert.equal((await two('/push','POST',{ ...data,keys:{ ...keys,auth:randomBytes(16).toString('base64url') } })).status,409);
  await two('/push','DELETE',{ endpoint:data.endpoint });
  assert.deepEqual((await one('/push')).data.bindings,[enrolled.data.id]);
  const notice = await notify(db,'Aviso privado','Texto privado');
  const sent = [];
  let offset = 0;
  let reply = 503;
  const worker = createPushWorker(db,async (subscription,payload) => {
    sent.push({ subscription,payload });
    if (reply) throw Object.assign(new Error('Simulado'),{ statusCode:reply });
  },{ now:() => Date.now() + offset });

  await Promise.all([worker.drain(),worker.drain()]);
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].payload,{ notice,binding:enrolled.data.id });
  await worker.drain();
  assert.equal(sent.length,1);
  offset = 61000;
  reply = 0;
  await worker.drain();
  assert.equal(sent.length,2);
  const inbox = (await one('/dashboard')).data.notices.find(item => item.id === notice);
  assert.equal(inbox.message,'Texto privado');
  assert.equal(inbox.read_at,null);

  reply = 410;
  await notify(db,'Siguiente','Se borra la suscripción caducada.');
  await worker.drain();
  assert.deepEqual((await one('/push')).data.bindings,[]);
  assert.equal((await one('/push','POST',data)).status,200);
  await notify(db,'Otro aviso','El logout cancela este trabajo.');
  await one('/logout','POST',{});
  assert.equal((await db.prepare('SELECT count(*) AS n FROM push_jobs').get()).n,0);
  assert.equal((await one('/push')).status,401);
});
