import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../server/db.mjs';
import { preparePostgres } from '../server/data.mjs';
import { importSqlite } from '../server/import-sqlite.mjs';
import { digest, hashPassword } from '../server/security.mjs';
import { createAppServer } from '../scripts/serve.mjs';
import { samplePdf } from '../scripts/sample-pdf.mjs';
import { testStore } from '../scripts/test-store.mjs';

test('Supabase usa un esquema privado y permite preparar el esquema dos veces', async () => {
  const { db,close } = await testStore('postgres');
  try {
    await preparePostgres(db);
    await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN');
    const { anonymous, authenticated, exposed } = await db.prepare(`
      SELECT has_schema_privilege('anon','calvario','usage') AS anonymous,
        has_schema_privilege('authenticated','calvario','usage') AS authenticated,
        to_regclass('public.members') IS NOT NULL AS exposed
    `).get();
    assert.deepEqual([anonymous,authenticated,exposed],[false,false,false]);
  } finally {
    await close();
  }
});

test('actualiza PostgreSQL 1 sin perder cuentas ni sus relaciones', async () => {
  const { db,close } = await testStore('postgres',{ prepare:false });
  try {
    const schema = await readFile(new URL('../server/postgres/001-initial.sql',import.meta.url),'utf8');
    await db.transaction(() => db.exec(schema));
    await db.exec(`
      INSERT INTO members(id,email,password,name,instrument,voice,status,created_at,role)
      VALUES ('legacy','anterior@example.invalid','clave-de-prueba','Miembro anterior','Corneta','','active','2026-11-23','admin');
      INSERT INTO sessions VALUES ('session-legacy','legacy',2000000000000);
    `);
    await preparePostgres(db);
    const legacy = await db.prepare('SELECT email, role FROM members JOIN sessions ON members.id = sessions.member_id').get();
    assert.equal(legacy.email,'anterior@example.invalid');
    assert.equal(legacy.role,'director');
    await db.exec(`
      INSERT INTO members(id,password,name,instrument,voice,status,created_at,password_enabled)
      VALUES ('roster','','Ficha','Corneta','','active','2026-11-23',0);
    `);
    assert.equal((await db.prepare("SELECT email FROM members WHERE id = 'roster'").get()).email,null);
  } finally {
    await close();
  }
});

test('importa SQLite con PDF, identidad e historial y deja fuera los accesos temporales', async () => {
  const folder = await mkdtemp(join(tmpdir(),'calvario-import-'));
  const filename = join(folder,'source.sqlite');
  const source = openDatabase(filename);
  const { db,close } = await testStore('postgres');
  const password = 'Demo-migracion-732';
  const now = new Date().toISOString();
  const score = samplePdf();
  let server;
  try {
    const user = source.prepare(`
      INSERT INTO members(id,email,password,name,instrument,voice,role,status,created_at)
      VALUES (?, ?, ?, ?, 'Corneta','', ?, 'active', ?)
    `);
    const hash = await hashPassword(password);
    user.run('musician','musico@example.invalid',hash,'Músico','musician',now);
    user.run('admin','admin@example.invalid',hash,'Dirección','director',now);
    source.prepare("UPDATE members SET reviewed_by = 'admin' WHERE id = 'musician'").run();
    source.prepare("INSERT INTO events(id,title,type,starts,ends,location,town,meeting,description) VALUES ('event','Ensayo','Ensayo',?,?,'','','','')")
      .run(now,new Date(Date.now() + 3600000).toISOString());
    source.prepare("INSERT INTO intentions VALUES ('event','musician','yes','',1,'musician',?,NULL)").run(now);
    source.prepare("INSERT INTO works VALUES ('score','Obra','Autor','Marcha')").run();
    source.prepare(`INSERT INTO files(id,work_id,name,instrument,voice,content,digest,approved)
      VALUES ('file','score','partitura.pdf','Corneta','',?,?,1)`).run(score,digest(score));
    source.prepare("INSERT INTO google_identities VALUES ('subject','firebase-uid','musician')").run();
    source.prepare("INSERT INTO audit VALUES (200,'admin','access.active','musician',?)").run(now);
    source.prepare("INSERT INTO sessions VALUES ('old-session','admin',?)").run(Date.now()+3600000);
    source.prepare("INSERT INTO account_tokens VALUES ('old-secret','admin','reset',?,?)").run(Date.now(),Date.now()+3600000);
    source.prepare("INSERT INTO push_subscriptions VALUES ('old-push','https://fcm.googleapis.com/test','a','b','old-session','admin')").run();
    source.prepare("INSERT INTO notices VALUES ('notice','Aviso','Texto',?,'event','admin')").run(now);
    source.prepare("INSERT INTO inbox VALUES ('notice','admin',NULL)").run();

    source.prepare("UPDATE files SET digest = 'incorrecto' WHERE id = 'file'").run();
    await assert.rejects(importSqlite(db,filename),/no coincide con su huella/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM members').get()).n,0);
    source.prepare("UPDATE files SET digest = ? WHERE id = 'file'").run(digest(score));

    const counts = await importSqlite(db,filename);
    assert.equal(counts.members,2);
    assert.equal(counts.files,1);
    assert.equal(counts.intentions,1);
    assert.equal((await db.prepare("SELECT reviewed_by FROM members WHERE id = 'musician'").get()).reviewed_by,'admin');
    assert.equal((await db.prepare("SELECT firebase_uid FROM google_identities WHERE member_id = 'musician'").get()).firebase_uid,'firebase-uid');
    assert.equal(source.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
    for (const table of ['sessions','account_tokens','push_subscriptions','push_jobs']) {
      assert.equal((await db.prepare('SELECT count(*) AS n FROM ' + table).get()).n,0);
    }
    await assert.rejects(importSqlite(db,filename),/debe estar vacío/);
    await db.prepare("INSERT INTO audit(actor_id,action,target,created_at) VALUES ('admin','test','musician',?)").run(now);
    assert.equal((await db.prepare('SELECT max(id) AS n FROM audit').get()).n,201);

    server = createAppServer(db,{ sendMail:async () => {} });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const login = await fetch(origin+'/api/login',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ email:'musico@example.invalid',password }),
    });
    assert.equal(login.status,200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const download = await fetch(origin+'/api/files/file',{ headers:{ cookie } });
    assert.equal(download.status,200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),score);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    source.close();
    await close();
    for (const suffix of ['','-wal','-shm']) await rm(filename + suffix,{ force:true });
    await rmdir(folder);
  }
});
