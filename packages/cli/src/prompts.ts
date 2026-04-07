import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * Read a line from stdin with the given prompt. Trims trailing whitespace.
 * Works with both TTY and piped input.
 */
export async function promptText(message: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(message);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Read a password from stdin without echoing. On a TTY we switch stdin into
 * raw mode and consume bytes manually so typing is invisible. On non-TTY
 * (piped input, tests), we fall back to a regular readline — callers that
 * care about secrecy in scripted contexts should use env vars or flags
 * instead of piping.
 */
export async function promptPassword(message: string): Promise<string> {
  if (!input.isTTY) {
    // Non-interactive — read a plain line. The caller is responsible for
    // not leaking the secret (e.g. via stdin from a file).
    return promptText(message);
  }

  return new Promise<string>((resolve, reject) => {
    output.write(message);
    const wasRaw = input.isRaw ?? false;
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    let buffer = '';
    const cleanup = () => {
      input.setRawMode(wasRaw);
      input.pause();
      input.removeListener('data', onData);
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        // Enter (CR or LF) — finish
        if (ch === '\n' || ch === '\r') {
          cleanup();
          output.write('\n');
          resolve(buffer);
          return;
        }
        // Ctrl-C — abort
        if (ch === '\u0003') {
          cleanup();
          output.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        // Ctrl-D with empty buffer — abort
        if (ch === '\u0004' && buffer.length === 0) {
          cleanup();
          output.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        // Backspace / delete
        if (ch === '\u007f' || ch === '\b') {
          if (buffer.length > 0) buffer = buffer.slice(0, -1);
          continue;
        }
        // Ignore other control characters
        if (ch < ' ') continue;
        buffer += ch;
      }
    };

    input.on('data', onData);
  });
}

/**
 * Prompt for a password twice and confirm they match. Re-prompts on
 * mismatch or on an empty password.
 */
export async function promptNewPassword(
  message: string,
  confirmMessage = 'Confirm password: ',
  minLength = 8,
): Promise<string> {
  for (;;) {
    const first = await promptPassword(message);
    if (first.length < minLength) {
      output.write(`Password must be at least ${minLength} characters.\n`);
      continue;
    }
    const second = await promptPassword(confirmMessage);
    if (first !== second) {
      output.write('Passwords do not match. Try again.\n');
      continue;
    }
    return first;
  }
}
