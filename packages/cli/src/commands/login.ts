import { Command } from 'commander';
import { hostname } from 'os';
import { loadConfig, updateConfig } from '../config.js';
import { promptText, promptPassword } from '../prompts.js';

interface LoginOptions {
  serverUrl?: string;
  handle?: string;
  name?: string;
}

/**
 * Derive a default API key name from the machine hostname.
 *
 * Must match `^[a-z0-9_-]+$` (enforced by CreateApiKeyRequest). We
 * lowercase, replace any disallowed character with `-`, and collapse
 * leading/trailing `-`. Falls back to `cli-local` if hostname
 * resolution produces an empty or purely-symbol string.
 *
 * Exported for unit tests.
 */
export function defaultKeyName(): string {
  const raw = hostname().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `cli-${cleaned || 'local'}`;
}

/**
 * Extract the `mostly_session` cookie from a Set-Cookie header.
 *
 * Node's fetch concatenates multiple Set-Cookie headers with commas,
 * which breaks naive splitting. We scan for our specific cookie name.
 *
 * Exported for unit tests.
 */
export function extractSessionCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/mostly_session=([^;,\s]+)/);
  return match ? match[1] : null;
}

/**
 * Decode the `error` object from a JSON error response body. Returns
 * `null` if the body is missing, not JSON, or does not follow our
 * error envelope.
 */
async function parseErrorBody(
  res: Response,
): Promise<{ code?: string; message?: string } | null> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return body?.error ?? null;
  } catch {
    return null;
  }
}

export function loginCommand(): Command {
  return new Command('login')
    .description('Sign in with username and password; stores an API key in the config')
    .option('-s, --server-url <url>', 'Server URL (overrides the one in config)')
    .option('--handle <handle>', 'Handle (skips the interactive prompt)')
    .option(
      '--name <name>',
      'Name for the API key to create (default: cli-<hostname>)',
    )
    .action(async (opts: LoginOptions) => {
      const config = loadConfig({ serverUrl: opts.serverUrl });
      const serverUrl = config.serverUrl.replace(/\/+$/, '');

      const handle = (opts.handle ?? (await promptText('Handle: '))).trim();
      if (!handle) {
        console.error('Handle is required.');
        process.exit(1);
      }
      const password = await promptPassword('Password: ');
      if (!password) {
        console.error('Password is required.');
        process.exit(1);
      }

      // 1. Sign in to obtain a session cookie.
      const loginRes = await fetch(`${serverUrl}/v0/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password }),
      });
      if (!loginRes.ok) {
        const err = await parseErrorBody(loginRes);
        console.error(`Login failed: ${err?.message ?? `HTTP ${loginRes.status}`}`);
        process.exit(1);
      }

      const sessionCookie = extractSessionCookie(loginRes.headers.get('set-cookie'));
      if (!sessionCookie) {
        console.error('Login succeeded but the server did not return a session cookie.');
        process.exit(1);
      }

      // 2. Create a named API key using the short-lived session cookie.
      const keyName = opts.name ?? defaultKeyName();
      const createRes = await fetch(`${serverUrl}/v0/auth/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `mostly_session=${sessionCookie}`,
        },
        body: JSON.stringify({ name: keyName }),
      });

      if (!createRes.ok) {
        const err = await parseErrorBody(createRes);
        // Conflict => an API key with this name already exists. This is
        // the common re-login-on-same-host case; give the user the
        // exact command to clean up rather than silently reusing the
        // old key (we can't — the server only returns the plaintext
        // once, at creation time).
        if (err?.code === 'conflict' || createRes.status === 409) {
          console.error(`An API key named "${keyName}" already exists.`);
          console.error(`Revoke it first:  mostly api-key revoke ${keyName}`);
          console.error('Or pass a different name:  mostly login --name <name>');
          process.exit(1);
        }
        console.error(
          `Failed to create API key: ${err?.message ?? `HTTP ${createRes.status}`}`,
        );
        process.exit(1);
      }

      const body = (await createRes.json()) as { data: { key: string; name: string } };
      const apiKey = body.data.key;

      // 3. Persist server_url, api_key, and default_actor to ~/.mostly/config.
      // Writing default_actor makes subsequent `--actor`-less commands
      // operate under this user's handle (important for agent-token
      // flows) but is harmless under api_key auth where the server
      // resolves the actor from the key itself.
      updateConfig({
        server_url: serverUrl,
        api_key: apiKey,
        default_actor: handle,
      });

      console.log(`Logged in as ${handle}.`);
      console.log(`API key "${keyName}" saved to config.`);
    });
}
