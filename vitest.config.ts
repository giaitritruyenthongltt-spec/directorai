import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      '**/src/**/*.{test,spec}.{ts,tsx}',
      '**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules', 'dist', '.turbo', '**/build/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/dist/**', '**/*.test.ts', '**/*.config.*'],
    },
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
