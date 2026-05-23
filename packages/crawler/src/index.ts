import { Crawler, CrawlResult, SeoConfig, RedirectHop } from '@seocore/sdk';

// ==========================================
// ROBOTS.TXT PARSER
// ==========================================

export class RobotsTxt {
  private readonly disallows: string[] = [];
  private readonly sitemaps: string[] = [];

  constructor(content: string) {
    const lines = content.split(/\r?\n/);
    let activeAgent = false;
    for (const line of lines) {
      const clean = line.trim().split('#')[0].trim();
      if (!clean) continue;
      const index = clean.indexOf(':');
      if (index === -1) continue;
      const key = clean.substring(0, index).trim().toLowerCase();
      const val = clean.substring(index + 1).trim();

      if (key === 'user-agent') {
        activeAgent = (val === '*' || val.toLowerCase() === 'seocore');
      } else if (key === 'disallow' && activeAgent) {
        if (val) this.disallows.push(val);
      } else if (key === 'sitemap') {
        if (val) this.sitemaps.push(val);
      }
    }
  }

  isAllowed(urlPath: string): boolean {
    for (const pattern of this.disallows) {
      let isExactEnd = false;
      let cleanPattern = pattern;
      if (cleanPattern.endsWith('$')) {
        isExactEnd = true;
        cleanPattern = cleanPattern.substring(0, cleanPattern.length - 1);
      }

      // Escape special regex characters except *
      let regexStr = '^' + cleanPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars
        .replace(/\*/g, '.*');

      if (isExactEnd) {
        regexStr += '$';
      }

      const regex = new RegExp(regexStr);
      if (regex.test(urlPath)) {
        return false;
      }
    }
    return true;
  }

  getSitemaps(): string[] {
    return this.sitemaps;
  }
}

// ==========================================
// SITEMAP XML PARSER
// ==========================================

export class SitemapParser {
  static parse(xmlContent: string): string[] {
    const urls: string[] = [];
    const regex = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
    let match;
    while ((match = regex.exec(xmlContent)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }
}

// ==========================================
// HTTP CRAWLER
// ==========================================

export class HttpCrawler implements Crawler {
  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    let currentUrl = url;
    const redirectChain: RedirectHop[] = [];
    const maxRedirects = 5;
    let attempts = 0;
    const maxAttempts = (config.retryCount ?? 2) + 1;

    while (attempts < maxAttempts) {
      attempts++;
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual', // Intercept 3xx redirect actions
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        clearTimeout(timeoutId);
        const loadTimeMs = Date.now() - startTime;
        const contentType = response.headers.get('content-type') || 'text/html';

        // Detect 3xx redirects
        if (response.status >= 300 && response.status <= 399) {
          const location = response.headers.get('location');
          if (!location) {
            return {
              url: currentUrl,
              statusCode: response.status,
              loadTimeMs,
              contentType,
              error: 'Redirect header location missing',
              redirectChain,
            };
          }

          const resolvedRedirectUrl = new URL(location, currentUrl).href;

          // Detect redirect loops
          if (redirectChain.some(hop => hop.url === resolvedRedirectUrl) || resolvedRedirectUrl === url) {
            return {
              url: currentUrl,
              statusCode: response.status,
              loadTimeMs,
              contentType,
              error: 'Circular redirect detected',
              redirectChain: [...redirectChain, { url: currentUrl, statusCode: response.status }],
            };
          }

          redirectChain.push({ url: currentUrl, statusCode: response.status });

          if (redirectChain.length >= maxRedirects) {
            return {
              url: resolvedRedirectUrl,
              statusCode: response.status,
              loadTimeMs,
              contentType,
              error: 'Max redirects exceeded',
              redirectChain,
            };
          }

          // Follow the redirect to the next hop
          currentUrl = resolvedRedirectUrl;
          attempts = 0; // Reset attempts for the redirected URL target
          continue;
        }

        if (!response.ok) {
          if (response.status >= 500 && attempts < maxAttempts) {
            const delay = (config.rateLimitMs ?? 100) * attempts;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return {
            url: currentUrl,
            statusCode: response.status,
            loadTimeMs,
            contentType,
            error: `HTTP Error: ${response.status} ${response.statusText}`,
            redirectChain,
          };
        }

        const html = await response.text();
        return {
          url: currentUrl,
          html,
          statusCode: response.status,
          loadTimeMs,
          contentType,
          redirectChain,
        };
      } catch (err: any) {
        if (attempts < maxAttempts) {
          const delay = (config.rateLimitMs ?? 100) * attempts;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return {
          url: currentUrl,
          statusCode: 0,
          loadTimeMs: Date.now() - startTime,
          contentType: 'none',
          error: err.message || 'Unknown network error',
          redirectChain,
        };
      }
    }

    return {
      url: currentUrl,
      statusCode: 0,
      loadTimeMs: 0,
      contentType: 'none',
      error: 'Max retries exceeded',
      redirectChain,
    };
  }
}

// ==========================================
// PLAYWRIGHT CRAWLER (DYNAMIC FALLBACK)
// ==========================================

export class PlaywrightCrawler implements Crawler {
  private readonly httpCrawler = new HttpCrawler();

  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    const startTime = Date.now();
    try {
      // Dynamic import of playwright-core or playwright to avoid heavy required install
      // If user has it, we use it, otherwise fallback to HTTP crawler with warning
      let playwright;
      try {
        // @ts-ignore
        playwright = await import('playwright');
      } catch {
        console.warn(`[Crawler] Playwright is configured but not installed. Falling back to HTTP Crawler.`);
        return this.httpCrawler.crawl(url, config);
      }

      const browser = await playwright.chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore; Playwright)',
      });
      const page = await context.newPage();

      let pageSizeBytes = 0;
      let jsSizeBytes = 0;
      let cssSizeBytes = 0;
      let imageSizeBytes = 0;
      let otherSizeBytes = 0;
      let jsRequests = 0;
      let cssRequests = 0;
      let imageRequests = 0;
      let totalRequests = 0;

      page.on('response', (response: any) => {
        try {
          const resUrl = response.url();
          const contentType = response.headers()['content-type'] || '';
          const sizeHeader = response.headers()['content-length'];
          let size = sizeHeader ? Number.parseInt(sizeHeader, 10) : 0;

          totalRequests++;
          if (contentType.includes('javascript') || resUrl.endsWith('.js')) {
            jsRequests++;
            jsSizeBytes += size;
          } else if (contentType.includes('css') || resUrl.endsWith('.css')) {
            cssRequests++;
            cssSizeBytes += size;
          } else if (contentType.includes('image') || /\.(jpg|jpeg|png|gif|webp|svg)/i.test(resUrl)) {
            imageRequests++;
            imageSizeBytes += size;
          } else if (contentType.includes('html')) {
            pageSizeBytes += size;
          } else {
            otherSizeBytes += size;
          }
        } catch {
          // ignore closed connection errors
        }
      });

      const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      const loadTimeMs = Date.now() - startTime;

      if (!response) {
        await browser.close();
        return {
          url,
          statusCode: 0,
          loadTimeMs,
          contentType: 'none',
          error: 'No response from page load',
        };
      }

      const html = await page.content();
      const statusCode = response.status();
      const headers = response.headers();
      const contentType = headers['content-type'] || 'text/html';

      if (!pageSizeBytes && html) {
        pageSizeBytes = Buffer.byteLength(html, 'utf8');
      }

      await browser.close();

      return {
        url,
        html,
        statusCode,
        loadTimeMs,
        contentType,
        resources: {
          pageSizeBytes,
          jsSizeBytes,
          cssSizeBytes,
          imageSizeBytes,
          otherSizeBytes,
          jsRequests,
          cssRequests,
          imageRequests,
          totalRequests,
        },
      };
    } catch (err: any) {
      return {
        url,
        statusCode: 0,
        loadTimeMs: Date.now() - startTime,
        contentType: 'none',
        error: `Playwright error: ${err.message}`,
      };
    }
  }
}
