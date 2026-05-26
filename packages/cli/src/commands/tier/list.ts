import { Command } from 'commander';
import pc from 'picocolors';
import { ExecutionTier, TIER_PRESETS } from '@seocore/sdk';

export function command(): Command {
  return new Command('list')
    .description('List all available execution tiers')
    .action(handler);
}

export async function handler(): Promise<void> {
  console.log(pc.bold(pc.cyan('\nEXECUTION TIERS:')));
  console.log(pc.gray('─────────────────────────────────────────────────────────────────────────────────'));
  
  const tiers = Object.keys(TIER_PRESETS) as ExecutionTier[];
  const tierDescriptions: Record<string, string> = {
    fast: 'Core rules only, 1 page, static HTML',
    standard: '+ Performance, 100 pages, simulated CWV',
    deep: '+ All modules, 500 pages, Playwright rendering',
    enterprise: '+ Plugins, 5000 pages, Lighthouse sampling'
  };
  
  for (const tier of tiers) {
    const config = TIER_PRESETS[tier];
    const tierColor = 
      tier === 'fast' ? pc.green :
      tier === 'standard' ? pc.cyan :
      tier === 'deep' ? pc.yellow :
      pc.magenta;
    
    console.log(`${tierColor(pc.bold(tier.toUpperCase().padEnd(12)))} ${tierDescriptions[tier]}`);
    console.log(`  ${pc.gray('Max Pages:')} ${config.crawl.maxPages}, ${pc.gray('Max Depth:')} ${config.crawl.maxDepth}, ${pc.gray('Concurrency:')} ${config.crawl.concurrency}`);
    console.log(`  ${pc.gray('Playwright:')} ${config.crawl.playwrightEnabled ? pc.green('Enabled') : pc.gray('Disabled')}, ${pc.gray('Lighthouse:')} ${config.crawl.lighthouseEnabled ? pc.green('Enabled') : pc.gray('Disabled')}`);
    console.log(`  ${pc.gray('Rules:')} ${config.ruleFilter.categories.join(', ')}`);
    console.log();
  }
}
