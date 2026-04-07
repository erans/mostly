import { Command } from 'commander';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
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
import {
  configExists,
  getConfigDir,
  getConfigPath,
  getDbPath,
  DEFAULT_SERVER_URL,
} from '../config.js';
import { getMigrationsDir } from '../migrations.js';
import { promptText, promptNewPassword } from '../prompts.js';

interface InitOptions {
  adminHandle?: string;
  adminPassword?: string;
  serverUrl?: string;
  force?: boolean;
}

/** Delete a file if it exists. Silently ignores "not found" errors. */
function removeIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize ~/.mostly/ — creates the database and admin user')
    .option('--admin-handle <handle>', 'Admin handle (skips interactive prompt)')
    .option(
      '--admin-password <password>',
      'Admin password (skips interactive prompt — not recommended outside tests)',
    )
    .option('--server-url <url>', 'Server URL to record in config', DEFAULT_SERVER_URL)
    .option(
      '--force',
      'Wipe any existing ~/.mostly/config AND ~/.mostly/mostly.db and re-init from scratch',
    )
    .action(async (opts: InitOptions) => {
      const configDir = getConfigDir();
      const configPath = getConfigPath();
      const dbPath = getDbPath();

      if (configExists() && !opts.force) {
        console.log(`Config already exists at ${configPath}`);
        console.log('Use --force to wipe it and the database, then re-init.');
        return;
      }

      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // --force means "start clean": delete both the config and the DB before
      // creating the new one. Without this, a half-finished prior init (e.g.
      // admin was created but config write failed) leaves the DB in a state
      // where `register` throws ConflictError on the second try.
      //
      // SQLite runs in WAL mode, so we also need to remove the -wal and -shm
      // sidecar files — otherwise a crashed prior init could leave them
      // pointing at the now-deleted database file.
      if (opts.force) {
        removeIfExists(configPath);
        removeIfExists(dbPath);
        removeIfExists(`${dbPath}-wal`);
        removeIfExists(`${dbPath}-shm`);
        console.log('Force mode — cleared existing config and database.');
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

      // 4. Create the admin user via AuthService. From this point on, if we
      //    fail before the config is written, the DB has partial state and
      //    we tell the user to re-run with --force.
      const authService = new AuthService(
        repos.principals,
        repos.workspaces,
        repos.sessions,
        repos.apiKeys,
      );

      let admin;
      let sessionId: string;
      try {
        const result = await authService.register(workspace.id, {
          handle: adminHandle,
          password: adminPassword,
        });
        admin = result.principal;
        sessionId = result.sessionId;
      } catch (err) {
        if (err instanceof ConflictError) {
          console.error(`A user with handle "${adminHandle}" already exists.`);
          console.error('Run `mostly init --force` to wipe and re-init, or pick a different handle.');
          process.exit(1);
        }
        throw err;
      }

      if (!admin.is_admin) {
        // Another human principal was already in the workspace, so
        // AuthService treated this as a second registration and did not
        // grant admin. Fail loudly — the config we would otherwise write
        // points at a non-admin account and the CLI would be half-broken.
        console.error(
          `User "${adminHandle}" was created but not marked as admin — ` +
            'another user already exists in the workspace.',
        );
        console.error('Run `mostly init --force` to wipe the database and start clean.');
        process.exit(1);
      }

      // We don't need the session init created — init is headless and the
      // admin will log in later. Best-effort delete; a failure here is not
      // worth aborting over because the session expires naturally.
      try {
        await authService.deleteSession(sessionId);
      } catch {
        /* noop */
      }
      console.log(`Admin user created: ${admin.handle}`);

      // 5. Everything after this point must succeed atomically from the
      //    user's perspective. Any failure should leave a clear recovery
      //    path ("run init --force") because the DB already contains the
      //    admin and dropping back to the prompt would be confusing.
      try {
        // Generate a workspace agent token and store its hash.
        const agentToken = generateToken('mat_');
        await repos.workspaces.update(workspace.id, {
          agent_token_hash: sha256(agentToken),
          updated_at: new Date().toISOString(),
        });

        // Write the config file (mode 0600 — contains the agent token).
        // Also record default_actor so that subsequent CLI commands
        // run under the admin's identity when using the agent token,
        // without requiring --actor on every invocation.
        const serverUrl = opts.serverUrl ?? DEFAULT_SERVER_URL;
        const configBody =
          JSON.stringify(
            {
              server_url: serverUrl,
              agent_token: agentToken,
              default_actor: admin.handle,
            },
            null,
            2,
          ) + '\n';
        writeFileSync(configPath, configBody, { mode: 0o600 });
        console.log(`Config written to ${configPath} (mode 0600)`);

        // 6. Setup summary.
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
      } catch (err) {
        console.error('\nInit failed after creating the admin user:', (err as Error).message);
        console.error('The database contains partial state. Run `mostly init --force` to start clean.');
        process.exit(1);
      }
    });
}
