import { execFile } from 'child_process';
import { resolve } from 'path';

const CLI_PATH = resolve(__dirname, '../../../packages/cli/dist/index.js');
const SERVER_URL = process.env.MOSTLY_SERVER_URL ?? process.env.SERVER_URL ?? 'http://localhost:6080';
const TOKEN = process.env.MOSTLY_TOKEN ?? 'test-token-e2e';
const ACTOR = process.env.MOSTLY_ACTOR ?? 'e2e-agent';

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, ...args], {
      env: {
        ...process.env,
        MOSTLY_SERVER_URL: SERVER_URL,
        MOSTLY_TOKEN: TOKEN,
        MOSTLY_ACTOR: ACTOR,
      },
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

export async function runCliJson(args: string[]): Promise<{ result: any; exitCode: number }> {
  const { stdout, exitCode } = await runCli([...args, '--json']);
  let result = null;
  try {
    result = JSON.parse(stdout);
  } catch {
    // Not JSON output
  }
  return { result, exitCode };
}
