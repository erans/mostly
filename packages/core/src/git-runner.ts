import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface GitRunner {
  /** Run `git <args>` in `cwd`. Returns stdout. Throws on non-zero exit. */
  run(cwd: string, args: string[]): Promise<string>;
}

export class RealGitRunner implements GitRunner {
  async run(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileP('git', args, { cwd, maxBuffer: 5 * 1024 * 1024 });
    return stdout;
  }
}

/**
 * In-memory runner for tests. The script keys are space-joined argv strings.
 * A `null` value simulates a non-zero exit.
 */
export class FakeGitRunner implements GitRunner {
  constructor(private script: Record<string, string | null>) {}

  async run(_cwd: string, args: string[]): Promise<string> {
    const key = args.join(' ');
    if (!(key in this.script)) {
      throw new Error(`FakeGitRunner: no script entry for "${key}"`);
    }
    const out = this.script[key];
    if (out === null) throw new Error(`git ${key} (simulated failure)`);
    return out;
  }
}
