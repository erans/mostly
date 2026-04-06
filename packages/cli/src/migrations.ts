import { createRequire } from 'module';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

/**
 * Locate the @mostly/db migrations directory.
 * Resolves via Node module resolution so it works from both source and dist.
 */
export function getMigrationsDir(): string {
  const dbIndex = require.resolve('@mostly/db');
  // dbIndex points to something like <root>/packages/db/dist/index.js
  // Migrations live at <root>/packages/db/migrations
  const dbPkg = dirname(dirname(dbIndex));
  return join(dbPkg, 'migrations');
}
