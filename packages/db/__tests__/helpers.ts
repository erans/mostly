import { createInMemoryDb } from '../src/adapters/local-sqlite';
import { runMigrations } from '../src/migrate';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createTestDb() {
  const db = createInMemoryDb();
  runMigrations(db, join(__dirname, '..', 'migrations'));
  return db;
}
