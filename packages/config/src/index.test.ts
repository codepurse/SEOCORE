import { describe, it, expect } from 'vitest';
import { SeoConfigSchema, resolveConfig } from './index.js';

describe('Config schema and resolver', () => {
  it('should parse a complete config successfully and match round-trip', () => {
    const raw = {
      preset: 'standard' as const,
      tier: 'deep' as const,
      concurrency: 3,
      maxDepth: 3,
      maxPages: 100,
      rateLimitMs: 100,
      retryCount: 2,
      playwrightEnabled: false,
      lighthouseEnabled: true,
      excludePatterns: [],
      includePatterns: [],
      ruleOverrides: {
        'security-headers': {
          severity: 'warning' as const,
          findingSeverityOverrides: {
            'security-headers:missing-csp': 'error' as const
          }
        }
      }
    };

    const parsed = SeoConfigSchema.parse(raw);
    expect(parsed.tier).toBe('deep');
    expect(parsed.lighthouseEnabled).toBe(true);
    expect(parsed.ruleOverrides['security-headers']?.findingSeverityOverrides?.['security-headers:missing-csp']).toBe('error');

    const reSerialized = structuredClone(parsed);
    const reParsed = SeoConfigSchema.parse(reSerialized);
    expect(reParsed).toEqual(parsed);
  });

  it('applying tier deep applies deep-tier crawl settings', () => {
    const config = resolveConfig({ tier: 'deep' }, 'nonexistent.json');
    expect(config.tier).toBe('deep');
    expect(config.maxPages).toBe(500);
    expect(config.maxDepth).toBe(5);
    expect(config.playwrightEnabled).toBe(true);
  });

  it('CLI / partial parameters override file-level tier settings', () => {
    const config = resolveConfig({ tier: 'fast', maxPages: 12 }, 'nonexistent.json');
    expect(config.tier).toBe('fast');
    expect(config.maxPages).toBe(12);
  });

  it('parses keyword intelligence provider settings', () => {
    const config = resolveConfig({
      keywordIntelligence: {
        provider: 'mock',
        locale: 'en',
        region: 'us',
        rateLimitMs: 150,
        batchSize: 10,
      },
    }, 'nonexistent.json');

    expect(config.keywordIntelligence?.provider).toBe('mock');
    expect(config.keywordIntelligence?.locale).toBe('en');
    expect(config.keywordIntelligence?.batchSize).toBe(10);
  });
});
