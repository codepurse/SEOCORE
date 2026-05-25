import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeoEngine } from './index';
import { HttpCrawler } from '@seocore/crawler';
import { EventBus } from '@seocore/sdk';

describe('SeoEngine Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run full audit pipeline successfully with mock crawler data', async () => {
    // Mock HttpCrawler crawl method to simulate a small site
    const crawlSpy = vi.spyOn(HttpCrawler.prototype, 'crawl').mockImplementation(async (url: string) => {
      if (url === 'https://mysite.com/') {
        return {
          url,
          statusCode: 200,
          loadTimeMs: 10,
          contentType: 'text/html',
          html: `
            <html>
              <head>
                <title>Home Title</title>
                <link rel="canonical" href="https://mysite.com/">
                <meta name="description" content="Welcome home">
              </head>
              <body>
                <h1>Home Page H1</h1>
                <a href="https://mysite.com/about">About page link</a>
                <a href="https://mysite.com/contact">Contact page link</a>
              </body>
            </html>
          `
        };
      } else if (url === 'https://mysite.com/about') {
        return {
          url,
          statusCode: 200,
          loadTimeMs: 15,
          contentType: 'text/html',
          html: `
            <html>
              <head>
                <title>About Us</title>
              </head>
              <body>
                <h1>About Us</h1>
              </body>
            </html>
          `
        };
      } else if (url === 'https://mysite.com/contact') {
        return {
          url,
          statusCode: 404,
          loadTimeMs: 5,
          contentType: 'text/html',
          html: `<html><body>404 Not Found</body></html>`
        };
      } else if (url.endsWith('robots.txt') || url.endsWith('sitemap.xml')) {
        return {
          url,
          statusCode: 404,
          loadTimeMs: 5,
          contentType: 'text/plain',
        };
      }
      return {
        url,
        statusCode: 404,
        loadTimeMs: 1,
        contentType: 'text/plain',
      };
    });

    const eventBus = new EventBus();
    const eventLogs: string[] = [];

    eventBus.on('crawl:start', () => { eventLogs.push('crawl:start'); });
    eventBus.on('page:loaded', (d) => { eventLogs.push(`page:loaded:${d.url}`); });
    eventBus.on('dom:parsed', (d) => { eventLogs.push(`dom:parsed:${d.url}`); });
    eventBus.on('analyzer:completed', () => { eventLogs.push('analyzer:completed'); });
    eventBus.on('score:calculated', () => { eventLogs.push('score:calculated'); });
    eventBus.on('audit:complete', () => { eventLogs.push('audit:complete'); });

    const engine = new SeoEngine(eventBus);
    const result = await engine.run('https://mysite.com/', {
      maxPages: 3,
      concurrency: 1,
      maxDepth: 2,
    });

    expect(result.url).toBe('https://mysite.com/');
    expect(result.pagesAudited).toBeGreaterThanOrEqual(2);
    expect(result.score).toBeLessThan(100); // 404 on contact page should reduce the score!
    
    expect(eventLogs).toContain('crawl:start');
    expect(eventLogs).toContain('page:loaded:https://mysite.com/');
    expect(eventLogs).toContain('dom:parsed:https://mysite.com/');
    expect(eventLogs).toContain('analyzer:completed');
    expect(eventLogs).toContain('score:calculated');
    expect(eventLogs).toContain('audit:complete');
  });

  it('should support excludePatterns and includePatterns', async () => {
    const crawlSpy = vi.spyOn(HttpCrawler.prototype, 'crawl').mockImplementation(async (url: string) => {
      if (url === 'https://mysite.com/') {
        return {
          url,
          statusCode: 200,
          loadTimeMs: 10,
          contentType: 'text/html',
          html: `
            <html>
              <body>
                <a href="https://mysite.com/admin/dashboard">Admin link</a>
                <a href="https://mysite.com/allowed-page">Allowed link</a>
                <a href="https://mysite.com/ignored-page">Ignored link</a>
              </body>
            </html>
          `
        };
      }
      return {
        url,
        statusCode: 200,
        loadTimeMs: 5,
        contentType: 'text/html',
        html: '<html><body>Page</body></html>'
      };
    });

    const engine = new SeoEngine();
    const result = await engine.run('https://mysite.com/', {
      maxPages: 10,
      concurrency: 1,
      maxDepth: 2,
      excludePatterns: ['/admin/*'],
      includePatterns: ['/', '/allowed-page']
    });

    expect(result.pages['https://mysite.com/']).toBeDefined();
    expect(result.pages['https://mysite.com/allowed-page']).toBeDefined();
    expect(result.pages['https://mysite.com/admin/dashboard']).toBeUndefined();
    expect(result.pages['https://mysite.com/ignored-page']).toBeUndefined();
  });

  it('should support concurrent engine.run calls without cross-contamination', async () => {
    const crawlSpy = vi.spyOn(HttpCrawler.prototype, 'crawl').mockImplementation(async (url: string) => {
      return {
        url,
        statusCode: 200,
        loadTimeMs: 1,
        contentType: 'text/html',
        html: '<html><head><title>Page</title></head><body>Hello</body></html>'
      };
    });

    const engine = new SeoEngine();
    
    // Run two engines in parallel with different configurations
    const promise1 = engine.run('https://mysite1.com/', { maxPages: 2 });
    const promise2 = engine.run('https://mysite2.com/', { maxPages: 3 });

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(res1.url).toBe('https://mysite1.com/');
    expect(res2.url).toBe('https://mysite2.com/');
    expect(Object.keys(res1.pages)).toContain('https://mysite1.com/');
    expect(Object.keys(res1.pages)).not.toContain('https://mysite2.com/');
    expect(Object.keys(res2.pages)).toContain('https://mysite2.com/');
    expect(Object.keys(res2.pages)).not.toContain('https://mysite1.com/');
  });
});