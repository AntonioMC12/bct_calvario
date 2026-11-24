import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { testStore } from '../scripts/test-store.mjs';
import { hashPassword } from '../server/security.mjs';

const site = 'https://antoniomc12.github.io/bct_calvario/';
const origin = new URL(site).origin;
const edge = 'https://vsmmpccqaywetuiyhevm.supabase.co/functions/v1/calvario-api';

test('Pages solo publica recursos estáticos y la API Edge conserva la autorización', async () => {
  const dist = resolve('dist');
  await mkdir(dist,{ recursive:true });
  const directory = await mkdtemp(join(dist,'pilot-test-'));
  const target = join(directory,'out');
  const { db,close } = await testStore('postgres',{ transactionPool:true });
  try {
    execFileSync(process.execPath,['scripts/build-pilot.mjs',target],{
      env:{ ...process.env,CALVARIO_EDGE_URL:edge,CALVARIO_SITE_URL:site },
    });
    assert.deepEqual((await readdir(join(target,'pages'))).sort(),
      ['.nojekyll','index.html','manifest.webmanifest','public','src','sw.js']);
    assert.match(await readFile(join(target,'pages','index.html'),'utf8'),/src="\.\/src\/main\.js"/);
    assert.match(await readFile(join(target,'pages','index.html'),'utf8'),/connect-src [^"]+vsmmpccqaywetuiyhevm\.supabase\.co/);
    const { createEdgeHandler } = await import(pathToFileURL(join(target,'edge','supabase','functions','calvario-api','handler.mjs')));
    const mailbox = [];
    const handler = createEdgeHandler(db,{ site,sendMail: async message => mailbox.push(message),background:action => action() });
    const password = 'Prueba-privada-piloto';
    await db.prepare(`
      INSERT INTO members(id,email,password,name,instrument,voice,role,status,created_at)
      VALUES ('test','test@example.invalid',?,'Prueba','Corneta','','musician','active',?)
    `).run(await hashPassword(password),new Date().toISOString());

    function request(path,method = 'GET',body,session,allowedOrigin = origin) {
      return handler(new Request(edge + path,{
        method,
        headers:{
          Origin:allowedOrigin,
          ...(body ? { 'Content-Type':'application/json' } : {}),
          ...(session ? { 'X-Calvario-Session':session } : {}),
        },
        body:body ? JSON.stringify(body) : undefined,
      }));
    }

    assert.equal((await request('/health')).status,200);
    const preflight = await request('/api/login','OPTIONS');
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
    assert.equal((await request('/api/session','GET',null,null,'https://otro.invalid')).status,403);
    assert.equal((await request('/api/dashboard')).status,401);
    const login = await request('/api/login','POST',{ email:'test@example.invalid',password });
    assert.equal(login.status,200);
    assert.equal(login.headers.has('set-cookie'),false);
    const { sessionToken } = await login.json();
    assert.match(sessionToken,/^[a-f0-9]{64}$/);
    const data = await request('/api/dashboard','GET',null,sessionToken);
    assert.equal(data.status,200);
    assert.equal((await data.json()).member.id,'test');
    assert.equal((await request('/api/account/forgot','POST',{ email:'test@example.invalid' })).status,202);
    assert.match(mailbox[0].text,/https:\/\/antoniomc12\.github\.io\/bct_calvario\/#\/restablecer\//);
    assert.equal((await request('/api/logout','POST',{},sessionToken)).status,200);
    assert.equal((await request('/api/dashboard','GET',null,sessionToken)).status,401);
  } finally {
    await close();
    await rm(directory,{ recursive:true,force:true });
  }
});
