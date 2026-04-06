import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { createLocalDb, runMigrations, createRepositories } from '@mostly/db';
import { configExists, getConfigDir, getConfigPath, getDbPath } from '../config.js';
import { getMigrationsDir } from '../migrations.js';
import { generateId, ID_PREFIXES } from '@mostly/types';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize ~/.mostly/ config and DB')
    .option('--default-actor <handle>', 'Default actor handle')
    .option('--force', 'Overwrite existing config')
    .action(async (opts) => {
      const configDir = getConfigDir();
      const configPath = getConfigPath();
      const dbPath = getDbPath();

      // 1. Check if config already exists
      if (configExists() && !opts.force) {
        console.log(`Config already exists at ${configPath}`);
        console.log('Use --force to overwrite.');
        return;
      }

      // 2. Create ~/.mostly/ directory
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // 3. Generate random 32-byte hex token
      const token = randomBytes(32).toString('hex');

      // 4. Write config
      const config: Record<string, unknown> = {
        server_url: 'http://localhost:6080',
        token,
      };
      if (opts.defaultActor) {
        config.default_actor = opts.defaultActor;
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log(`Config written to ${configPath}`);

      // 5. Create SQLite database
      const db = createLocalDb(dbPath);

      // 6. Run migrations
      const migrationsDir = getMigrationsDir();
      runMigrations(db, migrationsDir);
      console.log(`Database created at ${dbPath}`);

      // 7. Seed default workspace
      const repos = createRepositories(db);
      let workspace;
      try {
        workspace = await repos.workspaces.getDefault();
        console.log(`Default workspace already exists: ${workspace.id}`);
      } catch {
        const now = new Date().toISOString();
        workspace = await repos.workspaces.create({
          id: generateId(ID_PREFIXES.workspace),
          slug: 'default',
          name: 'Default Workspace',
          created_at: now,
          updated_at: now,
        });
        console.log(`Created default workspace: ${workspace.id}`);
      }

      // 8. Print summary
      console.log('\nMostly initialized successfully.');
      console.log(`  Config: ${configPath}`);
      console.log(`  Database: ${dbPath}`);
      console.log(`  Token: ${token.slice(0, 8)}...`);
      if (opts.defaultActor) {
        console.log(`  Default actor: ${opts.defaultActor}`);
      }
      console.log('\nRun "mostly serve" to start the local server.');
    });
}
