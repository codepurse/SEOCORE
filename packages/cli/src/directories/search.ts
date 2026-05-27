import axios, { type AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { chromium, type BrowserContext } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import type {
  DirectoryDefinition,
  DirectorySearchHit,
  DirectorySearchSource,
  SourceBusinessProfile,
} from './types.js';

const SEARCH_TIMEOUT_MS = 20000;
const ENGINE_RETRY = 2;

export type ProviderMode = 'serpapi' | 'cascade' | 'playwright';

export interface DirectorySearchResponse {
  hits: DirectorySearchHit[];
  query: string;
  source: DirectorySearchSource;
}

interface EngineDescriptor {
  name: Exclude<DirectorySearchSource, 'website-link' | 'serpapi' | 'playwright'>;
  search: (query: string) => Promise<DirectorySearchHit[]>;
}

const CASCADE_ENGINES: EngineDescriptor[] = [
  { name: 'bing', search: searchViaBing },
  { name: 'brave', search: searchViaBrave },
  { name: 'mojeek', search: searchViaMojeek },
  { name: 'duckduckgo', search: searchViaDuckDuckGo },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
];

export class DirectorySearchClient {
  private context: BrowserContext | null = null;
  private mode: ProviderMode;
  private readonly apiKey?: string;
  private readonly headless: boolean;
  private readonly allowFallback: boolean;
  private searchQueue: Promise<any> = Promise.resolve();

  private constructor(
    mode: ProviderMode,
    apiKey: string | undefined,
    headless: boolean,
    allowFallback: boolean,
  ) {
    this.mode = mode;
    this.apiKey = apiKey;
    this.headless = headless;
    this.allowFallback = allowFallback;
  }

  static async create(
    provider: 'auto' | 'serpapi' | 'duckduckgo' | 'cascade' | 'playwright' = 'auto',
    headless = true,
  ): Promise<DirectorySearchClient> {
    const apiKey = process.env.SERPAPI_KEY;

    if (provider === 'serpapi') {
      if (!apiKey) throw new Error('SERPAPI_KEY is required when --provider serpapi is used.');
      return new DirectorySearchClient('serpapi', apiKey, headless, false);
    }

    if (provider === 'auto' && apiKey) {
      return new DirectorySearchClient('serpapi', apiKey, headless, false);
    }

    if (provider === 'playwright') {
      const client = new DirectorySearchClient('playwright', undefined, headless, false);
      await client.ensureBrowser();
      return client;
    }

    return new DirectorySearchClient('cascade', undefined, headless, provider === 'auto');
  }

  getMode(): ProviderMode {
    return this.mode;
  }

  async search(definition: DirectoryDefinition, profile: SourceBusinessProfile, targetUrl: string): Promise<DirectorySearchResponse> {
    const query = buildDirectorySearchQuery(definition, profile, targetUrl);

    if (this.mode === 'serpapi') {
      return {
        hits: await searchViaSerpApi(query, this.apiKey!),
        query,
        source: 'serpapi',
      };
    }

    if (this.mode === 'cascade') {
      const cascade = await runCascade(query);
      if (cascade) return { hits: cascade.hits, query, source: cascade.source };

      if (!this.allowFallback) {
        throw new Error('All HTTP search engines (Bing, Brave, Mojeek, DuckDuckGo) blocked or returned no results.');
      }
      this.mode = 'playwright';
    }

    const hits = await new Promise<DirectorySearchHit[]>((resolve, reject) => {
      this.searchQueue = this.searchQueue
        .then(async () => {
          try {
            const res = await this.searchViaPlaywright(query);
            resolve(res);
          } catch (err) {
            reject(err);
          }
        })
        .catch(() => {});
    });

    return { hits, query, source: 'playwright' };
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.context) return;

    const profileDir = path.join(os.homedir(), '.seocore', 'directories-search-profile');
    const launchOptions = {
      headless: this.headless,
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      args: ['--disable-blink-features=AutomationControlled'],
    };

    try {
      this.context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', ...launchOptions });
    } catch {
      this.context = await chromium.launchPersistentContext(profileDir, launchOptions);
    }
  }

  private async searchViaPlaywright(query: string): Promise<DirectorySearchHit[]> {
    await this.ensureBrowser();
    if (!this.context) return [];

    const page = await this.context.newPage();
    try {
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&cc=us&setlang=en`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      try {
        await page.waitForSelector('#b_results, li.b_algo', { timeout: 8000 });
      } catch {
        // ignore
      }

      const blocked = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('unusual traffic') || text.includes('verify you are human');
      });

      if (blocked) {
        throw new Error(
          this.headless
            ? 'Bing captcha in headless mode. Use --show or set SERPAPI_KEY for reliable live search.'
            : 'Bing captcha detected. Solve in browser, then rerun command.'
        );
      }

      const hits = await page.evaluate(() => {
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const seen = new Set<string>();
        const nodes = Array.from(document.querySelectorAll('li.b_algo'));

        for (const node of nodes) {
          const anchor = node.querySelector('h2 a') as HTMLAnchorElement | null;
          if (!anchor) continue;
          const href = anchor.href;
          if (!href || !href.startsWith('http') || href.includes('bing.com/ck/') || seen.has(href)) continue;
          seen.add(href);
          const snippet = (node.querySelector('.b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4')?.textContent || '').trim();
          results.push({ title: anchor.textContent?.trim() || '', url: href, snippet });
          if (results.length >= 10) break;
        }

        return results;
      });

      return hits.map((hit, index) => ({
        ...hit,
        domain: extractDomain(hit.url),
        position: index + 1,
        source: 'playwright' as const,
      }));
    } finally {
      await page.close().catch(() => {});
    }
  }
}

async function runCascade(query: string): Promise<{ hits: DirectorySearchHit[]; source: DirectorySearchSource } | null> {
  const errors: string[] = [];

  for (const engine of CASCADE_ENGINES) {
    try {
      const hits = await engine.search(query);
      if (hits.length > 0) return { hits, source: engine.name };
      errors.push(`${engine.name}: empty results`);
    } catch (err: any) {
      errors.push(`${engine.name}: ${err?.message || 'error'}`);
      if (!isBlockedError(err) && !isNetworkError(err)) {
        // keep trying other engines anyway
      }
    }
  }

  return null;
}

function buildDirectorySearchQuery(definition: DirectoryDefinition, profile: SourceBusinessProfile, targetUrl: string): string {
  const domainClause = definition.domains.length === 1
    ? `site:${definition.domains[0]}`
    : `(${definition.domains.map(domain => `site:${domain}`).join(' OR ')})`;

  const parts = [domainClause];
  if (profile.name) parts.push(`"${profile.name}"`);

  const phone = toPhoneQuery(profile.phone);
  if (phone) parts.push(`"${phone}"`);

  const street = toStreetQuery(profile.address);
  if (street) {
    parts.push(`"${street}"`);
  } else {
    parts.push(`"${extractDomain(targetUrl)}"`);
  }

  return parts.join(' ');
}

async function searchViaSerpApi(query: string, apiKey: string): Promise<DirectorySearchHit[]> {
  const res = await axios.get('https://serpapi.com/search.json', {
    params: { engine: 'google', q: query, num: 10, hl: 'en', gl: 'us', api_key: apiKey },
    timeout: SEARCH_TIMEOUT_MS,
  });

  const raw = Array.isArray(res.data?.organic_results) ? res.data.organic_results : [];
  return raw.slice(0, 10).map((entry: any, index: number) => ({
    title: entry.title || '',
    url: entry.link || '',
    snippet: entry.snippet || '',
    domain: extractDomain(entry.link || ''),
    position: entry.position ?? index + 1,
    source: 'serpapi' as const,
  }));
}

// ─── Bing ────────────────────────────────────────────────────────────────────
async function searchViaBing(query: string): Promise<DirectorySearchHit[]> {
  return retryEngine(async attempt => {
    const res = await httpGet('https://www.bing.com/search', {
      params: { q: query, count: 20, form: 'QBLH', cc: 'us', setlang: 'en' },
      headers: browserHeaders('https://www.bing.com/', attempt),
    });

    assertOk(res.status);
    const html = typeof res.data === 'string' ? res.data : '';
    return parseBingHtml(html);
  });
}

function parseBingHtml(html: string): DirectorySearchHit[] {
  const $ = cheerio.load(html);
  const hits: DirectorySearchHit[] = [];
  const seen = new Set<string>();

  $('li.b_algo').each((index, el) => {
    if (hits.length >= 10) return false;
    const anchor = $(el).find('h2 a').first();
    const href = anchor.attr('href') || '';
    if (!href || !/^https?:/.test(href) || href.includes('bing.com/ck/') || seen.has(href)) return;
    seen.add(href);
    const title = anchor.text().trim();
    const snippet = $(el).find('.b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4').first().text().trim();
    hits.push({ title, url: href, snippet, domain: extractDomain(href), position: index + 1, source: 'bing' });
  });

  return hits;
}

// ─── Brave ───────────────────────────────────────────────────────────────────
async function searchViaBrave(query: string): Promise<DirectorySearchHit[]> {
  return retryEngine(async attempt => {
    const res = await httpGet('https://search.brave.com/search', {
      params: { q: query, source: 'web' },
      headers: browserHeaders('https://search.brave.com/', attempt),
    });

    assertOk(res.status);
    const html = typeof res.data === 'string' ? res.data : '';
    return parseBraveHtml(html);
  });
}

function parseBraveHtml(html: string): DirectorySearchHit[] {
  const $ = cheerio.load(html);
  const hits: DirectorySearchHit[] = [];
  const seen = new Set<string>();

  const selectors = '#results .snippet, [data-type="web"], .web-result, .fdb, div.snippet';
  $(selectors).each((index, el) => {
    if (hits.length >= 10) return false;
    const anchor = $(el).find('a[href^="http"]').first();
    const href = anchor.attr('href') || '';
    if (!href || seen.has(href)) return;
    if (/search\.brave\.com/.test(href)) return;
    const title = ($(el).find('.title, .snippet-title, .h, h3, .url').first().text().trim()) || anchor.text().trim();
    const snippet = $(el).find('.snippet-description, .snippet-content, .desc, p').first().text().trim();
    seen.add(href);
    hits.push({ title, url: href, snippet, domain: extractDomain(href), position: index + 1, source: 'brave' });
  });

  if (hits.length === 0) {
    $('a[href^="http"]').each((index, el) => {
      if (hits.length >= 10) return false;
      const href = $(el).attr('href') || '';
      if (!href || seen.has(href) || /search\.brave\.com|brave\.com\/(?!.*\?q)/.test(href)) return;
      const title = $(el).text().trim();
      if (!title || title.length < 3) return;
      seen.add(href);
      hits.push({ title, url: href, snippet: '', domain: extractDomain(href), position: index + 1, source: 'brave' });
    });
  }

  return hits;
}

// ─── Mojeek ──────────────────────────────────────────────────────────────────
async function searchViaMojeek(query: string): Promise<DirectorySearchHit[]> {
  return retryEngine(async attempt => {
    const res = await httpGet('https://www.mojeek.com/search', {
      params: { q: query, fmt: 'html' },
      headers: browserHeaders('https://www.mojeek.com/', attempt),
    });

    assertOk(res.status);
    const html = typeof res.data === 'string' ? res.data : '';
    return parseMojeekHtml(html);
  });
}

function parseMojeekHtml(html: string): DirectorySearchHit[] {
  const $ = cheerio.load(html);
  const hits: DirectorySearchHit[] = [];
  const seen = new Set<string>();

  $('ul.results-standard li, .results-standard li, .results li, ol.results li').each((index, el) => {
    if (hits.length >= 10) return false;
    const anchor = $(el).find('a.ob, a.title, h2 a, a.url').first();
    const href = anchor.attr('href') || '';
    if (!href || !/^https?:/.test(href) || seen.has(href)) return;
    seen.add(href);
    const title = anchor.text().trim() || $(el).find('h2').first().text().trim();
    const snippet = $(el).find('p.s, .s, .desc').first().text().trim();
    hits.push({ title, url: href, snippet, domain: extractDomain(href), position: index + 1, source: 'mojeek' });
  });

  return hits;
}

// ─── DuckDuckGo (last in cascade) ────────────────────────────────────────────
const DDG_ENDPOINTS = [
  'https://html.duckduckgo.com/html/',
  'https://lite.duckduckgo.com/lite/',
];

async function searchViaDuckDuckGo(query: string): Promise<DirectorySearchHit[]> {
  return retryEngine(async attempt => {
    const endpoint = DDG_ENDPOINTS[attempt % DDG_ENDPOINTS.length];
    const res = await axios.post(
      endpoint,
      new URLSearchParams({ q: query, kl: 'us-en' }).toString(),
      {
        timeout: SEARCH_TIMEOUT_MS,
        headers: {
          ...browserHeaders('https://duckduckgo.com/', attempt),
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://duckduckgo.com',
        },
        validateStatus: status => status < 500,
      },
    );

    assertOk(res.status);
    const html = typeof res.data === 'string' ? res.data : '';
    if (/anomaly|unusual traffic|captcha/i.test(html)) {
      throw new Error('Request failed with status code 403');
    }
    return parseDuckDuckGoHtml(html);
  });
}

function parseDuckDuckGoHtml(html: string): DirectorySearchHit[] {
  const $ = cheerio.load(html);
  const hits: DirectorySearchHit[] = [];
  const seen = new Set<string>();

  $('.result, .web-result').each((index, el) => {
    if (hits.length >= 10) return false;
    const anchor = $(el).find('.result__title a, a.result__a, h2 a').first();
    const href = anchor.attr('href') || '';
    const url = resolveDuckDuckGoUrl(href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const title = anchor.text().trim();
    const snippet = $(el).find('.result__snippet, .snippet').first().text().trim();
    hits.push({ title, url, snippet, domain: extractDomain(url), position: index + 1, source: 'duckduckgo' });
  });

  if (hits.length === 0) {
    $('a').each((index, el) => {
      if (hits.length >= 10) return false;
      const href = $(el).attr('href') || '';
      if (!href || !/uddg=/.test(href)) return;
      const url = resolveDuckDuckGoUrl(href);
      if (!url || seen.has(url)) return;
      seen.add(url);
      hits.push({
        title: $(el).text().trim(),
        url,
        snippet: '',
        domain: extractDomain(url),
        position: index + 1,
        source: 'duckduckgo',
      });
    });
  }

  return hits;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function retryEngine(fn: (attempt: number) => Promise<DirectorySearchHit[]>): Promise<DirectorySearchHit[]> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= ENGINE_RETRY; attempt += 1) {
    try {
      const hits = await fn(attempt);
      if (hits.length > 0) return hits;
      lastErr = new Error('empty results');
    } catch (err: any) {
      lastErr = err;
      if (!isBlockedError(err) && !isNetworkError(err)) throw err;
      await sleep(300 + Math.random() * 700);
    }
  }
  throw lastErr ?? new Error('engine failed');
}

async function httpGet(url: string, config: AxiosRequestConfig) {
  return axios.get(url, {
    timeout: SEARCH_TIMEOUT_MS,
    validateStatus: status => status < 500,
    ...config,
  });
}

function browserHeaders(referer: string, attempt = 0): Record<string, string> {
  const userAgent = USER_AGENTS[attempt % USER_AGENTS.length];
  return {
    'user-agent': userAgent,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br',
    referer,
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'cache-control': 'max-age=0',
  };
}

function assertOk(status: number): void {
  if (status === 200) return;
  if (status === 403 || status === 429 || status === 202 || status === 503) {
    throw new Error(`Request failed with status code ${status}`);
  }
  if (status >= 400) {
    throw new Error(`Request failed with status code ${status}`);
  }
}

function isBlockedError(err: any): boolean {
  const status = err?.response?.status;
  if (status === 403 || status === 429 || status === 202 || status === 503) return true;
  const msg = String(err?.message || '');
  return /status code (403|429|202|503)/.test(msg);
}

function isNetworkError(err: any): boolean {
  const msg = String(err?.message || '');
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

function resolveDuckDuckGoUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const parsed = new URL(href);
      const uddg = parsed.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : href;
    } catch {
      return href;
    }
  }

  try {
    const parsed = new URL(href, 'https://html.duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return '';
  }
}

function toPhoneQuery(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length > 10 ? digits.slice(-10) : digits;
  if (normalized.length !== 10) return null;
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
}

function toStreetQuery(address: string): string | null {
  if (!address || address === 'No Address Detected') return null;
  const street = address.split(',')[0]?.trim();
  return street || null;
}
