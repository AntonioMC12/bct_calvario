import { openData, openSupabase, preparePostgres } from '../server/data.mjs';
import { importSqlite } from '../server/import-sqlite.mjs';

const [action,filename] = process.argv.slice(2);
if (!['setup','check','import'].includes(action) || (action === 'import' && !filename)) {
  throw new Error('Usa db:setup, db:check o db:import -- ruta/a/copia.sqlite.');
}
if (!process.env.CALVARIO_DATABASE_URL) throw new Error('Configura CALVARIO_DATABASE_URL para operar sobre Supabase.');
const db = action === 'setup' ? openSupabase() : await openData();
try {
  if (action === 'setup') {
    await preparePostgres(db);
    console.log('Esquema privado calvario preparado.');
  } else if (action === 'check') {
    console.log('Conexión a Supabase y versión del esquema verificadas.');
  } else {
    const counts = await importSqlite(db,filename);
    console.table(counts);
    console.log('Migración verificada. Las sesiones y suscripciones deben volver a iniciarse.');
  }
} finally {
  await db.close();
}
