import { Command } from 'commander';
import type { ApiKey } from '@mostly/types';
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
 *
 * We also deliberately leave `default_actor` alone: if the user still
 * has an `agent_token` configured (from `mostly init`), clearing the
 * actor would break agent-token auth, which requires one. Whatever
 * actor was last set (by init or login) remains a sensible default.
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

      // The server only ever issues `msk_`-prefixed API keys. If the
      // local config somehow holds something else, bail out of the
      // server revoke path: we have no way to identify which key to
      // DELETE, and silently deleting nothing would lie to the user.
      if (!config.apiKey.startsWith('msk_')) {
        console.warn(
          'Warning: stored API key does not have the expected `msk_` prefix. ' +
            'Clearing local config without contacting the server.',
        );
      } else {
        // Revoke the current key on the server, best-effort. We look
        // up its id first because the DELETE endpoint is by id, not
        // by the plaintext key. Any network/server error is non-fatal
        // — the whole point of logout is to make this machine forget.
        try {
          const client = MostlyClient.fromConfig(config);
          const list = await client.get('/v0/auth/api-keys');
          // `key_prefix` on the server is `fullKey.slice(4, 12)` —
          // the 8 chars after the `msk_` prefix. See
          // packages/core/src/services/auth.ts:140.
          const prefix = config.apiKey.slice(4, 12);
          const items: ApiKey[] = list?.data?.items ?? [];
          const match = items.find((k) => k.key_prefix === prefix);
          if (match) {
            await client.delete(`/v0/auth/api-keys/${match.id}`);
          } else {
            // The list call succeeded but our key wasn't in it. This
            // means the key was already revoked, or belongs to a
            // different account on the same server. Warn — don't
            // pretend we cleaned up server-side when we didn't.
            console.warn(
              'Warning: stored API key was not found on the server; ' +
                'nothing was revoked remotely. Clearing local config.',
            );
          }
        } catch {
          /* best effort — local cleanup is what matters */
        }
      }

      // Remove the local auth material. `default_actor` is intentionally
      // preserved: see the doc comment on this function.
      const updates: { api_key: null; server_url?: null } = { api_key: null };
      if (!opts.keepServerUrl) updates.server_url = null;
      updateConfig(updates);

      console.log('Logged out. API key removed from config.');
    });
}
