import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migrations = ['./schema.sql', './migrations/002-account-mail.sql', './migrations/003-integrations.sql',
  './migrations/004-roster-members.sql', './migrations/005-management-material-scores.sql'];

export function openDatabase(filename = process.env.CALVARIO_DB || 'data/calvario.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    // SQLite necesita desactivar las claves externas para reconstruir una tabla referenciada.
    db.exec('PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL');
    transaction(db, () => {
      const { user_version: version } = db.prepare('PRAGMA user_version').get();
      if (version > migrations.length) throw new Error('La base de datos pertenece a una versión posterior.');
      for (let index = version; index < migrations.length; index++) {
        db.exec(readFileSync(new URL(migrations[index], import.meta.url), 'utf8'));
        db.exec('PRAGMA user_version = ' + (index + 1));
      }
      if (version < migrations.length && db.prepare('PRAGMA foreign_key_check').get()) {
        throw new Error('La migración dejó relaciones no válidas.');
      }
    });
    db.exec('PRAGMA foreign_keys = ON');
  } catch (error) {
    db.close();
    throw error;
  }
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
