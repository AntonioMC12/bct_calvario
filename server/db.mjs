import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(filename = process.env.CALVARIO_DB || 'data/calvario.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  transaction(db, () => {
    const { user_version: version } = db.prepare('PRAGMA user_version').get();
    if (version === 0) {
      db.exec(readFileSync(new URL('schema.sql', import.meta.url), 'utf8'));
      db.exec('PRAGMA user_version = 1');
    } else if (version !== 1) {
      throw new Error('La base de datos pertenece a una versión posterior.');
    }
  });
  return db;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
