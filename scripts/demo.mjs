import { randomBytes, randomUUID } from 'node:crypto';
import { openData, transaction } from '../server/data.mjs';
import { digest, hashPassword } from '../server/security.mjs';
import { notify } from '../server/events.mjs';
import { madridInstant, localMinute } from '../src/time.js';
import { samplePdf } from './sample-pdf.mjs';
import { start } from './serve.mjs';

const filename = process.env.CALVARIO_DEMO_DB || 'data/demo.sqlite';
const supplied = process.env.CALVARIO_DEMO_PASSWORD;
if (supplied && (supplied.length < 12 || supplied.length > 128)) {
  throw new Error('CALVARIO_DEMO_PASSWORD debe tener entre 12 y 128 caracteres.');
}
const secret = supplied || randomBytes(12).toString('base64url');
const password = await hashPassword(secret);
const db = await openData(filename,{ demo:true });

async function seed() {
  const { total } = await db.prepare('SELECT count(*) AS total FROM members').get();
  if (total) return false;
  const time = new Date().toISOString();
  const members = [
    ['musico@demo.invalid','Antonio Muñoz','Corneta','Primera','musician','active'],
    ['administracion@demo.invalid','Carmen Ruiz','Corneta','Segunda','admin','active'],
    ['direccion@demo.invalid','Elena López','Trompeta','','director','active'],
    ['manuel@demo.invalid','Manuel Pérez','Percusión','','musician','active'],
    ['lucia@demo.invalid','Lucía Martín','Corneta','Primera','musician','pending'],
  ];
  const createMember = db.prepare(`
    INSERT INTO members(id,email,password,name,instrument,voice,role,status,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [email,name,instrument,voice,role,status] of members) {
    await createMember.run(randomUUID(),email,password,name,instrument,voice,role,status,time);
  }
  const createEvent = db.prepare(`
    INSERT INTO events(id,title,type,starts,ends,location,town,meeting,description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const schedule = [
    [-4,'Ensayo de sección','Ensayo','Local de ensayo','Trabajo por instrumentos.'],
    [1,'Ensayo general','Ensayo','Local de ensayo','Trae las partituras del repertorio.'],
    [3,'Ensayo de repertorio','Ensayo','Local de ensayo','Revisaremos el programa del concierto.'],
    [12,'Concierto de la banda','Concierto','Casa de la Cultura','Convocatoria para todos los componentes.'],
  ];
  for (const [days,title,type,location,description] of schedule) {
    const day = localMinute(Date.now() + days * 86400000).slice(0,10);
    const id = randomUUID();
    await createEvent.run(id,title,type,madridInstant(day + 'T20:00'),madridInstant(day + 'T22:00'),location,'Doña Mencía','',description);
    if (days === 1) await notify(db,'Próximo ensayo','Consulta la convocatoria del próximo ensayo general.',id);
  }
  await notify(db,'Partituras disponibles','Hay nuevas partituras de ejemplo en el repertorio.');
  const workId = randomUUID();
  const score = samplePdf();
  await db.prepare('INSERT INTO works VALUES (?, ?, ?, ?)').run(workId,'Luz de Calvario','A. Romero','Marcha');
  await db.prepare('INSERT INTO files VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1)')
    .run(randomUUID(),workId,'luz-de-calvario.pdf','Corneta','Primera',score,digest(score));
  return true;
}

const created = await transaction(db, seed);
if (!created && supplied) await transaction(db, async () => {
  await db.prepare("UPDATE members SET password = ? WHERE email IN ('musico@demo.invalid','administracion@demo.invalid','direccion@demo.invalid')")
    .run(password);
  await db.prepare(`
    DELETE FROM sessions WHERE member_id IN (
      SELECT id FROM members WHERE email IN ('musico@demo.invalid','administracion@demo.invalid','direccion@demo.invalid')
    )
  `).run();
});
await db.close();
if (created) {
  console.log('Cuentas de prueba: musico@demo.invalid, administracion@demo.invalid y direccion@demo.invalid');
  if (!supplied) console.log('Contraseña de esta instalación de prueba: ' + secret);
} else if (supplied) {
  console.log('Contraseña de las cuentas de prueba actualizada mediante CALVARIO_DEMO_PASSWORD.');
} else {
  console.log('Se reutiliza la base de demostración y sus cuentas existentes.');
}
await start(filename, { demo: true });
