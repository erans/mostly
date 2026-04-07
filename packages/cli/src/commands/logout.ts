import { Command } from 'commander';
import { loadConfig, updateConfig, configExists } from '../config.js';
import { MostlyClient } from '../client.js';

interface LogoutOptions {
  keepServerUrl?: boolean;
}

/**
 * Log out by clearing the stored API key from ~/.mostly/config.
 *
 * We also make a best-effort attempt to revoke *the key we're logging
 * out with* on the server. We deliberately do NOT enumerate and revoke
 * every `cli-*` key in the account — that would surprise users who
 * log in from multiple machines, each with its own `cli-<host>` key.
 */
export function logoutCommand(): Command {
  return new Command('logout')
    .description('Remove the stored API key (and revoke it on the server, best-effort)')
    .option(
      '--keep-server-url',
      'Keep `server_url` in the config file (default: remove with the API key)',
    )
    .action(async (opts: LogoutOptions) => {
      if (!configExists()) {
        console.log('Not logged in (no config file).');
        return;
      }

      const config = loadConfig();
      if (!config.apiKey) {
        console.log('Not logged in (no API key in config).');
        return;
      }

      // Revoke the current key on the server, best-effort. We look up
      // its id first because the DELETE endpoint is by id, not by the
      // plaintext key. Any network/server error here is non-fatal:
      // the whole point of logout is to make this machine forget.
      try {
        const client = MostlyClient.fromConfig(config);
        const list = await client.get('/v0/auth/api-keys');
        // The stored key has the form `msk_<64 hex>`. Its prefix is
        // the first 8 chars after the `msk_`, matching key_prefix
        // stored on the server.
        const prefix = config.apiKey.startsWith('msk_')
          ? config.apiKey.slice(4, 12)
          : config.apiKey.slice(0, 8);
        const items: { id: string; key_prefix: string }[] = list?.data?.items ?? [];
        const match = items.find((k) => k.key_prefix === prefix);
        if (match) {
          await client.delete(`/v0/auth/api-keys/${match.id}`);
        }
      } catch {
        /* best effort — local cleanup is what matters */
      }

      // Remove the local state. We always clear api_key; server_url is
      // optional (sometimes people want to keep "which server" while
      // switching accounts).
      const updates: { api_key: null; server_url?: null; default_actor: null } = {
        api_key: null,
        default_actor: null,
      };
      if (!opts.keepServerUrl) updates.server_url = null;
      updateConfig(updates);

      console.log('Logged out. API key removed from config.');
    });
}
