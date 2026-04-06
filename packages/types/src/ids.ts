const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const ID_PREFIXES = {
  workspace: 'ws',
  principal: 'prin',
  project: 'proj',
  task: 'tsk',
  taskUpdate: 'upd',
} as const;

export function generateId(prefix: string): string {
  const bytes = new Uint8Array(5); // 5 bytes = 40 bits
  crypto.getRandomValues(bytes);

  // Use BigInt to avoid 32-bit overflow when combining 5 bytes
  let value = BigInt(0);
  for (let i = 0; i < 5; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }

  let result = '';
  for (let i = 7; i >= 0; i--) {
    const index = Number((value >> (BigInt(i) * 5n)) & 0x1fn);
    result += CROCKFORD_ALPHABET[index];
  }

  return `${prefix}_${result}`;
}

export function parseIdPrefix(id: string): string | null {
  const idx = id.indexOf('_');
  if (idx <= 0) return null;
  return id.slice(0, idx);
}
