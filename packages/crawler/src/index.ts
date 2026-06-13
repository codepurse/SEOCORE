import { Crawler, CrawlResult, SeoConfig, RedirectHop } from '@seocore/sdk';
import { FilesystemCrawlCache, CrawlCacheEntry } from './cache/index.js';
import { BrowserPool } from './browser-pool.js';

// ==========================================
// RESOURCE WEIGHT MEASUREMENT (HTTP MODE)
// ==========================================

/** Per-asset byte estimates used as a fallback when a real Content-Length is unavailable. */
const ASSET_ESTIMATE_BYTES = { js: 35000, css: 15000, img: 60000 };
const MAX_MEASURED_ASSETS_PER_TYPE = 40;
const ASSET_HEAD_TIMEOUT_MS = 8000;
const ASSET_HEAD_CONCURRENCY = 6;

interface ExtractedAssets {
  js: string[];
  css: string[];
  img: string[];
}

/** Lightweight, dependency-free extraction of asset URLs for byte-weight measurement. */
export function extractAssetUrls(html: string, baseUrl: string): ExtractedAssets {
  const resolve = (raw: string): string | null => {
    try {
      const u = new URL(raw, baseUrl);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch {
      return null;
    }
  };

  const js = new Set<string>();
  const css = new Set<string>();
  const img = new Set<string>();

  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const imgRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const linkRe = /<link\b[^>]*>/gi;
  const hrefRe = /\bhref\s*=\s*["']([^"']+)["']/i;
  const relRe = /\brel\s*=\s*["']([^"']+)["']/i;

  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const r = resolve(m[1]);
    if (r) js.add(r);
  }
  while ((m = imgRe.exec(html)) !== null) {
    const r = resolve(m[1]);
    if (r) img.add(r);
  }
  while ((m = linkRe.exec(html)) !== null) {
    const rel = relRe.exec(m[0])?.[1]?.toLowerCase() ?? '';
    if (!rel.includes('stylesheet')) continue;
    const href = hrefRe.exec(m[0])?.[1];
    const r = href ? resolve(href) : null;
    if (r) css.add(r);
  }

  return { js: [...js], css: [...css], img: [...img] };
}

// ==========================================
// LIGHTHOUSE CRAWLER (PERFORMANCE AUDIT)
// ==========================================

export class LighthouseCrawler implements Crawler {
  static async isAvailable(): Promise<boolean> {
    try { await import('lighthouse'); return true; } catch { return false; }
  }

  private readonly httpCrawler = new HttpCrawler();
  private lighthouseModule: any = null;
  private browserPool = BrowserPool.getInstance();
  private browserRef: { needDebugPort: boolean } = { needDebugPort: true };

  private async initialize(): Promise<{
    browser: any;
    port: number;
    lighthouseModule: any;
  }> {
    if (!this.lighthouseModule) {
      // @ts-ignore
      this.lighthouseModule = await import('lighthouse');
    }
    const { browser, port } = await this.browserPool.acquireBrowser({ needDebugPort: true });
    if (!port) {
      throw new Error('Browser debug port not available');
    }
    return { browser, port, lighthouseModule: this.lighthouseModule };
  }

  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    const startTime = Date.now();
    try {
      const { port, lighthouseModule } = await this.initialize();
      
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
        port: port!,
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
      
      const runnerResult = await lighthouseModule.default(url, options);
      
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
      return this.httpCrawler.crawl(url, config);
    }
  }

  async close(): Promise<void> {
    await this.browserPool.releaseBrowser({ needDebugPort: true });
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
  private cache?: FilesystemCrawlCache;
  /** Shared across pages so common bundles (shared JS/CSS) are measured only once. */
  private readonly assetSizeCache = new Map<string, number | null>();

  constructor(cacheDir?: string) {
    if (cacheDir) {
      this.cache = new FilesystemCrawlCache(cacheDir);
    }
  }

  /** HEAD-probe a single asset for its real byte size; null when unavailable. Cached. */
  private async headSize(url: string): Promise<number | null> {
    const cached = this.assetSizeCache.get(url);
    if (cached !== undefined) return cached;

    let size: number | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ASSET_HEAD_TIMEOUT_MS);
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)' },
      });
      clearTimeout(timeoutId);
      const len = res.headers.get('content-length');
      if (len) {
        const n = Number.parseInt(len, 10);
        if (Number.isFinite(n) && n >= 0) size = n;
      }
    } catch {
      size = null;
    }
    this.assetSizeCache.set(url, size);
    return size;
  }

  /**
   * Measures real byte weights for same-origin assets via bounded, cached HEAD probes.
   * Cross-origin assets and probes without a Content-Length fall back to a per-type
   * estimate, so totals stay reasonable while same-origin weights are real.
   */
  private async measureResources(html: string, baseUrl: string): Promise<NonNullable<CrawlResult['resources']>> {
    const origin = new URL(baseUrl).origin;
    const { js, css, img } = extractAssetUrls(html, baseUrl);

    const measureType = async (urls: string[], estimate: number): Promise<number> => {
      let total = 0;
      const sameOrigin: string[] = [];
      for (const u of urls) {
        try {
          if (new URL(u).origin === origin) sameOrigin.push(u);
          else total += estimate; // cross-origin: estimate rather than probe third parties
        } catch {
          total += estimate;
        }
      }
      const toMeasure = sameOrigin.slice(0, MAX_MEASURED_ASSETS_PER_TYPE);
      total += Math.max(0, sameOrigin.length - toMeasure.length) * estimate; // overflow beyond cap: estimate

      for (let i = 0; i < toMeasure.length; i += ASSET_HEAD_CONCURRENCY) {
        const chunk = toMeasure.slice(i, i + ASSET_HEAD_CONCURRENCY);
        const sizes = await Promise.all(chunk.map(u => this.headSize(u)));
        for (const s of sizes) total += s == null ? estimate : s;
      }
      return total;
    };

    const [jsSizeBytes, cssSizeBytes, imageSizeBytes] = await Promise.all([
      measureType(js, ASSET_ESTIMATE_BYTES.js),
      measureType(css, ASSET_ESTIMATE_BYTES.css),
      measureType(img, ASSET_ESTIMATE_BYTES.img),
    ]);

    return {
      pageSizeBytes: Buffer.byteLength(html, 'utf8'),
      jsSizeBytes,
      cssSizeBytes,
      imageSizeBytes,
      otherSizeBytes: 0,
      jsRequests: js.length,
      cssRequests: css.length,
      imageRequests: img.length,
      totalRequests: 1 + js.length + css.length + img.length,
      measured: true,
    };
  }

  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    let currentUrl = url;
    const redirectChain: RedirectHop[] = [];
    const maxRedirects = 5;
    let attempts = 0;
    const maxAttempts = (config.retryCount ?? 2) + 1;

    // Check cache first
    if (this.cache) {
      const cachedEntry = await this.cache.get(currentUrl);
      if (cachedEntry) {
        // Validate with conditional request
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        };
        if (cachedEntry.etag) {
          headers['If-None-Match'] = cachedEntry.etag;
        }
        if (cachedEntry.lastModified) {
          headers['If-Modified-Since'] = cachedEntry.lastModified;
        }

        try {
          const response = await fetch(currentUrl, {
            method: 'HEAD',
            headers,
          });

          if (response.status === 304) {
            // Cache is valid, use cached body
            const html = await this.cache.readBody(cachedEntry);
            return {
              url: currentUrl,
              html,
              statusCode: cachedEntry.statusCode,
              loadTimeMs: 0,
              contentType: cachedEntry.contentType,
              redirectChain,
            };
          }
        } catch {
          // Ignore errors, fall through to fresh fetch
        }
      }
    }

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

        // Cache the result
        if (this.cache && response.status === 200) {
          const entry: CrawlCacheEntry = {
            url: currentUrl,
            statusCode: response.status,
            contentType,
            etag: response.headers.get('etag') ?? undefined,
            lastModified: response.headers.get('last-modified') ?? undefined,
            bodyHash: '',
            bodyPath: '',
            crawledAt: new Date().toISOString(),
          };
          // Calculate expiresAt from config (default 24h)
          const cacheMaxAge = config.cacheMaxAge ?? 86400;
          entry.expiresAt = new Date(Date.now() + cacheMaxAge * 1000).toISOString();
          
          await this.cache.set(currentUrl, entry, Buffer.from(html));
        }

        // Measure real asset byte weights (same-origin, bounded, cached) for the perf score.
        let resources: CrawlResult['resources'] | undefined;
        if (config.measureResources !== false && response.status === 200 && /html/i.test(contentType)) {
          try {
            resources = await this.measureResources(html, currentUrl);
          } catch {
            // Leave undefined so the analyzer falls back to its estimate.
          }
        }

        return {
          url: currentUrl,
          html,
          statusCode: response.status,
          loadTimeMs,
          contentType,
          headers,
          redirectChain,
          resources,
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
  static async isAvailable(): Promise<boolean> {
    try { await import('playwright'); return true; } catch { return false; }
  }

  private readonly httpCrawler = new HttpCrawler();
  private browserPool = BrowserPool.getInstance();

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

      const { browser, playwrightModule } = await this.browserPool.acquireBrowser({ needDebugPort: false });
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
        await context.close();
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

      await context.close();

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

  async close(): Promise<void> {
    await this.browserPool.releaseBrowser({ needDebugPort: false });
  }
}

export { RenderedCrawler } from './rendered-crawler.js';
export { CrawlerRegistry, type CrawlerFactory, createDefaultRegistry } from './registry.js';

