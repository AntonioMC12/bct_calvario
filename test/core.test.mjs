import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { hashPassword } from '../server/security.mjs';
import { createAppServer } from '../scripts/serve.mjs';
import { samplePdf } from '../scripts/sample-pdf.mjs';
import { localMinute, madridInstant } from '../src/time.js';
import { sendDueReminders } from '../server/events.mjs';

const db = openDatabase(':memory:');
const server = createAppServer(db);
const secret = 'Prueba-efimera-a0';
let base, admin, director, musician, newcomer;
let event, future, previous, work;
const ids = {};

function client() {
  let cookie;
  return async (path, method = 'GET', body, headers = {}) => {
    const response = await fetch(base + '/api' + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const type = response.headers.get('content-type') || '';
    const data = type.startsWith('application/json') ? await response.json() : await response.text();
    return { status: response.status, type, data };
  };
}

before(async () => {
  const hash = await hashPassword(secret);
  const insert = db.prepare(`
    INSERT INTO members(id,email,password,name,instrument,voice,role,status,created_at)
    VALUES (?, ?, ?, ?, 'Corneta','Primera', ?, 'active', ?)
  `);
  for (const role of ['admin','director','musician']) {
    ids[role] = randomUUID();
    insert.run(ids[role],role + '@test.invalid',hash,'Cuenta ' + role,role,new Date().toISOString());
  }
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  [admin,director,musician,newcomer] = Array.from({ length:4 }, client);
  for (const [role,send] of Object.entries({ admin,director,musician })) {
    assert.equal((await send('/login','POST',{ email:role + '@test.invalid', password:secret })).status,200);
  }
  const time = offset => localMinute(Date.now() + offset * 86400000);
  future = { title:'Ensayo de prueba', type:'Ensayo', starts:time(1), ends:localMinute(Date.parse(madridInstant(time(1))) + 3600000),
    location:'Local, sala 1',town:'Doña Mencía',description:'Línea 1\nLínea 2' };
  previous = { ...future, title:'Ensayo pasado', starts:time(-1), ends:localMinute(Date.parse(madridInstant(time(-1))) + 3600000) };
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
});

test('alta pendiente, aprobación y bloqueo de contactos', async () => {
  const input = { email:'alta@test.invalid', password:secret, name:'Componente nuevo', instrument:'Corneta', voice:'Segunda' };
  assert.equal((await newcomer('/request-access','POST',input)).status,201);
  const { data: { member } } = await newcomer('/session');
  assert.equal(member.status,'pending');
  assert.equal((await newcomer('/dashboard')).status,403);
  assert.equal((await musician('/management')).status,403);
  assert.equal((await musician('/requests/' + member.id,'PUT',{ status:'active' })).status,403);
  assert.equal((await admin('/requests/' + member.id,'PUT',{ status:'active' })).status,200);
  assert.equal((await newcomer('/dashboard')).data.member.role,'musician');
});

test('gestión de eventos con validación, zona Madrid y avisos transaccionales', async () => {
  assert.equal(madridInstant('2026-03-29T02:30'),null);
  assert.equal(madridInstant('2026-10-25T02:30'),null);
  assert.equal((await musician('/events','POST',future)).status,403);
  assert.equal((await admin('/events','POST',future,{ origin:'https://otra.invalid' })).status,403);
  assert.equal((await admin('/events','POST',{ ...future, ends:future.starts })).status,422);
  const created = await admin('/events','POST',future);
  assert.equal(created.status,201);
  event = created.data;
  assert.equal(event.starts,madridInstant(future.starts));
  const notices = (await musician('/dashboard')).data.notices;
  assert.ok(notices.some(notice => notice.event_id === event.id && notice.title === 'Nueva convocatoria'));
  const ics = await musician('/events/' + event.id + '/calendar');
  assert.equal(ics.status,200);
  assert.match(ics.data,/DTSTART:\d{8}T\d{6}Z\r\n/);
  assert.ok(ics.data.includes('Local\\, sala 1'));
});

test('intención, reintento idempotente, corrección y privacidad', async () => {
  const path = '/events/' + event.id;
  const update = { value:'no', reason:'Prueba privada', version:0, key:randomUUID() };
  assert.equal((await musician(path + '/intention','PUT',update,{ 'x-calvario-account':ids.director })).status,409);
  const receipt = await musician(path + '/intention','PUT',update);
  assert.equal(receipt.status,200);
  assert.deepEqual((await musician(path + '/intention','PUT',update)).data,receipt.data);
  const roster = async send => (await send(path)).data.roster.find(row => row.id === ids.musician);
  assert.equal((await roster(admin)).reason,null);
  assert.equal((await roster(newcomer)).reason,null);
  assert.equal((await roster(director)).reason,update.reason);
  assert.equal('email' in await roster(director),false);
  const correction = path + '/intention/' + ids.musician;
  assert.equal((await admin(correction,'PUT',{ value:'yes', version:1 })).status,403);
  assert.equal((await director(correction,'PUT',{ value:'yes', version:1 })).status,200);
  assert.equal((await musician(path + '/intention','PUT',update)).data.code,'conflict');
  assert.equal((await roster(director)).intention,'yes');
});

test('presencia real independiente y cierre al inicio', async () => {
  const past = (await admin('/events','POST',previous)).data;
  const path = '/events/' + past.id;
  assert.equal((await musician(path + '/intention','PUT',{ value:'yes', version:0 })).data.code,'closed');
  const member = ids.musician;
  assert.equal((await director(path + '/intention/' + member,'PUT',{ value:'yes', version:0 })).status,200);
  const updates = { rows:[{ id:member, value:'absent' }] };
  assert.equal((await admin(path + '/presence','PUT',updates)).status,403);
  assert.equal((await director(path + '/presence','PUT',{ rows:[...updates.rows,{ id:ids.admin,value:'invalid' }] })).status,422);
  const history = async () => (await musician('/dashboard')).data.events.find(row => row.id === past.id);
  assert.equal((await history()).presence,'unset');
  assert.equal((await director(path + '/presence','PUT',updates)).status,200);
  assert.equal((await history()).intention,'yes');
  assert.equal((await history()).presence,'absent');
});

test('cambio de horario, cancelación, recordatorio y confirmación individual de lectura', async () => {
  const path = '/events/' + event.id;
  const edited = await admin(path,'PUT',{ ...future, ends:localMinute(Date.parse(event.ends) + 60000),
    version:event.version, reminder_minutes:120 });
  assert.equal(edited.status,200);
  const cancelled = await director(path + '/cancel','POST',{ version:edited.data.version });
  assert.equal(cancelled.status,200);
  assert.equal(cancelled.data.cancelled,1);
  sendDueReminders(db,new Date(Date.parse(event.starts) - 60000).toISOString());
  assert.equal((await musician(path + '/intention','PUT',{ value:'no',version:2 })).data.code,'closed');
  const notices = async send => (await send('/dashboard')).data.notices.filter(notice => notice.event_id === event.id);
  const inbox = await notices(musician);
  assert.ok(inbox.some(notice => notice.title === 'Cambio de horario'));
  assert.ok(!inbox.some(notice => notice.title === 'Recordatorio de evento'));
  const got = inbox.find(notice => notice.title === 'Evento cancelado');
  assert.equal(got.read_at,null);
  assert.equal((await musician('/notices/' + got.id + '/read','PUT',{})).status,200);
  assert.ok((await notices(musician)).find(notice => notice.id === got.id).read_at);
  assert.equal((await notices(admin)).find(notice => notice.id === got.id).read_at,null);
  assert.equal((await admin('/notices','POST',{ title:'Privado',message:'Mensaje' })).status,403);
  assert.equal((await director('/notices','POST',{ title:'Información',message:'Mensaje' })).status,201);
});

test('el recordatorio se recalcula y se emite una sola vez', async () => {
  const { data: created } = await admin('/events','POST',{ ...future, reminder_minutes:90 });
  const path = '/events/' + created.id;
  const originalTime = Date.parse(created.starts);
  const shifted = await director(path,'PUT',{
    ...future, starts:localMinute(originalTime + 7200000), ends:localMinute(originalTime + 10800000),
    version:created.version, reminder_minutes:90,
  });
  assert.equal(shifted.status,200);
  const reminders = async () => (await musician('/dashboard')).data.notices.filter(
    notice => notice.event_id === created.id && notice.title === 'Recordatorio de evento');
  sendDueReminders(db,new Date(originalTime - 1800000).toISOString());
  assert.equal((await reminders()).length,0);
  const eligible = new Date(Date.parse(shifted.data.starts) - 3600000).toISOString();
  sendDueReminders(db,eligible);
  sendDueReminders(db,eligible);
  assert.equal((await reminders()).length,1);
});

test('formación manual con versiones y retiro explícito', async () => {
  const path = '/events/' + event.id + '/formation';
  assert.equal((await director(path)).status,403);
  assert.equal((await musician(path)).status,403);
  const member = ids.musician;
  const formation = { columns:2, positions:[null,member], version:0 };
  assert.equal((await admin(path,'PUT',{ ...formation, positions:[member,member] })).status,422);
  assert.equal((await admin(path,'PUT',formation)).status,200);
  assert.equal((await admin(path,'PUT',formation)).status,409);
  assert.equal((await admin(path,'PUT',{ ...formation, positions:[null,null], version:1 })).data.code,'removal');
  assert.equal((await admin(path)).data.positions[1],member);
});

test('PDF privado, duplicados, validación por dirección y baja', async () => {
  work = (await admin('/works','POST',{ title:'Obra',authors:'Autor; Otra autora',genre:'Marcha' })).data;
  const path = '/works/' + work.id + '/scores';
  const input = { name:'partitura.pdf',instrument:'Corneta',voice:'Primera',content:samplePdf().toString('base64') };
  assert.equal((await director(path,'POST',input)).status,403);
  assert.equal((await admin(path,'POST',{ ...input,content:'AAAA' })).status,422);
  const uploaded = await admin(path,'POST',input);
  assert.equal(uploaded.status,201);
  assert.equal((await admin(path,'POST',input)).status,409);
  const file = '/files/' + uploaded.data.id;
  assert.equal((await client()(file)).status,401);
  assert.equal((await musician(file)).status,404);
  assert.equal((await admin(file + '/approve','PUT',{})).status,403);
  assert.equal((await director(file + '/approve','PUT',{})).status,200);
  assert.equal((await musician(file)).type,'application/pdf');
  db.prepare("UPDATE members SET status = 'inactive' WHERE id = ?").run(ids.musician);
  assert.equal((await musician(file)).status,403);
  assert.equal((await musician('/dashboard')).status,403);
});
