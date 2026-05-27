import { Command } from 'commander';
import pc from 'picocolors';
import { ExecutionTier, TIER_PRESETS, ModuleActivation } from '@seocore/sdk';

interface TierUseCase {
  tier: ExecutionTier;
  description: string;
  bestFor: string[];
}

const TIER_USE_CASES: Record<ExecutionTier, TierUseCase> = {
  fast: {
    tier: 'fast',
    description: 'Lightweight single-page audit for quick health checks',
    bestFor: ['CI pipelines', 'Quick smoke tests', 'URL validation', 'Pull request checks'],
  },
  standard: {
    tier: 'standard',
    description: 'Balanced multi-page crawl for regular site audits',
    bestFor: ['Weekly audits', 'Site health dashboards', 'Pre-launch checks', 'SEO reviews'],
  },
  deep: {
    tier: 'deep',
    description: 'Comprehensive crawl with JavaScript rendering and full module coverage',
    bestFor: ['Quarterly audits', 'Technical SEO deep dives', 'Site migrations', 'Competitor analysis'],
  },
  enterprise: {
    tier: 'enterprise',
    description: 'Full-featured crawl with Lighthouse sampling, backlink intelligence, and keyword research',
    bestFor: ['Annual SEO audits', 'Large site migrations', 'Enterprise reporting', 'Sitemap optimization'],
  },
};

export function command(): Command {
  return new Command('explain')
    .description('Explain an execution tier in detail')
    .argument('<tier>', 'Tier to explain (fast/standard/deep/enterprise)')
    .option('--json', 'Output as raw JSON', false)
    .action(handler);
}

export async function handler(tierName: string, options: any): Promise<void> {
  const validTiers = Object.keys(TIER_PRESETS) as ExecutionTier[];
  if (!validTiers.includes(tierName as ExecutionTier)) {
    console.error(pc.red(`\nError: Invalid tier "${tierName}". Valid tiers: ${validTiers.join(', ')}`));
    process.exit(1);
  }
  
  const tier = TIER_PRESETS[tierName as ExecutionTier];
  const useCase = TIER_USE_CASES[tierName as ExecutionTier];

  if (options.json) {
    console.log(JSON.stringify({
      ...tier,
      useCase: useCase.description,
      bestFor: useCase.bestFor,
    }, null, 2));
  } else {
    console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
    console.log(pc.bold(pc.cyan(`                    TIER: ${tierName.toUpperCase()}`)));
    console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
    console.log();

    console.log(pc.bold('Description:'));
    console.log(`  ${pc.white(useCase.description)}`);
    console.log();

    console.log(pc.bold('Best For:'));
    for (const use of useCase.bestFor) {
      console.log(`  ${pc.green('→')} ${pc.gray(use)}`);
    }
    console.log();

    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('Crawl Settings:'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
    console.log(`  Max Depth:           ${pc.yellow(String(tier.crawl.maxDepth))}`);
    console.log(`  Max Pages:           ${pc.yellow(String(tier.crawl.maxPages))}`);
    console.log(`  Concurrency:         ${pc.yellow(String(tier.crawl.concurrency))}`);
    console.log(`  Rate Limit:          ${pc.yellow(String(tier.crawl.rateLimitMs))}ms`);
    console.log(`  Playwright:          ${tier.crawl.playwrightEnabled ? pc.green('Enabled') : pc.gray('Disabled')}`);
    console.log(`  Lighthouse:          ${tier.crawl.lighthouseEnabled ? pc.green('Enabled') : pc.gray('Disabled')}`);
    if (tier.crawl.lighthouseSampleRate > 0) {
      console.log(`  Lighthouse Sample:   ${pc.yellow(String(tier.crawl.lighthouseSampleRate * 100))}%`);
    }
    console.log();

    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('Module Activation:'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
    
    const modules = tier.modules as ModuleActivation;
    const moduleNames: (keyof ModuleActivation)[] = ['core', 'performance', 'mobile', 'aiVisibility', 'security', 'backlinks', 'hreflang'];
    
    for (const mod of moduleNames) {
      const enabled = modules[mod];
      const status = enabled ? pc.green('✓') : pc.gray('✗');
      const label = mod.replace(/([A-Z])/g, ' $1').trim();
      console.log(`  ${status} ${label.padEnd(18)} ${enabled ? pc.green('enabled') : pc.gray('disabled')}`);
    }
    console.log();

    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('Scoring Settings:'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
    console.log(`  Algorithm:           ${pc.cyan(tier.scoring.algorithm)}`);
    
    if (Object.keys(tier.scoring.categoryWeights).length > 0) {
      console.log();
      console.log(`  ${pc.bold('Category Weights:')}`);
      for (const [cat, weight] of Object.entries(tier.scoring.categoryWeights)) {
        const catName = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        console.log(`    ${catName.padEnd(20)} ${pc.yellow(String(Number(weight).toFixed(2)))}`);
      }
    }
    console.log();

    console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
    console.log();
  }
}
