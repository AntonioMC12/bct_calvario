import { readFileSync } from 'node:fs';
import pg from 'pg';
import { openDatabase } from './db.mjs';
import { postgresSchemaVersion } from './schema-version.mjs';
import { postgresStore, safeNumber, store } from './store.mjs';

export { postgresStore };

const adapters = new WeakMap();
const postgresMigrations = [
  '001-initial.sql', '002-roster-members.sql', '003-management-material-scores.sql', '004-event-roll-call.sql', '005-instrument-voices.sql', '006-material-requests.sql',
];

export function sqliteStore(database) {
  if (database.dialect === 'sqlite') return database;
  let adapter = adapters.get(database);
  if (adapter) return adapter;
  let queue = Promise.resolve();
  function exclusively(action) {
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  }
  adapter = store({
    dialect:'sqlite',
    execute(sql,params,method,client) {
      const perform = () => method === 'exec' ? database.exec(sql) : database.prepare(sql)[method](...params);
      return client ? perform() : exclusively(perform);
    },
    begin: action => exclusively(async () => {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await action(database);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }),
    close: () => exclusively(() => database.close()),
  });
  adapters.set(database,adapter);
  return adapter;
}

export function applicationStore(database) {
  return database.dialect ? database : sqliteStore(database);
}

export function transaction(database,action) {
  return applicationStore(database).transaction(action);
}

export function openSupabase(env = process.env) {
  let url;
  try {
    url = new URL(env.CALVARIO_DATABASE_URL || '');
  } catch {
    throw new Error('La URL de conexión de Supabase no es válida.');
  }
  if (!['postgres:','postgresql:'].includes(url.protocol) ||
      !/^(?:db\.[a-z0-9-]+\.supabase\.co|[a-z0-9-]+\.pooler\.supabase\.com)$/.test(url.hostname) ||
      url.port !== '5432' || !url.username || !url.password || url.pathname !== '/postgres' || url.search || url.hash) {
    throw new Error('Usa la conexión directa o Session pooler de Supabase en el puerto 5432, sin parámetros.');
  }
  if (!env.CALVARIO_DATABASE_CA) throw new Error('Indica el certificado de Supabase en CALVARIO_DATABASE_CA.');
  const pool = new pg.Pool({
    connectionString:url.href,
    ssl:{ ca:readFileSync(env.CALVARIO_DATABASE_CA,'utf8'),rejectUnauthorized:true },
    max:4,connectionTimeoutMillis:8000,idleTimeoutMillis:30000,
    types:{ getTypeParser: (oid,format) => oid === 20 && format !== 'binary' ? safeNumber : pg.types.getTypeParser(oid,format) },
  });
  pool.on('error',() => console.error('Se perdió una conexión inactiva a PostgreSQL.'));
  return postgresStore(pool);
}

export async function preparePostgres(db) {
  if (db.dialect !== 'postgres') throw new Error('La preparación requiere PostgreSQL.');
  await db.transaction(async () => {
    const existing = await db.prepare("SELECT to_regclass('calvario.schema_version') IS NOT NULL AS initialized").get();
    const version = existing.initialized ? await postgresVersion(db) : 0;
    for (const file of postgresMigrations.slice(version ?? postgresMigrations.length)) {
      const migration = readFileSync(new URL('postgres/' + file,import.meta.url),'utf8');
      await db.exec(migration);
    }
    await assertPostgres(db);
  });
}

async function postgresVersion(db) {
  const result = await db.prepare('SELECT version FROM calvario.schema_version WHERE singleton = 1').get();
  return result?.version;
}

async function assertPostgres(db) {
  if (await postgresVersion(db) !== postgresSchemaVersion) {
    throw new Error('Prepara la versión del esquema con npm run db:setup.');
  }
}

export async function openData(filename,{ demo = false, env = process.env } = {}) {
  if (!demo && (env.CALVARIO_DATABASE_URL || env.CALVARIO_DATABASE_CA)) {
    const db = openSupabase(env);
    try {
      await assertPostgres(db);
      return db;
    } catch (error) {
      await db.close();
      if (error.code === '42P01') throw new Error('Prepara el esquema de Supabase con npm run db:setup.');
      throw error;
    }
  }
  return sqliteStore(openDatabase(filename));
}
