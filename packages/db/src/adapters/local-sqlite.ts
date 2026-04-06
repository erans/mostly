import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema/index';
import type { MostlyDb } from '../types.js';

export function createLocalDb(path: string): MostlyDb {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema }) as unknown as MostlyDb;
}

export function createInMemoryDb(): MostlyDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema }) as unknown as MostlyDb;
}
