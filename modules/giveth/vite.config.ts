import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['setup.ts'],
    testTimeout: 10000,
  },
});
