import { drizzle } from 'drizzle-orm/d1';
import type { AnyD1Database } from 'drizzle-orm/d1';
import * as schema from '../schema/index.js';
import type { MostlyDb } from '../types.js';

export function createD1Db(d1: AnyD1Database): MostlyDb {
  return drizzle(d1, { schema }) as unknown as MostlyDb;
}
