import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractSessionCookie, defaultKeyName } from '../src/commands/login.js';
import { deriveAcceptUrl } from '../src/commands/invite.js';
import { projectCommand } from '../src/commands/project.js';
import { taskCommand } from '../src/commands/task.js';

// `os.hostname` is imported inside login.ts, so mock the module.
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, hostname: vi.fn(() => 'mybox.local') };
});
import { hostname } from 'os';
const mockedHostname = vi.mocked(hostname);

describe('login helpers', () => {
  describe('extractSessionCookie', () => {
    it('returns null when no header is present', () => {
      expect(extractSessionCookie(null)).toBeNull();
    });

    it('returns null when the header does not contain mostly_session', () => {
      expect(extractSessionCookie('other=x; Path=/')).toBeNull();
    });

    it('parses a single Set-Cookie header', () => {
      expect(
        extractSessionCookie(
          'mostly_session=abc123; Path=/; HttpOnly; SameSite=Lax',
        ),
      ).toBe('abc123');
    });

    it('parses when multiple Set-Cookie headers are comma-concatenated', () => {
      // Node fetch concatenates multiple Set-Cookie headers with `, `.
      const header =
        'other=1; Path=/, mostly_session=sess_xyz; Path=/; HttpOnly, third=2';
      expect(extractSessionCookie(header)).toBe('sess_xyz');
    });

    it('stops at whitespace or comma so adjacent cookies do not leak in', () => {
      expect(
        extractSessionCookie('mostly_session=abc; next=y'),
      ).toBe('abc');
    });

    it('returns null when the value is empty', () => {
      expect(extractSessionCookie('mostly_session=; Path=/')).toBeNull();
    });
  });

  describe('defaultKeyName', () => {
    beforeEach(() => {
      mockedHostname.mockReset();
    });
    afterEach(() => {
      mockedHostname.mockReset();
    });

    it('returns cli-<hostname> for a simple lowercase hostname', () => {
      mockedHostname.mockReturnValue('mybox');
      expect(defaultKeyName()).toBe('cli-mybox');
    });

    it('lowercases the hostname', () => {
      mockedHostname.mockReturnValue('MyBox');
      expect(defaultKeyName()).toBe('cli-mybox');
    });

    it('replaces dots and other disallowed characters with dashes', () => {
      mockedHostname.mockReturnValue('mybox.local');
      expect(defaultKeyName()).toBe('cli-mybox-local');
    });

    it('strips leading/trailing dashes after replacement', () => {
      mockedHostname.mockReturnValue('.host.');
      expect(defaultKeyName()).toBe('cli-host');
    });

    it('falls back to cli-local when hostname resolves to a symbol-only string', () => {
      mockedHostname.mockReturnValue('...');
      expect(defaultKeyName()).toBe('cli-local');
    });

    it('falls back to cli-local for an empty hostname', () => {
      mockedHostname.mockReturnValue('');
      expect(defaultKeyName()).toBe('cli-local');
    });
  });
});

describe('invite helpers', () => {
  describe('deriveAcceptUrl', () => {
    it('strips the /v0 path from a typical server URL', () => {
      expect(deriveAcceptUrl('http://localhost:6080/v0', 'tok')).toBe(
        'http://localhost:6080/invite/tok',
      );
    });

    it('strips a trailing slash', () => {
      expect(deriveAcceptUrl('http://localhost:6080/', 'tok')).toBe(
        'http://localhost:6080/invite/tok',
      );
    });

    it('preserves the hostname and port', () => {
      expect(deriveAcceptUrl('https://mostly.example.com:8443/v0', 'tok')).toBe(
        'https://mostly.example.com:8443/invite/tok',
      );
    });

    it('drops query and fragment', () => {
      expect(
        deriveAcceptUrl('http://localhost:6080/v0?debug=1#frag', 'tok'),
      ).toBe('http://localhost:6080/invite/tok');
    });

    it('falls back for a non-URL string', () => {
      expect(deriveAcceptUrl('not a url', 'tok')).toBe('not a url/invite/tok');
    });
  });
});

describe('project subcommands option parsing', () => {
  /**
   * Helper: find a registered subcommand on the project command by name,
   * and return its parsed opts object without triggering the action handler.
   *
   * We use Commander's parseOptions() which fills opts but does NOT fire
   * the action callback — safe for unit tests that just want to verify
   * option definitions and defaults.
   */
  function parseProjectSubcommandOpts(subName: string, argv: string[]): Record<string, any> {
    const cmd = projectCommand();
    const sub = cmd.commands.find((c) => c.name() === subName);
    if (!sub) throw new Error(`subcommand "${subName}" not found`);
    // setOptionValueWithSource handles defaults; parseOptions fills from argv.
    sub.parseOptions(argv);
    return sub.opts();
  }

  describe('project link', () => {
    it('has correct defaults', () => {
      const opts = parseProjectSubcommandOpts('link', []);
      expect(opts.remote).toBe('origin');
      expect(opts.subpath).toBe('');
      expect(opts.allRemotes).toBeUndefined();
      expect(opts.project).toBeUndefined();
    });

    it('parses --project and --remote', () => {
      const opts = parseProjectSubcommandOpts('link', ['--project', 'AUTH', '--remote', 'upstream']);
      expect(opts.project).toBe('AUTH');
      expect(opts.remote).toBe('upstream');
    });

    it('parses --all-remotes as allRemotes', () => {
      const opts = parseProjectSubcommandOpts('link', ['--all-remotes']);
      expect(opts.allRemotes).toBe(true);
    });

    it('parses --subpath', () => {
      const opts = parseProjectSubcommandOpts('link', ['--subpath', 'packages/auth']);
      expect(opts.subpath).toBe('packages/auth');
    });

    it('parses --from', () => {
      const opts = parseProjectSubcommandOpts('link', ['--from', '/tmp/myrepo']);
      expect(opts.from).toBe('/tmp/myrepo');
    });

    it('parses --json and --quiet', () => {
      const optsJson = parseProjectSubcommandOpts('link', ['--json']);
      expect(optsJson.json).toBe(true);
      const optsQuiet = parseProjectSubcommandOpts('link', ['--quiet']);
      expect(optsQuiet.quiet).toBe(true);
    });
  });

  describe('project unlink', () => {
    it('has correct defaults', () => {
      const opts = parseProjectSubcommandOpts('unlink', []);
      expect(opts.remote).toBe('origin');
      expect(opts.subpath).toBe('');
      expect(opts.all).toBeUndefined();
    });

    it('parses --project', () => {
      const opts = parseProjectSubcommandOpts('unlink', ['--project', 'AUTH']);
      expect(opts.project).toBe('AUTH');
    });

    it('parses --all', () => {
      const opts = parseProjectSubcommandOpts('unlink', ['--project', 'AUTH', '--all']);
      expect(opts.all).toBe(true);
    });

    it('parses --from', () => {
      const opts = parseProjectSubcommandOpts('unlink', ['--project', 'AUTH', '--from', '/repo']);
      expect(opts.from).toBe('/repo');
    });

    it('parses --remote and --subpath', () => {
      const opts = parseProjectSubcommandOpts('unlink', [
        '--project', 'AUTH',
        '--remote', 'upstream',
        '--subpath', 'packages/auth',
      ]);
      expect(opts.remote).toBe('upstream');
      expect(opts.subpath).toBe('packages/auth');
    });
  });

  describe('project links', () => {
    it('has no required options (all optional)', () => {
      const opts = parseProjectSubcommandOpts('links', []);
      expect(opts.project).toBeUndefined();
      expect(opts.json).toBeUndefined();
      expect(opts.quiet).toBeUndefined();
    });

    it('parses --project', () => {
      const opts = parseProjectSubcommandOpts('links', ['--project', 'AUTH']);
      expect(opts.project).toBe('AUTH');
    });

    it('parses --json', () => {
      const opts = parseProjectSubcommandOpts('links', ['--json']);
      expect(opts.json).toBe(true);
    });

    it('parses --quiet', () => {
      const opts = parseProjectSubcommandOpts('links', ['--quiet']);
      expect(opts.quiet).toBe(true);
    });
  });
});

describe('task subcommands option parsing', () => {
  /**
   * Helper: find a registered subcommand on the task command by name,
   * and return its parsed opts object without triggering the action handler.
   */
  function parseTaskSubcommandOpts(subName: string, argv: string[]): Record<string, any> {
    const cmd = taskCommand();
    const sub = cmd.commands.find((c) => c.name() === subName);
    if (!sub) throw new Error(`subcommand "${subName}" not found`);
    sub.parseOptions(argv);
    return sub.opts();
  }

  const subcommandsWithNoGitContext = [
    'create',
    'list',
    'show',
    'claim',
    'renew-claim',
    'release-claim',
    'start',
    'block',
    'close',
    'cancel',
  ];

  for (const name of subcommandsWithNoGitContext) {
    describe(`task ${name}`, () => {
      it('accepts --no-git-context (Commander sets gitContext=false)', () => {
        const opts = parseTaskSubcommandOpts(name, ['--no-git-context']);
        // Commander.js maps --no-git-context to opts.gitContext === false
        expect(opts.gitContext).toBe(false);
      });

      it('gitContext defaults to true when --no-git-context is absent', () => {
        const opts = parseTaskSubcommandOpts(name, []);
        expect(opts.gitContext).toBe(true);
      });
    });
  }

  describe('task create', () => {
    it('parses --project', () => {
      const opts = parseTaskSubcommandOpts('create', ['--title', 'T', '--type', 'chore', '--project', 'AUTH']);
      expect(opts.project).toBe('AUTH');
    });

    it('project is optional (undefined when absent)', () => {
      const opts = parseTaskSubcommandOpts('create', ['--title', 'T', '--type', 'chore']);
      expect(opts.project).toBeUndefined();
    });
  });

  describe('task list', () => {
    it('parses --project', () => {
      const opts = parseTaskSubcommandOpts('list', ['--project', 'AUTH']);
      expect(opts.project).toBe('AUTH');
    });

    it('project is optional (undefined when absent)', () => {
      const opts = parseTaskSubcommandOpts('list', []);
      expect(opts.project).toBeUndefined();
    });
  });

  describe('task show', () => {
    it('has no required positional (id is optional)', () => {
      // Should parse without error when no positional is provided
      expect(() => parseTaskSubcommandOpts('show', [])).not.toThrow();
    });
  });

  describe('task add-update', () => {
    it('does NOT have --no-git-context (positional id is required)', () => {
      const cmd = taskCommand();
      const sub = cmd.commands.find((c) => c.name() === 'add-update')!;
      const hasOption = sub.options.some((o) => o.long === '--no-git-context');
      expect(hasOption).toBe(false);
    });
  });

  describe('task reap-expired', () => {
    it('does NOT have --no-git-context (maintenance command)', () => {
      const cmd = taskCommand();
      const sub = cmd.commands.find((c) => c.name() === 'reap-expired')!;
      const hasOption = sub.options.some((o) => o.long === '--no-git-context');
      expect(hasOption).toBe(false);
    });
  });

  describe('task edit', () => {
    it('does NOT have --no-git-context (always requires explicit id)', () => {
      const cmd = taskCommand();
      const sub = cmd.commands.find((c) => c.name() === 'edit')!;
      const hasOption = sub.options.some((o) => o.long === '--no-git-context');
      expect(hasOption).toBe(false);
    });
  });
});
