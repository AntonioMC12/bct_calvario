import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { openDatabase } from '../server/db.mjs';
import { postgresStore, preparePostgres, sqliteStore } from '../server/data.mjs';

export async function testStore(engine = process.env.CALVARIO_TEST_ENGINE) {
  if (engine !== 'postgres') {
    const db = sqliteStore(openDatabase(':memory:'));
    return { db, close:()=>db.close() };
  }
  const raw = await PGlite.create();
  const socket = new PGLiteSocketServer({ db:raw, host:'127.0.0.1',port:0 });
  await socket.start();
  const port = Number(socket.getServerConn().split(':').at(-1));
  const pool = new pg.Pool({
    host:'127.0.0.1',port,user:'postgres',database:'postgres',
    max:1,connectionTimeoutMillis:4000,
    types:{ getTypeParser:(oid,format) => oid === 20 && format !== 'binary' ? Number : pg.types.getTypeParser(oid,format) },
  });
  const db = postgresStore(pool);
  async function close() {
    await db.close();
    await socket.stop();
    await raw.close();
  }
  try {
    await preparePostgres(db);
    return { db,close };
  } catch (error) {
    await close();
    throw error;
  }
}
