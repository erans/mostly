import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@mostly/types': resolve(__dirname, '../packages/types/src/index.ts'),
      '@mostly/core': resolve(__dirname, '../packages/core/src/index.ts'),
      '@mostly/db': resolve(__dirname, '../packages/db/src/index.ts'),
      '@mostly/server': resolve(__dirname, '../packages/server/src/index.ts'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
  },
});
