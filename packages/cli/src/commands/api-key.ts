import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { formatTable, formatCard, output, type OutputOptions } from '../output.js';

interface ApiKeyCommonOptions extends OutputOptions {
  actor?: string;
}

const API_KEY_COLUMNS = [
  { key: 'name', header: 'NAME' },
  { key: 'key_prefix', header: 'PREFIX' },
  { key: 'is_active', header: 'ACTIVE' },
  { key: 'created_at', header: 'CREATED' },
  { key: 'last_used_at', header: 'LAST USED' },
];

/**
 * `mostly api-key create|list|revoke` — manage API keys for the
 * currently logged-in user. All three subcommands require human auth
 * (session or API key). Agent tokens will hit a 401 or 403 at the
 * server because `/v0/auth/api-keys/*` routes only accept principal-
 * level credentials.
 */
export function apiKeyCommand(): Command {
  const cmd = new Command('api-key').description('Manage API keys for the current user');

  cmd
    .command('create <name>')
    .description('Create a new API key; the plaintext key is shown exactly once')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output (prints only the new key)')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (name: string, opts: ApiKeyCommonOptions) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.post('/v0/auth/api-keys', { name });

        if (opts.quiet) {
          // Quiet mode prints only the plaintext key so it can be piped
          // into `export MOSTLY_API_KEY=$(mostly api-key create … -q)`.
          console.log(result.data.key);
          return;
        }
        if (opts.json) {
          output(result.data, opts);
          return;
        }
        console.log(formatCard(result.data, ['name', 'key_prefix', 'created_at']));
        console.log('');
        console.log('Plaintext key (shown once — save it somewhere safe):');
        console.log(`  ${result.data.key}`);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('List API keys for the current user')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (opts: ApiKeyCommonOptions) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);
        const result = await client.get('/v0/auth/api-keys');
        const items = result?.data?.items ?? [];

        if (opts.json) {
          output({ items }, opts);
          return;
        }
        if (opts.quiet) {
          for (const item of items) console.log(item.name);
          return;
        }
        if (items.length === 0) {
          console.log('No API keys.');
          return;
        }
        // Normalize nullable fields so formatTable doesn't render `null`.
        const rows = items.map(
          (k: { name: string; key_prefix: string; is_active: boolean; created_at: string; last_used_at: string | null }) => ({
            name: k.name,
            key_prefix: `msk_${k.key_prefix}…`,
            is_active: k.is_active ? 'yes' : 'no',
            created_at: k.created_at,
            last_used_at: k.last_used_at ?? 'never',
          }),
        );
        console.log(formatTable(rows, API_KEY_COLUMNS));
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  cmd
    .command('revoke <name>')
    .description('Revoke an API key by name (it can no longer authenticate)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (name: string, opts: ApiKeyCommonOptions) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);

        // Server DELETE is by id. Look it up via the list endpoint.
        const listRes = await client.get('/v0/auth/api-keys');
        const items: { id: string; name: string }[] = listRes?.data?.items ?? [];
        const match = items.find((k) => k.name === name);
        if (!match) {
          console.error(`API key "${name}" not found.`);
          process.exit(1);
        }

        await client.delete(`/v0/auth/api-keys/${match.id}`);

        if (opts.json) {
          output({ name, revoked: true }, opts);
          return;
        }
        if (opts.quiet) return;
        console.log(`API key "${name}" revoked.`);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
