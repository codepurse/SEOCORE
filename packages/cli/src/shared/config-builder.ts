import { AuditPreset, ModuleActivation } from '@seocore/sdk';

function parseModuleOverride(input?: string): Partial<ModuleActivation> | undefined {
  if (!input) {
    return undefined;
  }

  const normalized = input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const aliasMap: Record<string, keyof ModuleActivation> = {
    core: 'core',
    performance: 'performance',
    mobile: 'mobile',
    ai_visibility: 'aiVisibility',
    aiVisibility: 'aiVisibility',
    security: 'security',
    backlinks: 'backlinks',
    hreflang: 'hreflang',
  };

  const invalid = normalized.filter((entry) => !aliasMap[entry]);
  if (invalid.length > 0) {
    throw new Error(`Invalid module override: ${invalid.join(', ')}`);
  }

  const modules: ModuleActivation = {
    core: false,
    performance: false,
    mobile: false,
    aiVisibility: false,
    security: false,
    backlinks: false,
    hreflang: false,
  };

  for (const entry of normalized) {
    modules[aliasMap[entry]] = true;
  }

  return modules;
}

export function buildPartialConfig(options: any): any {
  const partialConfig: any = {};
  if (options.preset) partialConfig.preset = options.preset as AuditPreset;
  if (options.depth !== undefined) partialConfig.maxDepth = options.depth;
  if (options.maxPages !== undefined) partialConfig.maxPages = options.maxPages;
  if (options.concurrency !== undefined) partialConfig.concurrency = options.concurrency;
  if (options.rateLimit !== undefined) partialConfig.rateLimitMs = options.rateLimit;
  if (options.retryCount !== undefined) partialConfig.retryCount = options.retryCount;
  if (options.exclude) partialConfig.excludePatterns = options.exclude;
  if (options.include) partialConfig.includePatterns = options.include;
  if (options.playwright) partialConfig.playwrightEnabled = true;
  if (options.lighthouse !== undefined) partialConfig.lighthouseEnabled = options.lighthouse;
  if (options.lighthouseSample !== undefined) partialConfig.lighthouseSampleCount = options.lighthouseSample;
  if (options.module) partialConfig.modules = parseModuleOverride(options.module);
  // Phase 6 performance options
  if (options.legacyBuffered) partialConfig.streamingEnabled = false;
  if (options.noCache) partialConfig.cacheDir = undefined;
  if (options.cacheDir) partialConfig.cacheDir = options.cacheDir;
  if (options.noAdaptive) partialConfig.adaptiveConcurrency = false;
  if (options.ruleConcurrency !== undefined) partialConfig.ruleConcurrency = options.ruleConcurrency;
  return partialConfig;
}
