import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['e2e/docker/**/*.test.ts'],
    root: resolve(__dirname, '../..'),
    globalSetup: ['e2e/docker/setup/global-setup.ts'],
    sequence: {
      concurrent: false,
    },
    testTimeout: 30000,
  },
});
