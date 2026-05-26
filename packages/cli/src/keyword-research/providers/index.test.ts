import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enrichKeywordsWithProviderMetrics } from './index.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('keyword metrics providers', () => {
  it('enriches keywords with mock provider and reuses cache', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seocore-keyword-provider-'));
    tempDirs.push(cacheDir);

    const first = await enrichKeywordsWithProviderMetrics(['behavioral health services'], 'en', 'us', {
      config: { provider: 'mock', cacheTtlSeconds: 86400 },
      cacheDir,
      retryCount: 0,
    });
    const second = await enrichKeywordsWithProviderMetrics(['behavioral health services'], 'en', 'us', {
      config: { provider: 'mock', cacheTtlSeconds: 86400 },
      cacheDir,
      retryCount: 0,
    });

    expect(first.status.status).toBe('enriched');
    expect(first.metricsByKeyword.get('behavioral health services')?.searchVolume).toBeGreaterThan(0);
    expect(second.status.cacheHits).toBe(1);
  });

  it('falls back cleanly when hook provider is selected but not implemented', async () => {
    const result = await enrichKeywordsWithProviderMetrics(['behavioral health services'], 'en', 'us', {
      config: { provider: 'semrush' },
      retryCount: 0,
    });

    expect(result.status.status).toBe('fallback');
    expect(result.status.warnings[0]).toContain('adapter hook not implemented');
    expect(result.metricsByKeyword.size).toBe(0);
  });
});
