import crypto from 'node:crypto';
import type { KeywordMetricsProvider, KeywordProviderMetrics } from './types.js';

function metricSeed(keyword: string, salt: string): number {
  const hash = crypto.createHash('sha256').update(`${salt}:${keyword}`).digest('hex');
  return Number.parseInt(hash.slice(0, 8), 16);
}

function bounded(keyword: string, salt: string, min: number, max: number): number {
  const seed = metricSeed(keyword, salt);
  const range = max - min;
  return min + (seed % (range + 1));
}

export class MockKeywordMetricsProvider implements KeywordMetricsProvider {
  readonly name = 'mock' as const;

  async getKeywordMetrics(keywords: string[]): Promise<Map<string, KeywordProviderMetrics>> {
    const fetchedAt = new Date().toISOString();
    const metrics = new Map<string, KeywordProviderMetrics>();

    for (const keyword of keywords) {
      metrics.set(keyword, {
        searchVolume: bounded(keyword, 'volume', 40, 12000),
        keywordDifficulty: bounded(keyword, 'difficulty', 8, 82),
        cpc: bounded(keyword, 'cpc', 1, 30) / 2,
        competition: bounded(keyword, 'competition', 1, 100) / 100,
        provider: this.name,
        fetchedAt,
      });
    }

    return metrics;
  }
}
