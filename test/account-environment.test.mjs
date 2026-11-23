import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createAppServer } from '../scripts/serve.mjs';
import { openDatabase } from '../server/db.mjs';
import { createMail } from '../server/mail.mjs';

test('la migración conserva las membresías activas y las solicitudes de v1', async () => {
  const folder = await mkdtemp(join(tmpdir(),'calvario-migration-'));
  const filename = join(folder,'test.sqlite');
  let db;
  try {
    db = new DatabaseSync(filename);
    db.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
    db.exec('PRAGMA user_version = 1');
    const insert = db.prepare(`
      INSERT INTO members(id,email,password,name,instrument,voice,status,created_at)
      VALUES (?, ?, 'clave-de-prueba', ?, 'Corneta', '', ?, '2026-11-23')
    `);
    insert.run('a','a@ejemplo.invalid','Miembro','active');
    insert.run('b','b@ejemplo.invalid','Solicitante','pending');
    db.close();
    db = openDatabase(filename);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
    const rows = db.prepare('SELECT status, email_verified_at, requires_email_verification FROM members ORDER BY id').all();
    assert.deepEqual(rows.map(row => [row.status,row.email_verified_at,row.requires_email_verification]),
      [['active',null,0],['pending',null,0]]);
    assert.equal(db.prepare('SELECT count(*) AS total FROM account_tokens').get().total,0);
  } finally {
    if (db?.isOpen) db.close();
    for (const suffix of ['','-wal','-shm']) await rm(filename + suffix,{ force:true });
    await rmdir(folder);
  }
});

test('el proxy solo acepta el origen fijado y usa HTTPS en el enlace y la cookie', async () => {
  const db = openDatabase(':memory:');
  const messages = [];
  const publicOrigin = 'https://piloto.calvario.invalid';
  const server = createAppServer(db,{ publicOrigin, sendMail:async message => messages.push(message) });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port;
  const signup = JSON.stringify({
    email:'alta@ejemplo.invalid', name:'Cuenta ficticia', password:'Prueba-proxy-01', instrument:'Corneta',
  });

  function create(host, origin) {
    return new Promise((resolve,reject) => {
      const incoming = request({
        host:'127.0.0.1', port, method:'POST', path:'/api/request-access',
        headers:{ host, origin, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(signup) },
      }, response => {
        response.resume();
        response.on('end',() => resolve(response));
      });
      incoming.on('error',reject);
      incoming.end(signup);
    });
  }
  try {
    assert.equal((await create('otro.invalid',publicOrigin)).statusCode,421);
    assert.equal((await create('piloto.calvario.invalid','http://piloto.calvario.invalid')).statusCode,403);
    const approved = await create('piloto.calvario.invalid',publicOrigin);
    assert.equal(approved.statusCode,201);
    assert.match(approved.headers['set-cookie'][0],/; Secure;/);
    assert.match(messages[0].text,/https:\/\/piloto\.calvario\.invalid\/#\/verificar\//);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});

test('la demo mantiene el correo en un buzón local aunque haya SMTP configurado', async () => {
  const folder = await mkdtemp(join(tmpdir(),'calvario-mail-'));
  try {
    const send = createMail({
      demo:true,
      env:{ CALVARIO_MAILBOX:folder, CALVARIO_SMTP_URL:'valor-invalido-que-no-se-debe-cargar' },
    });
    await send({ to:'alta@ejemplo.invalid', subject:'Correo ficticio', text:'Contenido de prueba' });
    const [file] = await readdir(folder);
    assert.match(await readFile(join(folder,file),'utf8'),/Correo ficticio/);
  } finally {
    for (const file of await readdir(folder)) await rm(join(folder,file));
    await rmdir(folder);
  }
});
