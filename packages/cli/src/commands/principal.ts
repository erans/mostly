import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { formatPrincipal, formatPrincipalList } from '../output.js';
import { promptNewPassword } from '../prompts.js';

export function principalCommand(): Command {
  const cmd = new Command('principal').description('Manage principals');

  cmd
    .command('create')
    .description('Create a new principal')
    .requiredOption('--handle <handle>', 'Principal handle')
    .requiredOption('--kind <kind>', 'Principal kind (human, agent, service)')
    .option('--display-name <name>', 'Display name')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.post('/v0/principals', {
          handle: opts.handle,
          kind: opts.kind,
          ...(opts.displayName ? { display_name: opts.displayName } : {}),
        });
        formatPrincipal(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('List all principals')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.get('/v0/principals');
        formatPrincipalList(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('show <id>')
    .description('Show a principal by handle or ULID')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (id, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.get(`/v0/principals/${id}`);
        formatPrincipal(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  cmd
    .command('reset-password <handle>')
    .description("Reset a user's password (admin only; invalidates their sessions)")
    .option(
      '--password <password>',
      'New password (skips interactive prompt — not recommended outside tests)',
    )
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (handle: string, opts) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);

        // When no password is provided on the CLI, prompt twice and
        // confirm match. promptNewPassword already enforces minLength.
        const password =
          opts.password ?? (await promptNewPassword(`New password for ${handle}: `));
        if (!password || password.length < 8) {
          console.error('Password must be at least 8 characters.');
          process.exit(1);
        }

        const client = MostlyClient.fromConfig(config);
        await client.post('/v0/auth/reset-password', { handle, password });

        if (opts.quiet) return;
        if (opts.json) {
          console.log(JSON.stringify({ handle, reset: true }, null, 2));
          return;
        }
        console.log(`Password reset for "${handle}". All existing sessions invalidated.`);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  return cmd;
}
