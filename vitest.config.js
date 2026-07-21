import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const apiDirectory = fileURLToPath(new URL('./apps/api', import.meta.url));
Object.assign(process.env, loadEnv('', apiDirectory, ''));

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['apps/**/*.{test,spec}.{js,jsx}'],
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'apps/api/src/**/*.js',
        'apps/web/src/**/*.{js,jsx}',
      ],
      exclude: [
        'apps/api/src/data/prisma.js',
        'apps/api/src/server.js',
        'apps/web/src/main.jsx',
      ],
    },
  },
});
