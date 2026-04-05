import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema/index';

export function createLocalDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function createInMemoryDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}
