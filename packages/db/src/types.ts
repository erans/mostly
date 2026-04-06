import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema/index.js';

export type MostlyDb = BaseSQLiteDatabase<'async', any, typeof schema>;
