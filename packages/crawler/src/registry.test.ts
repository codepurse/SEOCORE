import { describe, expect, it, vi } from 'vitest';
import { createDefaultRegistry, CrawlerRegistry, PlaywrightCrawler, LighthouseCrawler } from './index.js';
import { Crawler, SeoConfig, CrawlResult } from '@seocore/sdk';

class MockCrawler implements Crawler {
  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    return { url, statusCode: 200, loadTimeMs: 1, contentType: 'text/html' };
  }
}

describe('CrawlerRegistry', () => {
  it('default registry has http, playwright, lighthouse', () => {
    const reg = createDefaultRegistry();
    expect(reg.has('http')).toBe(true);
    expect(reg.has('playwright')).toBe(true);
    expect(reg.has('lighthouse')).toBe(true);
  });

  it('selectForConfig returns lighthouse when configured and available', async () => {
    const reg = new CrawlerRegistry();
    reg.register('lighthouse', () => new MockCrawler());

    vi.spyOn(LighthouseCrawler, 'isAvailable').mockResolvedValue(true);

    const config: SeoConfig = {
      preset: 'standard',
      concurrency: 1,
      maxDepth: 1,
      maxPages: 1,
      rateLimitMs: 0,
      retryCount: 0,
      playwrightEnabled: false,
      lighthouseEnabled: true,
      excludePatterns: [],
      includePatterns: [],
      ruleOverrides: {},
    };

    const { name, crawler } = await reg.selectForConfig(config);
    expect(name).toBe('lighthouse');
    expect(crawler).toBeInstanceOf(MockCrawler);

    vi.restoreAllMocks();
  });

  it('selectForConfig downgrades to http when playwright/lighthouse enabled but unavailable', async () => {
    const reg = new CrawlerRegistry();
    reg.register('http', () => new MockCrawler());
    reg.register('playwright', () => new MockCrawler());

    vi.spyOn(PlaywrightCrawler, 'isAvailable').mockResolvedValue(false);

    const config: SeoConfig = {
      preset: 'standard',
      concurrency: 1,
      maxDepth: 1,
      maxPages: 1,
      rateLimitMs: 0,
      retryCount: 0,
      playwrightEnabled: true,
      excludePatterns: [],
      includePatterns: [],
      ruleOverrides: {},
    };

    const { name, crawler } = await reg.selectForConfig(config);
    expect(name).toBe('http');
    expect(crawler).toBeInstanceOf(MockCrawler);

    vi.restoreAllMocks();
  });

  it('custom registration via register works', () => {
    const reg = new CrawlerRegistry();
    reg.register('jsdom', () => new MockCrawler());
    expect(reg.has('jsdom')).toBe(true);
    expect(reg.create('jsdom')).toBeInstanceOf(MockCrawler);
  });
});
