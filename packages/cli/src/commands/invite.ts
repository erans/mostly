import { Command } from 'commander';
import { loadConfig, requireAuth } from '../config.js';
import { MostlyClient } from '../client.js';
import { output, type OutputOptions } from '../output.js';

interface InviteOptions extends OutputOptions {
  displayName?: string;
  actor?: string;
}

/**
 * Strip any path, query, or fragment from a server URL so we can
 * build a browser-friendly accept URL. Falls back to the original
 * string with a trailing-slash-stripped suffix if the URL doesn't
 * parse.
 *
 * Exported for unit tests.
 */
export function deriveAcceptUrl(serverUrl: string, token: string): string {
  try {
    const u = new URL(serverUrl);
    // Drop the path so we land on the site root, not an API prefix.
    u.pathname = '';
    u.search = '';
    u.hash = '';
    const base = u.toString().replace(/\/+$/, '');
    return `${base}/invite/${token}`;
  } catch {
    return `${serverUrl.replace(/\/+$/, '')}/invite/${token}`;
  }
}

/**
 * `mostly invite <handle>` — admin-only. Creates a pending human
 * principal and returns a one-time invite token the admin hands to
 * the new user. The user exchanges the token for a password via
 * `POST /v0/auth/accept-invite`.
 */
export function inviteCommand(): Command {
  return new Command('invite')
    .description('Invite a new user (admin only)')
    .argument('<handle>', 'Handle for the new user')
    .option('--display-name <name>', 'Display name for the new user')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output (prints only the invite token)')
    .option('--actor <actor>', 'Actor handle override')
    .action(async (handle: string, opts: InviteOptions) => {
      try {
        const config = loadConfig({ actor: opts.actor });
        requireAuth(config);
        const client = MostlyClient.fromConfig(config);

        const body: Record<string, unknown> = { handle };
        if (opts.displayName) body.display_name = opts.displayName;

        const result = await client.post('/v0/auth/invite', body);
        const principal = result?.data?.principal;
        const inviteToken: string = result?.data?.invite_token;

        if (opts.quiet) {
          // Quiet mode prints only the token for scripted flows.
          console.log(inviteToken);
          return;
        }
        if (opts.json) {
          output(result.data, opts);
          return;
        }

        console.log(`Invite created for "${principal?.handle ?? handle}"`);
        console.log(`  Invite token: ${inviteToken}`);
        console.log(`  Accept URL:   ${deriveAcceptUrl(config.serverUrl, inviteToken)}`);
        console.log('');
        console.log('Share the token (or URL) with the invitee. It is valid for 7 days.');
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
