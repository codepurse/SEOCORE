import type { KeywordIntelligenceConfig } from '@seocore/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { MockKeywordMetricsProvider } from './mock.js';
import type {
  KeywordMetricsProvider,
  KeywordProviderMetrics,
  KeywordProviderRuntimeOptions,
  KeywordProviderStatus,
} from './types.js';

type EnrichmentResult = {
  metricsByKeyword: Map<string, KeywordProviderMetrics>;
  status: KeywordProviderStatus;
};

class HookKeywordMetricsProvider implements KeywordMetricsProvider {
  readonly name;

  constructor(name: 'dataforseo' | 'google-ads' | 'semrush' | 'ahrefs') {
    this.name = name;
  }

  async getKeywordMetrics(): Promise<Map<string, KeywordProviderMetrics>> {
    throw new Error(`${this.name} adapter hook not implemented yet. Configure "mock" or leave provider unset for heuristic-only mode.`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultStatus(config?: KeywordIntelligenceConfig): KeywordProviderStatus {
  if (!config?.provider) {
    return {
      status: 'not-configured',
      enrichedKeywords: 0,
      cacheHits: 0,
      warnings: [],
    };
  }

  return {
    configuredProvider: config.provider,
    activeProvider: config.provider,
    status: 'fallback',
    enrichedKeywords: 0,
    cacheHits: 0,
    warnings: [],
  };
}

function createProvider(config?: KeywordIntelligenceConfig): KeywordMetricsProvider | null {
  switch (config?.provider) {
    case undefined:
      return null;
    case 'mock':
      return new MockKeywordMetricsProvider();
    case 'dataforseo':
    case 'google-ads':
    case 'semrush':
    case 'ahrefs':
      return new HookKeywordMetricsProvider(config.provider);
  }
}

function ensureCacheDir(rootCacheDir?: string): string | null {
  if (!rootCacheDir) return null;
  const cacheDir = path.resolve(rootCacheDir, 'keyword-metrics');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

function cacheFilePath(cacheDir: string, providerName: string, lang: string, country: string, keyword: string): string {
  const safeKeyword = Buffer.from(`${providerName}:${lang}:${country}:${keyword}`).toString('base64url');
  return path.join(cacheDir, `${safeKeyword}.json`);
}

function readCacheEntry(
  cacheDir: string | null,
  providerName: string,
  keyword: string,
  lang: string,
  country: string,
  cacheTtlSeconds: number,
): KeywordProviderMetrics | null {
  if (!cacheDir) return null;
  const filePath = cacheFilePath(cacheDir, providerName, lang, country, keyword);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as KeywordProviderMetrics;
    const fetchedAt = Date.parse(raw.fetchedAt);
    if (Number.isNaN(fetchedAt)) return null;
    if (Date.now() - fetchedAt > cacheTtlSeconds * 1000) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeCacheEntry(
  cacheDir: string | null,
  providerName: string,
  keyword: string,
  lang: string,
  country: string,
  metrics: KeywordProviderMetrics,
): void {
  if (!cacheDir) return;
  const filePath = cacheFilePath(cacheDir, providerName, lang, country, keyword);
  fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2), 'utf8');
}

async function fetchBatchWithRetry(
  provider: KeywordMetricsProvider,
  keywords: string[],
  lang: string,
  country: string,
  retryCount: number,
): Promise<Map<string, KeywordProviderMetrics>> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await provider.getKeywordMetrics(keywords, lang, country);
    } catch (error) {
      lastError = error as Error;
      if (attempt < retryCount) {
        await sleep(250 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Unknown keyword metrics provider error');
}

export async function enrichKeywordsWithProviderMetrics(
  keywords: string[],
  lang: string,
  country: string,
  runtime: KeywordProviderRuntimeOptions = {},
): Promise<EnrichmentResult> {
  const config = runtime.config;
  const provider = createProvider(config);
  const status = defaultStatus(config);

  if (!provider) {
    return {
      metricsByKeyword: new Map<string, KeywordProviderMetrics>(),
      status,
    };
  }

  const batchSize = Math.max(1, config?.batchSize ?? 25);
  const retryCount = Math.max(0, runtime.retryCount ?? 2);
  const rateLimitMs = Math.max(0, config?.rateLimitMs ?? 0);
  const cacheTtlSeconds = Math.max(60, config?.cacheTtlSeconds ?? 86400);
  const cacheDir = ensureCacheDir(runtime.cacheDir);
  const metricsByKeyword = new Map<string, KeywordProviderMetrics>();
  const pendingKeywords: string[] = [];

  for (const keyword of keywords) {
    const cached = readCacheEntry(cacheDir, provider.name, keyword, lang, country, cacheTtlSeconds);
    if (cached) {
      metricsByKeyword.set(keyword, cached);
      status.cacheHits += 1;
      continue;
    }
    pendingKeywords.push(keyword);
  }

  try {
    for (let index = 0; index < pendingKeywords.length; index += batchSize) {
      const batch = pendingKeywords.slice(index, index + batchSize);
      const response = await fetchBatchWithRetry(provider, batch, lang, country, retryCount);

      for (const keyword of batch) {
        const metrics = response.get(keyword);
        if (!metrics) continue;
        metricsByKeyword.set(keyword, metrics);
        writeCacheEntry(cacheDir, provider.name, keyword, lang, country, metrics);
      }

      if (rateLimitMs > 0 && index + batchSize < pendingKeywords.length) {
        await sleep(rateLimitMs);
      }
    }

    status.status = 'enriched';
    status.activeProvider = provider.name;
    status.enrichedKeywords = metricsByKeyword.size;
    return { metricsByKeyword, status };
  } catch (error) {
    status.status = 'fallback';
    status.activeProvider = provider.name;
    status.warnings.push((error as Error).message);
    return {
      metricsByKeyword: new Map<string, KeywordProviderMetrics>(),
      status,
    };
  }
}
