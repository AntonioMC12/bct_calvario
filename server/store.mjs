import { AsyncLocalStorage } from 'node:async_hooks';

const lockId = 741697124518;

export function store({ execute, begin, close, dialect }) {
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

function pgResult(result,method) {
  if (method === 'get') return result.rows[0];
  if (method === 'all') return result.rows;
  if (method === 'run') return { changes:result.rowCount };
}

export function postgresStore(pool, { transactionPool = false } = {}) {
  const initialized = new WeakSet();
  async function use(action) {
    const client = await pool.connect();
    try {
      if (!transactionPool && !initialized.has(client)) {
        await client.query('SET search_path TO calvario, pg_catalog');
        initialized.add(client);
      }
      return await action(client);
    } finally {
      client.release();
    }
  }
  async function inTransaction(action,lock) {
    return use(async client => {
      await client.query('BEGIN');
      try {
        if (transactionPool) await client.query('SET LOCAL search_path TO calvario, pg_catalog');
        if (lock) await client.query('SELECT pg_advisory_xact_lock($1::bigint)',[lockId]);
        const result = await action(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    });
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
      return client ? perform(client) : transactionPool ? inTransaction(perform,false) : use(perform);
    },
    begin: action => inTransaction(action,true),
    close: () => pool.end(),
  });
}

export function safeNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError('Entero de PostgreSQL fuera de rango.');
  return number;
}

export function transaction(database,action) {
  return database.transaction(action);
}
