import { z } from 'zod';
import { SeoConfig, AuditPreset, BacklinkApiConfig, ExecutionTier, TIER_PRESETS, ExecutionTierConfig } from '@seocore/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Map old preset names to new execution tiers
const PRESET_TO_TIER: Record<AuditPreset, ExecutionTier> = {
  quick: 'fast',
  standard: 'standard',
  deep: 'deep',
  enterprise: 'enterprise',
};

const TIER_TO_PRESET: Record<ExecutionTier, AuditPreset> = {
  fast: 'quick',
  standard: 'standard',
  deep: 'deep',
  enterprise: 'enterprise',
};

// Define the schema using Zod
const BingBacklinkSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  apiKey: z.string().optional(),
  siteUrl: z.string().optional(),
  maxPages: z.number().int().positive().default(3),
}).optional();

const GscBacklinkSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  exportPath: z.string().optional(),
  maxRows: z.number().int().positive().default(5000),
}).optional();

const LogBacklinkSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  paths: z.array(z.string()).default([]),
  maxRows: z.number().int().positive().default(5000),
}).optional();

const BacklinkApiConfigSchema = z.object({
  provider: z.enum(['bing', 'custom']),
  bing: BingBacklinkSourceConfigSchema,
  gsc: GscBacklinkSourceConfigSchema,
  logs: LogBacklinkSourceConfigSchema,
}).optional();

const KeywordIntelligenceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['mock', 'dataforseo', 'google-ads', 'semrush', 'ahrefs']).optional(),
  apiKey: z.string().optional(),
  login: z.string().optional(),
  password: z.string().optional(),
  locale: z.string().optional(),
  region: z.string().optional(),
  rateLimitMs: z.number().int().nonnegative().default(0),
  batchSize: z.number().int().positive().default(25),
  cacheTtlSeconds: z.number().int().positive().default(86400),
}).optional();

const SeverityEnum = z.enum(['critical', 'error', 'warning', 'info']);
const ModuleActivationOverrideSchema = z.object({
  core: z.boolean().optional(),
  performance: z.boolean().optional(),
  mobile: z.boolean().optional(),
  aiVisibility: z.boolean().optional(),
  security: z.boolean().optional(),
  backlinks: z.boolean().optional(),
  hreflang: z.boolean().optional(),
}).optional();

export const SeoConfigSchema = z.object({
  preset: z.enum(['quick', 'standard', 'deep', 'enterprise']).default('standard'),
  tier: z.enum(['fast', 'standard', 'deep', 'enterprise']).optional(),
  modules: ModuleActivationOverrideSchema,
  concurrency: z.number().int().positive().default(3),
  maxDepth: z.number().int().nonnegative().default(3),
  maxPages: z.number().int().positive().default(100),
  rateLimitMs: z.number().int().nonnegative().default(100),
  retryCount: z.number().int().nonnegative().default(2),
  playwrightEnabled: z.boolean().default(false),
  lighthouseEnabled: z.boolean().default(false),
  lighthouseSampleCount: z.number().int().positive().optional(),
  excludePatterns: z.array(z.string()).default([]),
  includePatterns: z.array(z.string()).default([]),
  ruleOverrides: z.record(
    z.string(),
    z.object({
      enabled: z.boolean().optional(),
      severity: SeverityEnum.optional(),
      weight: z.number().min(1).max(10).optional(),
      findingSeverityOverrides: z.record(z.string(), SeverityEnum).optional(),
    })
  ).default({}),
  customRulesPath: z.string().optional(),
  backlinks: BacklinkApiConfigSchema,
  keywordIntelligence: KeywordIntelligenceConfigSchema,
  streamingEnabled: z.boolean().default(true),
  ruleConcurrency: z.number().int().positive().optional(),
  cacheMaxAge: z.number().int().nonnegative().default(86400),
  cacheDir: z.string().default('.seocore-cache'),
  adaptiveConcurrency: z.boolean().default(true),
});

/**
 * Gets the execution tier config for a given preset or execution tier name.
 */
export function getTierConfig(tierOrPreset: ExecutionTier | AuditPreset): ExecutionTierConfig {
  const tier = PRESET_TO_TIER[tierOrPreset as AuditPreset] || tierOrPreset;
  return TIER_PRESETS[tier as ExecutionTier];
}

/**
 * Converts an ExecutionTierConfig to a SeoConfig.
 */
export function tierConfigToSeoConfig(tierConfig: ExecutionTierConfig, overrides: Partial<SeoConfig> = {}): SeoConfig {
  const baseConfig: Partial<SeoConfig> = {
    preset: TIER_TO_PRESET[tierConfig.tier],
    concurrency: tierConfig.crawl.concurrency,
    maxDepth: tierConfig.crawl.maxDepth,
    maxPages: tierConfig.crawl.maxPages,
    rateLimitMs: tierConfig.crawl.rateLimitMs,
    playwrightEnabled: tierConfig.crawl.playwrightEnabled,
    lighthouseEnabled: tierConfig.crawl.lighthouseEnabled,
  };

  // Add lighthouseSampleCount based on sample rate and max pages (simplified)
  if (tierConfig.crawl.lighthouseSampleRate > 0) {
    baseConfig.lighthouseSampleCount = Math.max(1, Math.floor(tierConfig.crawl.maxPages * tierConfig.crawl.lighthouseSampleRate));
  }

  return {
    ...baseConfig,
    ...overrides,
  } as SeoConfig;
}

export const DEFAULT_CONFIG: SeoConfig = tierConfigToSeoConfig(TIER_PRESETS.standard);

// Keep PRESET_CONFIGS for backward compatibility
export const PRESET_CONFIGS: Record<AuditPreset, Partial<SeoConfig>> = {
  quick: tierConfigToSeoConfig(TIER_PRESETS.fast),
  standard: tierConfigToSeoConfig(TIER_PRESETS.standard),
  deep: tierConfigToSeoConfig(TIER_PRESETS.deep),
  enterprise: tierConfigToSeoConfig(TIER_PRESETS.enterprise),
};

/**
 * Merges partial config with default and preset configs, validates using Zod, and returns a strict SeoConfig.
 */
export function resolveConfig(partial: Partial<SeoConfig> = {}, configFile?: string): SeoConfig {
  let fileConfig: Partial<SeoConfig> = {};

  // 1. Read from config file if provided or if default config file exists
  const targetPath = configFile || path.join(process.cwd(), 'seocore.config.json');
  if (fs.existsSync(targetPath)) {
    try {
      const data = fs.readFileSync(targetPath, 'utf8');
      fileConfig = JSON.parse(data);
    } catch (err: any) {
      console.warn(`[Config] Failed to read or parse config file at ${targetPath}: ${err.message}`);
    }
  }

  // 2. Determine base config from preset
  const preset = partial.preset || fileConfig.preset || DEFAULT_CONFIG.preset;
  const presetBase = PRESET_CONFIGS[preset];

  const activeTier = partial.tier || fileConfig.tier;
  let tierBase = {};
  if (activeTier) {
    const tierConfig = getTierConfig(activeTier);
    tierBase = tierConfigToSeoConfig(tierConfig);
  }

  // 3. Merge: Default -> Preset Base -> Tier Base -> File Config -> Parameter Partial -> Env Vars
  const merged = {
    ...DEFAULT_CONFIG,
    ...presetBase,
    ...tierBase,
    ...fileConfig,
    ...partial,
  };

  const ensureBacklinksConfig = (): BacklinkApiConfig => {
    if (!merged.backlinks) {
      merged.backlinks = { provider: 'custom' } as BacklinkApiConfig;
    } else if (!merged.backlinks.provider) {
      merged.backlinks = {
        ...merged.backlinks,
        provider: 'custom',
      } as BacklinkApiConfig;
    }

    return merged.backlinks as BacklinkApiConfig;
  };

  const ensureKeywordIntelligenceConfig = () => {
    merged.keywordIntelligence ??= {};
    return merged.keywordIntelligence;
  };

  // 4. Apply environment overrides (prefix SEO_CORE_)
  if (process.env.SEO_CORE_CONCURRENCY) {
    merged.concurrency = Number.parseInt(process.env.SEO_CORE_CONCURRENCY, 10);
  }
  if (process.env.SEO_CORE_MAX_PAGES) {
    merged.maxPages = Number.parseInt(process.env.SEO_CORE_MAX_PAGES, 10);
  }
  if (process.env.SEO_CORE_MAX_DEPTH) {
    merged.maxDepth = Number.parseInt(process.env.SEO_CORE_MAX_DEPTH, 10);
  }
  if (process.env.SEO_CORE_PLAYWRIGHT) {
    merged.playwrightEnabled = process.env.SEO_CORE_PLAYWRIGHT === 'true';
  }
  if (process.env.SEO_CORE_BACKLINKS_PROVIDER) {
    const backlinks = ensureBacklinksConfig();
    backlinks.provider = process.env.SEO_CORE_BACKLINKS_PROVIDER as any;
  }
  if (process.env.SEO_CORE_BACKLINKS_API_KEY) {
    const backlinks = ensureBacklinksConfig();
    backlinks.bing = backlinks.bing || {};
    backlinks.bing.apiKey = process.env.SEO_CORE_BACKLINKS_API_KEY;
  }
  if (process.env.SEO_CORE_BACKLINKS_BING_SITE_URL) {
    const backlinks = ensureBacklinksConfig();
    backlinks.bing = backlinks.bing || {};
    backlinks.bing.siteUrl = process.env.SEO_CORE_BACKLINKS_BING_SITE_URL;
  }
  if (process.env.SEO_CORE_BACKLINKS_BING_MAX_PAGES) {
    const backlinks = ensureBacklinksConfig();
    backlinks.bing = backlinks.bing || {};
    backlinks.bing.maxPages = Number.parseInt(process.env.SEO_CORE_BACKLINKS_BING_MAX_PAGES, 10);
  }
  if (process.env.SEO_CORE_BACKLINKS_GSC_EXPORT_PATH) {
    const backlinks = ensureBacklinksConfig();
    backlinks.gsc = backlinks.gsc || {};
    backlinks.gsc.exportPath = process.env.SEO_CORE_BACKLINKS_GSC_EXPORT_PATH;
  }
  if (process.env.SEO_CORE_BACKLINKS_GSC_MAX_ROWS) {
    const backlinks = ensureBacklinksConfig();
    backlinks.gsc = backlinks.gsc || {};
    backlinks.gsc.maxRows = Number.parseInt(process.env.SEO_CORE_BACKLINKS_GSC_MAX_ROWS, 10);
  }
  if (process.env.SEO_CORE_BACKLINKS_LOG_PATHS) {
    const backlinks = ensureBacklinksConfig();
    backlinks.logs = backlinks.logs || {};
    backlinks.logs.paths = process.env.SEO_CORE_BACKLINKS_LOG_PATHS
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
  }
  if (process.env.SEO_CORE_BACKLINKS_LOG_MAX_ROWS) {
    const backlinks = ensureBacklinksConfig();
    backlinks.logs = backlinks.logs || {};
    backlinks.logs.maxRows = Number.parseInt(process.env.SEO_CORE_BACKLINKS_LOG_MAX_ROWS, 10);
  }
  if (process.env.SEO_CORE_KEYWORD_PROVIDER) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.provider = process.env.SEO_CORE_KEYWORD_PROVIDER as any;
  }
  if (process.env.SEO_CORE_KEYWORD_API_KEY) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.apiKey = process.env.SEO_CORE_KEYWORD_API_KEY;
  }
  if (process.env.SEO_CORE_KEYWORD_LOGIN) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.login = process.env.SEO_CORE_KEYWORD_LOGIN;
  }
  if (process.env.SEO_CORE_KEYWORD_PASSWORD) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.password = process.env.SEO_CORE_KEYWORD_PASSWORD;
  }
  if (process.env.SEO_CORE_KEYWORD_LOCALE) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.locale = process.env.SEO_CORE_KEYWORD_LOCALE;
  }
  if (process.env.SEO_CORE_KEYWORD_REGION) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.region = process.env.SEO_CORE_KEYWORD_REGION;
  }
  if (process.env.SEO_CORE_KEYWORD_RATE_LIMIT_MS) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.rateLimitMs = Number.parseInt(process.env.SEO_CORE_KEYWORD_RATE_LIMIT_MS, 10);
  }
  if (process.env.SEO_CORE_KEYWORD_BATCH_SIZE) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.batchSize = Number.parseInt(process.env.SEO_CORE_KEYWORD_BATCH_SIZE, 10);
  }
  if (process.env.SEO_CORE_KEYWORD_CACHE_TTL_SECONDS) {
    const keywordIntelligence = ensureKeywordIntelligenceConfig();
    keywordIntelligence.cacheTtlSeconds = Number.parseInt(process.env.SEO_CORE_KEYWORD_CACHE_TTL_SECONDS, 10);
  }

  // 5. Validate with Zod
  const result = SeoConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`[Config] Configuration validation failed: ${JSON.stringify(result.error.format())}`);
  }

  return result.data as SeoConfig;
}

/**
 * Initializes a default configuration file in the current directory.
 */
export function initConfigFile(targetDir: string = process.cwd()): string {
  const filePath = path.join(targetDir, 'seocore.config.json');
  if (fs.existsSync(filePath)) {
    throw new Error(`Config file already exists at ${filePath}`);
  }
  fs.writeFileSync(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  return filePath;
}
