import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import {
  createLocalDb,
  runMigrations,
  createRepositories,
  createTransactionManager,
} from '@mostly/db';
import { AuthService, generateToken, sha256 } from '@mostly/core';
import {
  generateId,
  ID_PREFIXES,
  ConflictError,
} from '@mostly/types';
import { configExists, getConfigDir, getConfigPath, getDbPath } from '../config.js';
import { getMigrationsDir } from '../migrations.js';
import { promptText, promptNewPassword } from '../prompts.js';

interface InitOptions {
  adminHandle?: string;
  adminPassword?: string;
  serverUrl?: string;
  force?: boolean;
}

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize ~/.mostly/ — creates the database and admin user')
    .option('--admin-handle <handle>', 'Admin handle (skips interactive prompt)')
    .option(
      '--admin-password <password>',
      'Admin password (skips interactive prompt — not recommended outside tests)',
    )
    .option('--server-url <url>', 'Server URL to record in config', 'http://localhost:6080')
    .option('--force', 'Overwrite an existing config')
    .action(async (opts: InitOptions) => {
      const configDir = getConfigDir();
      const configPath = getConfigPath();
      const dbPath = getDbPath();

      if (configExists() && !opts.force) {
        console.log(`Config already exists at ${configPath}`);
        console.log('Use --force to overwrite.');
        return;
      }

      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // 1. Create and migrate the database.
      const db = createLocalDb(dbPath);
      const migrationsDir = getMigrationsDir();
      runMigrations(db, migrationsDir);
      console.log(`Database ready at ${dbPath}`);

      const repos = createRepositories(db);
      createTransactionManager(db); // sanity check that tx wiring works with this DB

      // 2. Ensure a default workspace exists.
      let workspace;
      try {
        workspace = await repos.workspaces.getDefault();
      } catch {
        const now = new Date().toISOString();
        workspace = await repos.workspaces.create({
          id: generateId(ID_PREFIXES.workspace),
          slug: 'default',
          name: 'Default Workspace',
          created_at: now,
          updated_at: now,
        });
      }
      console.log(`Default workspace: ${workspace.id}`);

      // 3. Prompt for admin credentials (unless provided non-interactively).
      const adminHandle = (opts.adminHandle ?? (await promptText('Admin handle: '))).trim();
      if (!adminHandle) {
        console.error('Admin handle is required.');
        process.exit(1);
      }

      const adminPassword =
        opts.adminPassword ?? (await promptNewPassword('Admin password: '));
      if (!adminPassword || adminPassword.length < 8) {
        console.error('Admin password must be at least 8 characters.');
        process.exit(1);
      }

      // 4. Create the admin user via AuthService. This handles password
      //    hashing, first-user detection, and is_admin assignment.
      const authService = new AuthService(
        repos.principals,
        repos.workspaces,
        repos.sessions,
        repos.apiKeys,
      );
      let admin;
      try {
        const result = await authService.register(workspace.id, {
          handle: adminHandle,
          password: adminPassword,
        });
        admin = result.principal;
      } catch (err) {
        if (err instanceof ConflictError) {
          console.error(`A user with handle "${adminHandle}" already exists.`);
          console.error('Use --force to wipe and re-init, or pick a different handle.');
          process.exit(1);
        }
        throw err;
      }
      if (!admin.is_admin) {
        // listHumans already had a human in it — this isn't actually the
        // first user, so AuthService didn't grant admin. Fail loudly so the
        // operator knows something went wrong.
        console.error(
          `User "${adminHandle}" was created but not marked as admin — ` +
            'another user already exists. Use --force to reset.',
        );
        process.exit(1);
      }
      console.log(`Admin user created: ${admin.handle}`);

      // 5. Generate a workspace agent token and store its hash.
      const agentToken = generateToken('mat_');
      await repos.workspaces.update(workspace.id, {
        agent_token_hash: sha256(agentToken),
        updated_at: new Date().toISOString(),
      });

      // 6. Write the config file (mode 0600 — contains the agent token).
      const serverUrl = opts.serverUrl ?? 'http://localhost:6080';
      const configBody =
        JSON.stringify({ server_url: serverUrl, agent_token: agentToken }, null, 2) + '\n';
      writeFileSync(configPath, configBody, { mode: 0o600 });
      console.log(`Config written to ${configPath} (mode 0600)`);

      // 7. Setup summary.
      console.log('\nMostly initialized successfully.');
      console.log(`  Config:       ${configPath}`);
      console.log(`  Database:     ${dbPath}`);
      console.log(`  Admin:        ${admin.handle} (is_admin=true)`);
      console.log(`  Server URL:   ${serverUrl}`);
      console.log('');
      console.log('  Agent token (shown once — keep it safe):');
      console.log(`    ${agentToken}`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. `mostly serve` — start the local server');
      console.log('  2. `mostly login` — create an API key for your admin account');
    });
}
