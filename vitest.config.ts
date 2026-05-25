import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    alias: {
      '@seocore/sdk': resolve(__dirname, './packages/sdk/src/index.ts'),
      '@seocore/config': resolve(__dirname, './packages/config/src/index.ts'),
      '@seocore/crawler': resolve(__dirname, './packages/crawler/src/index.ts'),
      '@seocore/analyzers': resolve(__dirname, './packages/analyzers/src/index.ts'),
      '@seocore/rules': resolve(__dirname, './packages/rules/src/index.ts'),
      '@seocore/scoring': resolve(__dirname, './packages/scoring/src/index.ts'),
      '@seocore/reporter': resolve(__dirname, './packages/reporter/src/index.ts'),
      '@seocore/engine': resolve(__dirname, './packages/engine/src/index.ts'),
      '@seocore/rule-utils': resolve(__dirname, './packages/rule-utils/src/index.ts'),
      '@seocore/rules-core': resolve(__dirname, './packages/rules-core/src/index.ts'),
      '@seocore/scoring-core': resolve(__dirname, './packages/scoring-core/src/index.ts'),
    },
  },
});