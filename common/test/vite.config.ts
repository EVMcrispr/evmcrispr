import { defineConfig } from 'vitest/config';

// eslint-disable-next-line turbo/no-undeclared-env-vars
const WORKERS_LENGTH = parseInt(process.env.WORKERS_LENGTH ?? '8');

export default defineConfig({
  test: {
    coverage: {
      reporter: ['lcov'],
    },
    globals: true,
    environment: 'node',
    setupFiles: ['setup.ts'],
    globalSetup: ['global-setup.ts'],
    maxThreads: WORKERS_LENGTH,
    minThreads: WORKERS_LENGTH,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
