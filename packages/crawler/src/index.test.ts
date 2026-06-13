import { describe, it, expect, vi } from 'vitest';
import { RobotsTxt, SitemapParser, HttpCrawler } from './index';

describe('RobotsTxt Parser', () => {
  it('should parse disallows and sitemaps', () => {
    const robotsContent = `
      User-agent: *
      Disallow: /admin/
      Disallow: /private/*
      Sitemap: https://example.com/sitemap.xml
    `;
    const robots = new RobotsTxt(robotsContent);

    expect(robots.isAllowed('/admin/dashboard')).toBe(false);
    expect(robots.isAllowed('/private/secret')).toBe(false);
    expect(robots.isAllowed('/blog/post-1')).toBe(true);
    expect(robots.getSitemaps()).toEqual(['https://example.com/sitemap.xml']);
  });

  it('should restrict by specific user-agent seocore', () => {
    const robotsContent = `
      User-agent: seocore
      Disallow: /no-seocore/
    `;
    const robots = new RobotsTxt(robotsContent);
    expect(robots.isAllowed('/no-seocore/page')).toBe(false);
  });

  it('should support standard ends-with matching ($)', () => {
    const robotsContent = `
      User-agent: *
      Disallow: /*.php$
    `;
    const robots = new RobotsTxt(robotsContent);
    expect(robots.isAllowed('/index.php')).toBe(false);
    expect(robots.isAllowed('/index.php?id=123')).toBe(true);
  });
});

describe('Sitemap XML Parser', () => {
  it('should parse urls from XML sitemap format', () => {
    const sitemapContent = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/home</loc>
        </url>
        <url>
          <loc>https://example.com/about</loc>
        </url>
      </urlset>
    `;
    const urls = SitemapParser.parse(sitemapContent);
    expect(urls).toEqual([
      'https://example.com/home',
      'https://example.com/about'
    ]);
  });
});

describe('HttpCrawler Redirects', () => {
  const mockConfig = {
    preset: 'standard',
    concurrency: 2,
    maxDepth: 3,
    maxPages: 100,
    rateLimitMs: 0,
    retryCount: 0,
    playwrightEnabled: false,
    excludePatterns: [],
    includePatterns: [],
    ruleOverrides: {},
  } as unknown as SeoConfig;

  it('should follow redirects manually up to max redirects', async () => {
    let fetchCount = 0;
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCount++;
      if (url === 'https://example.com/start') {
        return {
          status: 301,
          ok: false,
          headers: new Map([['location', 'https://example.com/hop1']]),
        } as unknown as Response;
      } else if (url === 'https://example.com/hop1') {
        return {
          status: 302,
          ok: false,
          headers: new Map([['location', 'https://example.com/target']]),
        } as unknown as Response;
      } else if (url === 'https://example.com/target') {
        return {
          status: 200,
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          text: async () => '<html>Target content</html>',
        } as unknown as Response;
      }
      return { status: 404, ok: false } as unknown as Response;
    });

    try {
      const crawler = new HttpCrawler();
      const result = await crawler.crawl('https://example.com/start', mockConfig);

      expect(fetchCount).toBe(3);
      expect(result.statusCode).toBe(200);
      expect(result.url).toBe('https://example.com/target');
      expect(result.html).toBe('<html>Target content</html>');
      expect(result.redirectChain).toEqual([
        { url: 'https://example.com/start', statusCode: 301 },
        { url: 'https://example.com/hop1', statusCode: 302 },
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should detect direct and circular redirect loops', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://example.com/loop1') {
        return {
          status: 302,
          ok: false,
          headers: new Map([['location', 'https://example.com/loop2']]),
        } as unknown as Response;
      } else if (url === 'https://example.com/loop2') {
        return {
          status: 302,
          ok: false,
          headers: new Map([['location', 'https://example.com/loop1']]),
        } as unknown as Response;
      }
      return { status: 404, ok: false } as unknown as Response;
    });

    try {
      const crawler = new HttpCrawler();
      const result = await crawler.crawl('https://example.com/loop1', mockConfig);

      expect(result.error).toBe('Circular redirect detected');
      expect(result.statusCode).toBe(302);
      expect(result.redirectChain).toEqual([
        { url: 'https://example.com/loop1', statusCode: 302 },
        { url: 'https://example.com/loop2', statusCode: 302 },
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should handle missing location header gracefully', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        status: 302,
        ok: false,
        headers: new Map(),
      } as unknown as Response;
    });

    try {
      const crawler = new HttpCrawler();
      const result = await crawler.crawl('https://example.com/start', mockConfig);

      expect(result.error).toBe('Redirect header location missing');
      expect(result.statusCode).toBe(302);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('HttpCrawler resource measurement', () => {
  const mockConfig = {
    preset: 'standard',
    concurrency: 2,
    maxDepth: 3,
    maxPages: 100,
    rateLimitMs: 0,
    retryCount: 0,
    playwrightEnabled: false,
    excludePatterns: [],
    includePatterns: [],
    ruleOverrides: {},
  } as unknown as SeoConfig;

  it('measures real same-origin asset bytes and estimates cross-origin', async () => {
    const originalFetch = global.fetch;
    const html = `<html><head>
      <link rel="stylesheet" href="/styles.css">
      <script src="/app.js"></script>
      <script src="https://cdn.other.net/lib.js"></script>
    </head><body>hi</body></html>`;

    global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (opts?.method === 'HEAD') {
        const len = url.endsWith('/app.js') ? '12345' : url.endsWith('/styles.css') ? '6789' : '';
        return {
          status: 200,
          ok: true,
          headers: new Map(len ? [['content-length', len]] : []),
        } as unknown as Response;
      }
      return {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => html,
      } as unknown as Response;
    });

    try {
      const crawler = new HttpCrawler();
      const result = await crawler.crawl('https://example.com/', mockConfig);

      expect(result.resources?.measured).toBe(true);
      expect(result.resources?.jsRequests).toBe(2);
      expect(result.resources?.cssRequests).toBe(1);
      // same-origin app.js measured (12345) + cross-origin lib.js estimated (35000)
      expect(result.resources?.jsSizeBytes).toBe(12345 + 35000);
      expect(result.resources?.cssSizeBytes).toBe(6789);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('skips measurement when measureResources is disabled', async () => {
    const originalFetch = global.fetch;
    let headCount = 0;
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      if (opts?.method === 'HEAD') headCount++;
      return {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html><script src="/app.js"></script></html>',
      } as unknown as Response;
    });

    try {
      const crawler = new HttpCrawler();
      const result = await crawler.crawl('https://example.com/', { ...mockConfig, measureResources: false });
      expect(headCount).toBe(0);
      expect(result.resources).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});