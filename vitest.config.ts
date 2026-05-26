import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    alias: {
      '@seocore/sdk': resolve(__dirname, './packages/sdk/src/index.ts'),
      '@seocore/config': resolve(__dirname, './packages/config/src/index.ts'),
      '@seocore/crawler': resolve(__dirname, './packages/crawler/src/index.ts'),
      '@seocore/analyzers': resolve(__dirname, './packages/analyzers/src/index.ts'),
      '@seocore/backlinks': resolve(__dirname, './packages/backlinks/src/index.ts'),
      '@seocore/plugin-backlinks': resolve(__dirname, './packages/plugin-backlinks/src/index.ts'),
      '@seocore/rules': resolve(__dirname, './packages/rules/src/index.ts'),
      '@seocore/reporter': resolve(__dirname, './packages/reporter/src/index.ts'),
      '@seocore/engine': resolve(__dirname, './packages/engine/src/index.ts'),
      '@seocore/rule-utils': resolve(__dirname, './packages/rule-utils/src/index.ts'),
      '@seocore/rules-core': resolve(__dirname, './packages/rules-core/src/index.ts'),
      '@seocore/rules-performance': resolve(__dirname, './packages/rules-performance/src/index.ts'),
      '@seocore/rules-mobile': resolve(__dirname, './packages/rules-mobile/src/index.ts'),
      '@seocore/rules-ai-visibility': resolve(__dirname, './packages/rules-ai-visibility/src/index.ts'),
      '@seocore/rules-security': resolve(__dirname, './packages/rules-security/src/index.ts'),
      '@seocore/rules-hreflang': resolve(__dirname, './packages/rules-hreflang/src/index.ts'),
      '@seocore/scoring-core': resolve(__dirname, './packages/scoring-core/src/index.ts'),
    },
  },
});