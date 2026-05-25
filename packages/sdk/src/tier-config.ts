import type { Category, Severity } from './index.js';

export type ExecutionTier = 'fast' | 'standard' | 'deep' | 'enterprise';

export interface CrawlSettings {
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  rateLimitMs: number;
  playwrightEnabled: boolean;
  lighthouseEnabled: boolean;
  lighthouseSampleRate: number;
}

export interface ModuleActivation {
  core: boolean;
  performance: boolean;
  mobile: boolean;
  aiVisibility: boolean;
  backlinks: boolean;
  hreflang: boolean;
}

export interface RuleFilter {
  categories: Category[];
  minSeverity: Severity;
  maxRulesPerCategory: number;
}

export interface ScoringSettings {
  algorithm: 'weighted' | 'strict' | 'custom';
  categoryWeights: Partial<Record<Category, number>>;
  floorScores: Partial<Record<Category, number>>;
}

export interface ExecutionTierConfig {
  tier: ExecutionTier;
  crawl: CrawlSettings;
  modules: ModuleActivation;
  ruleFilter: RuleFilter;
  scoring: ScoringSettings;
}

export const DEFAULT_CATEGORY_WEIGHTS: Record<Category, number> = {
  indexing: 0.15,
  metadata: 0.15,
  links: 0.10,
  seo: 0.10,
  ai_visibility: 0.15,
  accessibility: 0.10,
  performance: 0.10,
  mobile_seo: 0.15,
  backlink_intelligence: 0.10,
};

export const DEFAULT_FLOOR_SCORES: Record<Category, number> = {
  indexing: 20,
  metadata: 20,
  links: 20,
  seo: 20,
  ai_visibility: 20,
  accessibility: 20,
  performance: 20,
  mobile_seo: 20,
  backlink_intelligence: 20,
};

export const TIER_PRESETS: Record<ExecutionTier, ExecutionTierConfig> = {
  fast: {
    tier: 'fast',
    crawl: {
      maxDepth: 1,
      maxPages: 10,
      concurrency: 5,
      rateLimitMs: 50,
      playwrightEnabled: false,
      lighthouseEnabled: false,
      lighthouseSampleRate: 0,
    },
    modules: {
      core: true,
      performance: false,
      mobile: false,
      aiVisibility: false,
      backlinks: false,
      hreflang: false,
    },
    ruleFilter: {
      categories: ['seo', 'metadata', 'indexing', 'links'],
      minSeverity: 'error',
      maxRulesPerCategory: 10,
    },
    scoring: {
      algorithm: 'weighted',
      categoryWeights: {
        seo: 0.4,
        metadata: 0.3,
        indexing: 0.2,
        links: 0.1,
      },
      floorScores: {},
    },
  },
  standard: {
    tier: 'standard',
    crawl: {
      maxDepth: 3,
      maxPages: 100,
      concurrency: 3,
      rateLimitMs: 100,
      playwrightEnabled: false,
      lighthouseEnabled: false,
      lighthouseSampleRate: 0,
    },
    modules: {
      core: true,
      performance: true,
      mobile: true,
      aiVisibility: false,
      backlinks: false,
      hreflang: false,
    },
    ruleFilter: {
      categories: ['seo', 'metadata', 'indexing', 'links', 'performance', 'accessibility', 'mobile_seo'],
      minSeverity: 'warning',
      maxRulesPerCategory: 20,
    },
    scoring: {
      algorithm: 'weighted',
      categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
      floorScores: DEFAULT_FLOOR_SCORES,
    },
  },
  deep: {
    tier: 'deep',
    crawl: {
      maxDepth: 5,
      maxPages: 500,
      concurrency: 2,
      rateLimitMs: 250,
      playwrightEnabled: true,
      lighthouseEnabled: false,
      lighthouseSampleRate: 0.1,
    },
    modules: {
      core: true,
      performance: true,
      mobile: true,
      aiVisibility: true,
      backlinks: false,
      hreflang: true,
    },
    ruleFilter: {
      categories: ['seo', 'metadata', 'indexing', 'links', 'performance', 'accessibility', 'mobile_seo', 'ai_visibility'],
      minSeverity: 'info',
      maxRulesPerCategory: 50,
    },
    scoring: {
      algorithm: 'weighted',
      categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
      floorScores: DEFAULT_FLOOR_SCORES,
    },
  },
  enterprise: {
    tier: 'enterprise',
    crawl: {
      maxDepth: 10,
      maxPages: 5000,
      concurrency: 8,
      rateLimitMs: 50,
      playwrightEnabled: true,
      lighthouseEnabled: true,
      lighthouseSampleRate: 0.2,
    },
    modules: {
      core: true,
      performance: true,
      mobile: true,
      aiVisibility: true,
      backlinks: true,
      hreflang: true,
    },
    ruleFilter: {
      categories: ['seo', 'metadata', 'indexing', 'links', 'performance', 'accessibility', 'mobile_seo', 'ai_visibility', 'backlink_intelligence'],
      minSeverity: 'info',
      maxRulesPerCategory: 100,
    },
    scoring: {
      algorithm: 'weighted',
      categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
      floorScores: DEFAULT_FLOOR_SCORES,
    },
  },
};
