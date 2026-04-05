import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { MostlyClient } from '../client.js';
import { formatPrincipal, formatPrincipalList } from '../output.js';

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
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
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
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
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
        const client = new MostlyClient(config.serverUrl, config.token, config.actor);
        const result = await client.get(`/v0/principals/${id}`);
        formatPrincipal(result.data, opts);
      } catch (err: any) {
        console.error(err.message);
        process.exit(1);
      }
    });

  return cmd;
}
