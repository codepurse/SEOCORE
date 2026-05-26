import type { KeywordIntelligenceConfig } from '@seocore/sdk';

export type KeywordProviderName = 'mock' | 'dataforseo' | 'google-ads' | 'semrush' | 'ahrefs';

export interface KeywordProviderMetrics {
  searchVolume?: number;
  keywordDifficulty?: number;
  cpc?: number;
  competition?: number;
  provider: KeywordProviderName;
  fetchedAt: string;
}

export interface KeywordProviderStatus {
  configuredProvider?: KeywordProviderName;
  activeProvider?: KeywordProviderName;
  status: 'not-configured' | 'enriched' | 'fallback' | 'error';
  enrichedKeywords: number;
  cacheHits: number;
  warnings: string[];
}

export interface KeywordMetricsProvider {
  readonly name: KeywordProviderName;
  getKeywordMetrics(keywords: string[], lang: string, country: string): Promise<Map<string, KeywordProviderMetrics>>;
}

export interface KeywordProviderRuntimeOptions {
  config?: KeywordIntelligenceConfig;
  cacheDir?: string;
  retryCount?: number;
}
