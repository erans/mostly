import { describe, expect, it } from 'vitest';
import { runCli } from '../setup/cli-runner.js';
import { execFile } from 'child_process';
import { resolve } from 'path';

const CLI_PATH = resolve(__dirname, '../../../packages/cli/dist/index.js');

describe('CLI: error handling', () => {
  it('fails with missing required args', async () => {
    const { exitCode, stderr } = await runCli(['task', 'create']);
    expect(exitCode).not.toBe(0);
  });

  it('fails with unreachable server', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      execFile('node', [CLI_PATH, 'task', 'list'], {
        env: {
          ...process.env,
          MOSTLY_SERVER_URL: 'http://localhost:59999',
          MOSTLY_TOKEN: 'test-token-e2e',
          MOSTLY_ACTOR: 'e2e-agent',
        },
        timeout: 10000,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      });
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('fails with invalid token', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      execFile('node', [CLI_PATH, 'task', 'list'], {
        env: {
          ...process.env,
          MOSTLY_SERVER_URL: process.env.MOSTLY_SERVER_URL ?? process.env.SERVER_URL ?? 'http://localhost:6080',
          MOSTLY_TOKEN: 'wrong-token',
          MOSTLY_ACTOR: 'e2e-agent',
        },
        timeout: 10000,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      });
    });
    expect(result.exitCode).not.toBe(0);
  });
});
