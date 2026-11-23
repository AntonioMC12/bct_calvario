import { randomUUID } from 'node:crypto';
import { access, link, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { digest } from '../server/security.mjs';

const [, , output] = process.argv;
if (!output?.toLowerCase().endsWith('.sqlite')) throw new Error('Uso: npm run backup -- data/copias/calvario.sqlite');
const target = resolve(output);
const temporary = target + '.' + randomUUID() + '.tmp';
const filename = resolve(process.env.CALVARIO_DB || 'data/calvario.sqlite');
await access(filename);
await mkdir(dirname(target), { recursive: true });
const source = new DatabaseSync(filename, { readOnly: true });
try {
  await backup(source, temporary);
  const snapshot = new DatabaseSync(temporary);
  try {
    snapshot.exec('PRAGMA journal_mode = DELETE; DELETE FROM sessions');
    const tokens = snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account_tokens'").get();
    if (tokens) snapshot.exec('DELETE FROM account_tokens');
    const integrity = snapshot.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('La copia tiene errores de integridad.');
    if (snapshot.prepare('PRAGMA foreign_key_check').get()) throw new Error('La copia contiene relaciones no válidas.');
    for (const file of snapshot.prepare('SELECT digest, content FROM files').iterate()) {
      if (digest(file.content) !== file.digest) throw new Error('Uno de los PDF no coincide con su huella.');
    }
  } finally {
    snapshot.close();
  }
  await link(temporary, target);
  console.log('Copia verificada en ' + target + '. Las sesiones deben iniciarse de nuevo.');
} finally {
  source.close();
  await rm(temporary, { force: true });
}
