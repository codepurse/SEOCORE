import { createServer } from 'node:net';
import { Crawler, CrawlResult, SeoConfig, RedirectHop } from '@seocore/sdk';

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate browser debug port')));
        return;
      }

      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

// ==========================================
// LIGHTHOUSE CRAWLER (PERFORMANCE AUDIT)
// ==========================================

export class LighthouseCrawler implements Crawler {
  private readonly httpCrawler = new HttpCrawler();
  private browser: any = null;
  private port: number | null = null;
  private lighthouseModule: any = null;
  private playwrightModule: any = null;
  private initialized = false;

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // @ts-ignore
      this.lighthouseModule = await import('lighthouse');
      // @ts-ignore
      this.playwrightModule = await import('playwright');
      
      this.port = await getAvailablePort();
      this.browser = await this.playwrightModule.chromium.launch({
        headless: true,
        args: [
          `--remote-debugging-port=${this.port}`,
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
      
      this.initialized = true;
    } catch (err) {
      console.warn(`[Crawler] Lighthouse or Playwright not installed. Falling back to HTTP Crawler.`);
      throw err;
    }
  }

  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    const startTime = Date.now();
    try {
      await this.initialize();
      
      // Fetch page HTML first using HttpCrawler
      const httpResult = await this.httpCrawler.crawl(url, config);

      // Run Lighthouse with optimized options
      const options = {
        logLevel: 'silent' as const,
        output: 'json' as const,
        onlyCategories: ['performance'],
        onlyAudits: [
          'largest-contentful-paint',
          'cumulative-layout-shift',
          'interaction-to-next-paint',
          'total-blocking-time',
          'total-byte-weight',
          'network-requests',
        ],
        port: this.port!,
        throttlingMethod: 'provided',
        throttling: {
          rttMs: 40,
          throughputKbps: 10 * 1024,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
        screenEmulation: { disabled: true },
        formFactor: 'desktop',
      };
      
      const runnerResult = await this.lighthouseModule.default(url, options);
      
      // Extract performance metrics
      const lhr = runnerResult?.lhr as any;
      const coreWebVitals = {
        lcp: lhr?.audits?.['largest-contentful-paint']?.numericValue || 0,
        cls: lhr?.audits?.['cumulative-layout-shift']?.numericValue || 0,
        inp: lhr?.audits?.['interaction-to-next-paint']?.numericValue || 
             lhr?.audits?.['total-blocking-time']?.numericValue || 0,
      };
      
      const performanceScore = lhr?.categories?.performance?.score || 0;
      
      // Extract resource sizes
      const resources = {
        pageSizeBytes: httpResult.html ? Buffer.byteLength(httpResult.html, 'utf8') : 0,
        jsSizeBytes: lhr?.audits?.['total-byte-weight']?.details?.items?.find((item: any) => item.resourceType === 'Script')?.transferSize || 0,
        cssSizeBytes: lhr?.audits?.['total-byte-weight']?.details?.items?.find((item: any) => item.resourceType === 'Stylesheet')?.transferSize || 0,
        imageSizeBytes: lhr?.audits?.['total-byte-weight']?.details?.items?.find((item: any) => item.resourceType === 'Image')?.transferSize || 0,
        otherSizeBytes: 0,
        jsRequests: 0,
        cssRequests: 0,
        imageRequests: 0,
        totalRequests: lhr?.audits?.['network-requests']?.details?.items?.length || 0,
      };

      return {
        url,
        html: httpResult.html,
        statusCode: httpResult.statusCode,
        loadTimeMs: httpResult.loadTimeMs,
        contentType: httpResult.contentType,
        headers: httpResult.headers,
        redirectChain: httpResult.redirectChain,
        resources,
        lighthouse: {
          score: performanceScore,
          coreWebVitals,
        },
      };
    } catch (err: any) {
      // If Lighthouse fails, try to recover gracefully
      if (!this.initialized) {
        return this.httpCrawler.crawl(url, config);
      }
      return {
        url,
        statusCode: 0,
        loadTimeMs: Date.now() - startTime,
        contentType: 'none',
        error: `Lighthouse error: ${err.message}`,
      };
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.initialized = false;
    }
  }
}

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
// LLMS.TXT PARSER
// ==========================================

export interface LlmsTxtSection {
  userAgents: string[];
  allows: string[];
  disallows: string[];
}

export interface LlmsTxtParseResult {
  sections: LlmsTxtSection[];
  totalAllowRules: number;
  totalDisallowRules: number;
  parseErrors: string[];
}

export class LlmsTxtParser {
  static parse(content: string): LlmsTxtParseResult {
    const sections: LlmsTxtSection[] = [];
    const errors: string[] = [];
    let currentSection: LlmsTxtSection | null = null;
    let totalAllows = 0;
    let totalDisallows = 0;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        errors.push(`Line ${i + 1}: Invalid format (missing colon)`);
        continue;
      }

      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();

      if (key === 'user-agent') {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          userAgents: [value.toLowerCase()],
          allows: [],
          disallows: [],
        };
      } else if (key === 'allow') {
        if (currentSection) {
          currentSection.allows.push(value);
          totalAllows++;
        } else {
          errors.push(`Line ${i + 1}: Allow rule before any User-agent`);
        }
      } else if (key === 'disallow') {
        if (currentSection) {
          currentSection.disallows.push(value);
          totalDisallows++;
        } else {
          errors.push(`Line ${i + 1}: Disallow rule before any User-agent`);
        }
      } else {
        errors.push(`Line ${i + 1}: Unknown directive "${key}"`);
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return {
      sections,
      totalAllowRules: totalAllows,
      totalDisallowRules: totalDisallows,
      parseErrors: errors,
    };
  }

  static getBotStatus(
    parseResult: LlmsTxtParseResult,
    botName: string
  ): { status: 'allowed' | 'disallowed' | 'implicit'; allowedPaths: string[]; blockedPaths: string[] } {
    const botLower = botName.toLowerCase();
    let targetSection: LlmsTxtSection | null = null;
    let wildcardSection: LlmsTxtSection | null = null;

    for (const section of parseResult.sections) {
      for (const ua of section.userAgents) {
        if (ua === botLower) {
          targetSection = section;
          break;
        }
        if (ua === '*') {
          wildcardSection = section;
        }
      }
      if (targetSection) break;
    }

    const sectionToUse = targetSection || wildcardSection;

    if (!sectionToUse) {
      return { status: 'implicit', allowedPaths: [], blockedPaths: [] };
    }

    return {
      status: sectionToUse.allows.length > 0 ? 'allowed' : (sectionToUse.disallows.length > 0 ? 'disallowed' : 'implicit'),
      allowedPaths: [...sectionToUse.allows],
      blockedPaths: [...sectionToUse.disallows],
    };
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
        // Capture response headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          url: currentUrl,
          html,
          statusCode: response.status,
          loadTimeMs,
          contentType,
          headers,
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
      // Get raw static HTML first using HttpCrawler
      let rawHtml: string | undefined;
      try {
        const httpResult = await this.httpCrawler.crawl(url, config);
        if (httpResult.statusCode === 200) {
          rawHtml = httpResult.html;
        }
      } catch {
        // ignore
      }

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
        rawHtml,
        statusCode,
        loadTimeMs,
        contentType,
        headers,
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
