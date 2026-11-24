import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { openDatabase } from './db.mjs';

const adapters = new WeakMap();
const lockId = 741697124518;
const dbVersion = 1;

function store({ execute, begin, close, dialect }) {
  const scope = new AsyncLocalStorage();
  const query = (sql,params,method) => {
    const active = scope.getStore();
    return execute(sql,params,method,active?.open ? active.client : undefined);
  };
  return {
    dialect, close,
    prepare(sql) {
      return {
        get: (...args) => query(sql,args,'get'),
        all: (...args) => query(sql,args,'all'),
        run: (...args) => query(sql,args,'run'),
      };
    },
    exec: sql => query(sql,[],'exec'),
    transaction(action) {
      if (scope.getStore()?.open) return action();
      return begin(async client => {
        const current = { client,open:true };
        try {
          return await scope.run(current,action);
        } finally {
          current.open = false;
        }
      });
    },
  };
}

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

function pgResult(result,method) {
  if (method === 'get') return result.rows[0];
  if (method === 'all') return result.rows;
  if (method === 'run') return { changes:result.rowCount };
}

export function postgresStore(pool) {
  const initialized = new WeakSet();
  async function use(action) {
    const client = await pool.connect();
    try {
      if (!initialized.has(client)) {
        await client.query('SET search_path TO calvario, pg_catalog');
        initialized.add(client);
      }
      return await action(client);
    } finally {
      client.release();
    }
  }
  return store({
    dialect:'postgres',
    async execute(sql,params,method,client) {
      if (method !== 'exec') {
        // Las consultas de la aplicación usan ? solamente para parámetros escalares.
        let index = 0;
        sql = sql.replace(/\?/g,() => '$' + ++index);
        if (index !== params.length) throw new Error('Número incorrecto de parámetros SQL.');
      }
      const perform = async connection => {
        const result = await connection.query(sql,params);
        return pgResult(result,method);
      };
      return client ? perform(client) : use(perform);
    },
    begin: action => use(async client => {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)',[lockId]);
        const result = await action(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }),
    close: () => pool.end(),
  });
}

function safeNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError('Entero de PostgreSQL fuera de rango.');
  return number;
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
    if (!existing.initialized) {
      const schema = readFileSync(new URL('postgres/001-initial.sql',import.meta.url),'utf8');
      await db.exec(schema);
    }
    await assertPostgres(db);
  });
}

async function assertPostgres(db) {
  const result = await db.prepare('SELECT version FROM calvario.schema_version WHERE singleton = 1').get();
  if (result?.version !== dbVersion) throw new Error('Prepara la versión del esquema con npm run db:setup.');
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
