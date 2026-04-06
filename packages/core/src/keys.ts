export const DEFAULT_PREFIX = 'TASK';

const TASK_KEY_PATTERN = /^([A-Z0-9]+)-(\d+)$/;

export function formatTaskKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

export function parseTaskKey(key: string): { prefix: string; number: number } | null {
  const match = TASK_KEY_PATTERN.exec(key);
  if (!match) return null;
  return { prefix: match[1], number: parseInt(match[2], 10) };
}

export function isTaskKey(value: string): boolean {
  return TASK_KEY_PATTERN.test(value);
}
