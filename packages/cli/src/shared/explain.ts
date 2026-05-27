import pc from 'picocolors';
import { ExecutionTier, TIER_PRESETS, ExecutionTierConfig, Rule, ModuleActivation } from '@seocore/sdk';
import { resolveConfig } from '@seocore/config';

export interface DryRunOutput {
  resolvedTier: ExecutionTier | undefined;
  enabledModules: ModuleActivation;
  expectedCrawlerType: string;
  settings: {
    maxDepth: number;
    maxPages: number;
    concurrency: number;
    rateLimitMs: number;
  };
  activeRulesCount: number;
  outputFormatTargets: string[];
}

async function loadRegisteredRules(): Promise<Rule[]> {
  const [
    { getCoreRules },
    { getPerformanceRules },
    { getMobileRules },
    { getAiVisibilityRules },
    { getSecurityRules },
    { getHreflangRules },
  ] = await Promise.all([
    import('@seocore/rules-core'),
    import('@seocore/rules-performance'),
    import('@seocore/rules-mobile'),
    import('@seocore/rules-ai-visibility'),
    import('@seocore/rules-security'),
    import('@seocore/rules-hreflang'),
  ]);

  const rules = [
    ...getCoreRules(),
    ...getPerformanceRules(),
    ...getMobileRules(),
    ...getAiVisibilityRules(),
    ...getSecurityRules(),
    ...getHreflangRules(),
  ];

  try {
    const { createBacklinkPlugin } = await import('@seocore/plugin-backlinks');
    const backlinkPlugin = createBacklinkPlugin();
    if (backlinkPlugin.rules) {
      rules.push(...backlinkPlugin.rules);
    }
  } catch {
    // Backlink plugin is optional for rule listing.
  }

  return rules;
}

function getModuleStatus(modules: ModuleActivation): Record<string, boolean> {
  return {
    core: modules.core,
    performance: modules.performance,
    mobile: modules.mobile,
    aiVisibility: modules.aiVisibility,
    security: modules.security,
    backlinks: modules.backlinks,
    hreflang: modules.hreflang,
  };
}

function getCrawlerType(config: any): string {
  if (config.playwrightEnabled) {
    return 'Playwright (headless browser rendering)';
  }
  return 'Static HTTP (cheerio-based)';
}

export async function explainDryRun(
  url: string,
  options: any
): Promise<DryRunOutput> {
  const config = resolveConfig();
  
  const tier = options.tier || config.tier || 'standard';
  const tierConfig = TIER_PRESETS[tier as ExecutionTier];
  
  const modules: ModuleActivation = options.module 
    ? parseModuleOverride(options.module)
    : (config.modules || tierConfig?.modules || {
        core: true,
        performance: false,
        mobile: false,
        aiVisibility: false,
        security: false,
        backlinks: false,
        hreflang: false,
      }) as ModuleActivation;
  
  const maxPages = (options.maxPages !== undefined && !isNaN(options.maxPages))
    ? options.maxPages 
    : config.maxPages || tierConfig?.crawl.maxPages || 100;
  
  const maxDepth = (options.depth !== undefined && !isNaN(options.depth))
    ? options.depth 
    : config.maxDepth || tierConfig?.crawl.maxDepth || 3;
  
  const concurrency = (options.concurrency !== undefined && !isNaN(options.concurrency))
    ? options.concurrency 
    : config.concurrency || tierConfig?.crawl.concurrency || 3;
  
  const rateLimitMs = (options.rateLimit !== undefined && !isNaN(options.rateLimit))
    ? options.rateLimit 
    : config.rateLimitMs || tierConfig?.crawl.rateLimitMs || 100;
  
  const playwrightEnabled = options.playwright || tierConfig?.crawl.playwrightEnabled || config.playwrightEnabled || false;
  
  const rules = await loadRegisteredRules();
  const rulesConfig = resolveConfig();
  
  const activeRules = rules.filter(rule => {
    const moduleEnabled = modules[rule.definition.module as keyof ModuleActivation];
    if (moduleEnabled === false) return false;
    
    if (rule.definition.tier && !rule.definition.tier.includes(tier as ExecutionTier)) {
      return false;
    }
    
    return true;
  });
  
  const outputFormats: string[] = ['terminal'];
  if (options.format) {
    const fmt = options.format as string;
    if (fmt === 'json' || fmt === 'both' || fmt === 'all') outputFormats.push('json');
    if (fmt === 'html' || fmt === 'both' || fmt === 'all') outputFormats.push('html');
    if (fmt === 'sarif') outputFormats.push('sarif');
  }
  
  return {
    resolvedTier: tier as ExecutionTier,
    enabledModules: modules,
    expectedCrawlerType: getCrawlerType({ playwrightEnabled }),
    settings: {
      maxDepth,
      maxPages,
      concurrency,
      rateLimitMs,
    },
    activeRulesCount: activeRules.length,
    outputFormatTargets: outputFormats,
  };
}

export function printDryRunSummary(dryRun: DryRunOutput, url: string): void {
  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                    DRY RUN SUMMARY')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();
  
  console.log(pc.bold('TARGET:'));
  console.log(`  URL:  ${pc.cyan(url)}`);
  console.log();
  
  console.log(pc.bold('RESOLVED TIER:'));
  console.log(`  ${pc.green(dryRun.resolvedTier?.toUpperCase() || 'standard')}`);
  console.log();
  
  console.log(pc.bold('ENABLED MODULES:'));
  const modules = getModuleStatus(dryRun.enabledModules);
  for (const [name, enabled] of Object.entries(modules)) {
    const status = enabled ? pc.green('✓') : pc.gray('✗');
    const label = enabled ? pc.green('enabled') : pc.gray('disabled');
    console.log(`  ${status} ${name.padEnd(15)} ${label}`);
  }
  console.log();
  
  console.log(pc.bold('CRAWL SETTINGS:'));
  console.log(`  Max Depth:      ${dryRun.settings.maxDepth}`);
  console.log(`  Max Pages:      ${dryRun.settings.maxPages}`);
  console.log(`  Concurrency:    ${dryRun.settings.concurrency}`);
  console.log(`  Rate Limit:     ${dryRun.settings.rateLimitMs}ms`);
  console.log();
  
  console.log(pc.bold('CRAWLER TYPE:'));
  console.log(`  ${dryRun.expectedCrawlerType}`);
  console.log();
  
  console.log(pc.bold('ACTIVE RULES:'));
  console.log(`  ${pc.yellow(String(dryRun.activeRulesCount))} rules will run`);
  console.log();
  
  console.log(pc.bold('OUTPUT FORMATS:'));
  for (const fmt of dryRun.outputFormatTargets) {
    console.log(`  • ${fmt}`);
  }
  console.log();
  
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();
  console.log(pc.green('✓ Dry run complete. No crawl was performed.'));
  console.log();
}

function parseModuleOverride(input?: string): ModuleActivation {
  if (!input) {
    return {
      core: false,
      performance: false,
      mobile: false,
      aiVisibility: false,
      security: false,
      backlinks: false,
      hreflang: false,
    };
  }

  const normalized = input
    .split(',')
    .map(entry => entry.trim())
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
    if (aliasMap[entry]) {
      modules[aliasMap[entry]] = true;
    }
  }

  return modules;
}
