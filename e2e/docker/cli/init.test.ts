import { describe, expect, it, beforeEach } from 'vitest';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';

const CLI_PATH = resolve(__dirname, '../../../packages/cli/dist/index.js');
const TEST_HOME = '/tmp/mostly-init-test';

// The new init flow prompts for admin credentials interactively. Pass them as
// flags so the test can run headlessly without driving stdin.
const INIT_ARGS = ['--admin-handle', 'admin', '--admin-password', 'test-pw-1234'];

function runInit(args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, 'init', ...INIT_ARGS, ...args], {
      env: { ...process.env, HOME: TEST_HOME },
      timeout: 15000,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

describe('CLI: init', () => {
  beforeEach(() => {
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true });
    mkdirSync(TEST_HOME, { recursive: true });
  });

  it('creates config and database', async () => {
    const { stdout, exitCode } = await runInit();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config written');
    expect(stdout).toContain('Database ready');
    expect(existsSync(join(TEST_HOME, '.mostly', 'config'))).toBe(true);
    expect(existsSync(join(TEST_HOME, '.mostly', 'mostly.db'))).toBe(true);
  });

  it('refuses to overwrite without --force', async () => {
    await runInit();
    const { stdout } = await runInit();
    expect(stdout).toContain('already exists');
  });

  it('overwrites with --force', async () => {
    await runInit();
    const { stdout, exitCode } = await runInit(['--force']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config written');
  });
});
