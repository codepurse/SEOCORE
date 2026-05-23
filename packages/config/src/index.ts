import { z } from 'zod';
import { SeoConfig, AuditPreset, Severity } from '@seocore/sdk';
import * as fs from 'fs';
import * as path from 'path';

// Define the schema using Zod
export const SeoConfigSchema = z.object({
  preset: z.enum(['quick', 'standard', 'deep', 'enterprise']).default('standard'),
  concurrency: z.number().int().positive().default(3),
  maxDepth: z.number().int().nonnegative().default(3),
  maxPages: z.number().int().positive().default(100),
  rateLimitMs: z.number().int().nonnegative().default(100),
  retryCount: z.number().int().nonnegative().default(2),
  playwrightEnabled: z.boolean().default(false),
  excludePatterns: z.array(z.string()).default([]),
  includePatterns: z.array(z.string()).default([]),
  ruleOverrides: z.record(
    z.string(),
    z.object({
      enabled: z.boolean().optional(),
      severity: z.enum(['critical', 'error', 'warning', 'info']).optional(),
      weight: z.number().min(1).max(10).optional(),
    })
  ).default({}),
  customRulesPath: z.string().optional(),
});

export const DEFAULT_CONFIG: SeoConfig = {
  preset: 'standard',
  concurrency: 3,
  maxDepth: 3,
  maxPages: 100,
  rateLimitMs: 100,
  retryCount: 2,
  playwrightEnabled: false,
  excludePatterns: [],
  includePatterns: [],
  ruleOverrides: {},
};

export const PRESET_CONFIGS: Record<AuditPreset, Partial<SeoConfig>> = {
  quick: {
    preset: 'quick',
    concurrency: 5,
    maxDepth: 1,
    maxPages: 10,
    playwrightEnabled: false,
    rateLimitMs: 50,
  },
  standard: {
    preset: 'standard',
    concurrency: 3,
    maxDepth: 3,
    maxPages: 100,
    playwrightEnabled: false,
    rateLimitMs: 100,
  },
  deep: {
    preset: 'deep',
    concurrency: 2,
    maxDepth: 5,
    maxPages: 500,
    playwrightEnabled: true,
    rateLimitMs: 250,
  },
  enterprise: {
    preset: 'enterprise',
    concurrency: 8,
    maxDepth: 10,
    maxPages: 5000,
    playwrightEnabled: true,
    rateLimitMs: 50,
  },
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

  // 3. Merge: Default -> Preset Base -> File Config -> Parameter Partial -> Env Vars
  const merged = {
    ...DEFAULT_CONFIG,
    ...presetBase,
    ...fileConfig,
    ...partial,
  };

  // 4. Apply environment overrides (prefix SEO_CORE_)
  if (process.env.SEO_CORE_CONCURRENCY) {
    merged.concurrency = parseInt(process.env.SEO_CORE_CONCURRENCY, 10);
  }
  if (process.env.SEO_CORE_MAX_PAGES) {
    merged.maxPages = parseInt(process.env.SEO_CORE_MAX_PAGES, 10);
  }
  if (process.env.SEO_CORE_MAX_DEPTH) {
    merged.maxDepth = parseInt(process.env.SEO_CORE_MAX_DEPTH, 10);
  }
  if (process.env.SEO_CORE_PLAYWRIGHT) {
    merged.playwrightEnabled = process.env.SEO_CORE_PLAYWRIGHT === 'true';
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
