import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export function runMigrations(db: any, migrationsFolder: string) {
  migrate(db, { migrationsFolder });
}
