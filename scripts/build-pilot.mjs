import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const pages = new URL(process.env.CALVARIO_SITE_URL ?? 'https://antoniomc12.github.io/bct_calvario/');
const edge = new URL(process.env.CALVARIO_EDGE_URL ?? '');
if (pages.protocol !== 'https:' || pages.search || pages.hash || pages.username || pages.password ||
    !pages.pathname.endsWith('/') || !/^(?:\/[a-zA-Z0-9_-]+)*\/$/.test(pages.pathname)) {
  throw new Error('CALVARIO_SITE_URL debe ser la URL HTTPS de la app terminada en /.');
}
if (edge.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(edge.hostname) ||
    edge.pathname !== '/functions/v1/calvario-api' || edge.search || edge.hash || edge.port || edge.username || edge.password) {
  throw new Error('CALVARIO_EDGE_URL debe identificar la función calvario-api del proyecto Supabase.');
}
const target = resolve(process.argv[2] || 'dist/pilot');
await mkdir(dirname(target),{ recursive:true });
await mkdir(target);

const siteDir = join(target,'pages');
const projectDir = join(target,'edge');
const functionsDir = join(projectDir,'supabase','functions');
const functionDir = join(functionsDir,'calvario-api');
const shared = join(functionsDir,'_shared');
await Promise.all([
  mkdir(join(siteDir,'src'),{ recursive:true }),
  mkdir(join(siteDir,'public'),{ recursive:true }),
  mkdir(functionDir,{ recursive:true }),
  mkdir(join(shared,'server'),{ recursive:true }),
  mkdir(join(shared,'src'),{ recursive:true }),
]);
const src = ['access.js','connection.js','events.js','google.js','main.js','management.js','push.js',
  'repertoire.js','report.js','roles.js','storage.js','styles.css','theme.js','time.js','ui.js'];
const assets = ['escudo.png','icon-192.png','icon-512.png','google-g.png','inter.woff2','cinzel.woff2',
  'inter-LICENSE.txt','cinzel-LICENSE.txt'];
const domain = ['account-mail','api','events','formations','google','http','music','push','security','store'];
const html = await readFile('index.html','utf8');
const csp = "default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; " +
  "style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; " +
  "frame-src https://*.firebaseapp.com https://apis.google.com https://accounts.google.com; " +
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseapp.com " + edge.origin;
const sql = await readFile('server/postgres/001-initial.sql','utf8');

await Promise.all([
  ...src.map(file => cp(join('src',file),join(siteDir,'src',file))),
  ...assets.map(file => cp(join('public',file),join(siteDir,'public',file))),
  ...['manifest.webmanifest','sw.js'].map(file => cp(file,join(siteDir,file))),
  ...domain.map(file => cp(join('server',file + '.mjs'),join(shared,'server',file + '.mjs'))),
  ...['index.mjs','handler.mjs','deno.json'].map(file => cp(join('deployment','edge',file),join(functionDir,file))),
  cp(join('deployment','edge','config.toml'),join(projectDir,'supabase','config.toml')),
  ...['roles.js','time.js'].map(file => cp(join('src',file),join(shared,'src',file))),
  writeFile(join(functionDir,'site.mjs'),'export const defaultSite = ' + JSON.stringify(pages.href) + ';\n'),
  writeFile(join(projectDir,'schema.sql'),'BEGIN;\nSELECT pg_advisory_xact_lock(741697124518);\n' + sql + '\nCOMMIT;\n'),
  writeFile(join(siteDir,'src','runtime.js'), 'export const apiBase = ' + JSON.stringify(edge.href + '/api') + ';\n'),
  writeFile(join(siteDir,'index.html'),html.replace('<head>','<head>\n    <meta http-equiv="Content-Security-Policy" content="' + csp + '">')),
  writeFile(join(siteDir,'.nojekyll'),''),
]);
const files = await readdir(siteDir);
console.log('Pages: ' + siteDir + ' · ' + files.length + ' entradas');
console.log('Supabase Functions: ' + projectDir);
