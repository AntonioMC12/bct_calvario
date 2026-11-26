import { DatabaseSync } from 'node:sqlite';
import { digest } from './security.mjs';

const newTables = ['material_items','material_loans','catalog_values'];
const tables = ['members','events','intentions','presence','notices','inbox','formations','templates',
  'works','files','google_identities','audit',...newTables];
const sessionTables = ['sessions','account_tokens','push_subscriptions','push_jobs'];

function columns(statement) {
  const names = statement.columns().map(column => column.name);
  if (!names.length || names.some(name => !/^[a-z_][a-z_0-9]*$/.test(name))) {
    throw new Error('La estructura de la copia SQLite no es la esperada.');
  }
  return names;
}

export async function importSqlite(destination,filename) {
  if (destination.dialect !== 'postgres') throw new Error('La migración requiere un destino PostgreSQL.');
  const source = new DatabaseSync(filename,{ readOnly:true });
  try {
    source.exec('BEGIN');
    const { user_version: version } = source.prepare('PRAGMA user_version').get();
    if (![3,4,5].includes(version)) {
      throw new Error('Usa una copia de SQLite con la versión de esquema 3, 4 o 5.');
    }
    if (source.prepare('PRAGMA foreign_key_check').get()) throw new Error('La copia SQLite contiene relaciones no válidas.');
    return await destination.transaction(async () => {
      // Impide escrituras concurrentes incluso desde otro cliente SQL mientras se importa.
      await destination.exec('LOCK TABLE ' + [...tables,...sessionTables].join(', ') + ' IN SHARE ROW EXCLUSIVE MODE');
      for (const table of [...tables,...sessionTables]) {
        if (await destination.prepare('SELECT 1 FROM ' + table + ' LIMIT 1').get()) {
          throw new Error('El esquema de destino debe estar vacío. No se ha sobrescrito ningún dato.');
        }
      }
      await destination.exec('SET CONSTRAINTS ALL DEFERRED');
      const counts = {};
      for (const table of tables) {
        if (version < 5 && newTables.includes(table)) continue;
        const select = source.prepare('SELECT * FROM ' + table);
        const names = columns(select);
        const insert = destination.prepare('INSERT INTO ' + table + '(' + names.join(', ') + ') VALUES (' +
          names.map(() => '?').join(', ') + ')');
        counts[table] = 0;
        for (const row of select.iterate()) {
          if (table === 'members' && row.role === 'admin') row.role = 'director';
          if (table === 'files') {
            if (digest(row.content) !== row.digest) throw new Error('Un PDF de origen no coincide con su huella.');
            row.content = Buffer.from(row.content);
          }
          await insert.run(...names.map(name => row[name]));
          counts[table]++;
        }
        const { total } = await destination.prepare('SELECT count(*) AS total FROM ' + table).get();
        if (total !== counts[table]) throw new Error('El recuento de ' + table + ' no coincide.');
      }
      if (await destination.prepare("SELECT id FROM files WHERE encode(sha256(content), 'hex') <> digest LIMIT 1").get()) {
        throw new Error('Un PDF del destino no coincide con su huella.');
      }
      await destination.prepare(
        "SELECT setval(pg_get_serial_sequence('calvario.audit','id'), coalesce(max(id), 1), count(*) > 0) FROM audit"
      ).get();
      return counts;
    });
  } finally {
    source.close();
  }
}
