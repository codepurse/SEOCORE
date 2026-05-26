import { Crawler, SeoConfig, RenderedFetchResult, RenderedCrawlOptions, ConsoleMessage, FailedRequest, BlockedResource, RedirectHop } from '@seocore/sdk';
import { BrowserPool } from './browser-pool.js';
import { HttpCrawler } from './index.js';
import { FilesystemCrawlCache } from './cache/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

interface RenderedCacheEntry {
  url: string;
  finalUrl: string;
  rawHtml: string;
  renderedHtml: string;
  statusCode: number;
  rawHeaders: Record<string, string>;
  bytes: { raw: number; rendered: number };
  timings: { rawFetchMs: number; renderTotalMs: number; domContentLoadedMs?: number; loadEventMs?: number; networkIdleMs?: number };
  consoleMessages: ConsoleMessage[];
  failedRequests: FailedRequest[];
  blockedRequests: BlockedResource[];
  redirectChain: RedirectHop[];
  crawledAt: string;
  expiresAt: string;
}

export class RenderedCrawler implements Crawler {
  private httpCrawler = new HttpCrawler();
  private browserPool = BrowserPool.getInstance();
  private cache: FilesystemCrawlCache | null = null;
  private cacheDir: string | null = null;
  private renderedCacheDir: string | null = null;

  constructor(cacheDir?: string) {
    if (cacheDir) {
      this.cacheDir = cacheDir;
      this.renderedCacheDir = path.join(cacheDir, 'rendered');
      this.cache = new FilesystemCrawlCache(cacheDir);
    }
  }

  private async getFromCache(url: string): Promise<RenderedCacheEntry | null> {
    if (!this.renderedCacheDir) {
      return null;
    }
    try {
      const cacheKey = crypto.createHash('sha256').update(url).digest('hex');
      const cacheFile = path.join(this.renderedCacheDir, `${cacheKey}.json`);
      if (!fs.existsSync(cacheFile)) {
        return null;
      }
      const content = await fs.promises.readFile(cacheFile, 'utf8');
      const entry: RenderedCacheEntry = JSON.parse(content);
      if (new Date(entry.expiresAt) < new Date()) {
        await fs.promises.unlink(cacheFile);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  private async setToCache(url: string, entry: RenderedCacheEntry): Promise<void> {
    if (!this.renderedCacheDir) {
      return;
    }
    try {
      await fs.promises.mkdir(this.renderedCacheDir, { recursive: true });
      const cacheKey = crypto.createHash('sha256').update(url).digest('hex');
      const cacheFile = path.join(this.renderedCacheDir, `${cacheKey}.json`);
      await fs.promises.writeFile(cacheFile, JSON.stringify(entry, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

  async crawlRendered(url: string, config: SeoConfig, options: RenderedCrawlOptions = {}): Promise<RenderedFetchResult> {
    const cacheMaxAge = config.cacheMaxAge ?? 86400;
    const cached = await this.getFromCache(url);
    if (cached) {
      return cached;
    }

    const rawStartTime = Date.now();
    const httpResult = await this.httpCrawler.crawl(url, config);
    const rawFetchMs = Date.now() - rawStartTime;

    const { browser } = await this.browserPool.acquireBrowser({ needDebugPort: false });
    const context = await browser.newContext({
      userAgent: options.userAgent ?? 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore; Playwright)',
      viewport: options.viewport ?? { width: 1280, height: 720 },
      extraHTTPHeaders: options.extraHttpHeaders ?? {},
      ignoreHTTPSErrors: options.ignoreSslErrors ?? false,
    });
    const page = await context.newPage();

    const consoleMessages: ConsoleMessage[] = [];
    const failedRequests: FailedRequest[] = [];
    const blockedRequests: BlockedResource[] = [];
    let domContentLoadedMs: number | undefined;
    let loadEventMs: number | undefined;
    let networkIdleMs: number | undefined;

    page.on('console', (msg: any) => {
      consoleMessages.push({
        level: msg.type(),
        text: msg.text(),
        url: msg.location().url,
        line: msg.location().lineNumber,
      });
    });

    page.on('requestfailed', (req: any) => {
      failedRequests.push({
        url: req.url(),
        method: req.method(),
        failure: req.failure()?.errorText,
        resourceType: req.resourceType(),
      });
    });

    page.on('domcontentloaded', () => {
      domContentLoadedMs = Date.now();
    });

    page.on('load', () => {
      loadEventMs = Date.now();
    });

    const renderStartTime = Date.now();

    const response = await page.goto(url, {
      waitUntil: options.waitEvent ?? 'networkidle',
      timeout: options.timeoutMs ?? 30000,
    });

    if (options.waitExtraMs) {
      await page.waitForTimeout(options.waitExtraMs);
    }

    const renderTotalMs = Date.now() - renderStartTime;
    networkIdleMs = Date.now();

    const renderedHtml = await page.content();
    const rawHtml = httpResult.html ?? '';
    const statusCode = response?.status() ?? httpResult.statusCode;
    const rawHeaders: Record<string, string> = httpResult.headers ?? {};
    const bytes = {
      raw: Buffer.byteLength(rawHtml, 'utf8'),
      rendered: Buffer.byteLength(renderedHtml, 'utf8'),
    };
    const finalUrl = page.url();

    await context.close();

    const result: RenderedFetchResult = {
      url,
      finalUrl,
      rawHtml,
      renderedHtml,
      statusCode,
      rawHeaders,
      bytes,
      timings: {
        rawFetchMs,
        renderTotalMs,
        domContentLoadedMs: domContentLoadedMs ? domContentLoadedMs - rawStartTime : undefined,
        loadEventMs: loadEventMs ? loadEventMs - rawStartTime : undefined,
        networkIdleMs: networkIdleMs ? networkIdleMs - rawStartTime : undefined,
      },
      consoleMessages,
      failedRequests,
      blockedRequests,
      redirectChain: httpResult.redirectChain ?? [],
    };

    await this.setToCache(url, {
      ...result,
      crawledAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + cacheMaxAge * 1000).toISOString(),
    });

    return result;
  }

  async crawl(url: string, config: SeoConfig): Promise<any> {
    const result = await this.crawlRendered(url, config);
    return {
      url: result.finalUrl,
      html: result.renderedHtml,
      rawHtml: result.rawHtml,
      statusCode: result.statusCode,
      loadTimeMs: result.timings.renderTotalMs + result.timings.rawFetchMs,
      contentType: 'text/html',
      headers: result.rawHeaders,
      redirectChain: result.redirectChain,
    };
  }

  async close(): Promise<void> {
    await this.browserPool.releaseBrowser({ needDebugPort: false });
  }
}
