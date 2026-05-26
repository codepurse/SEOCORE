import { Command } from 'commander';
import pc from 'picocolors';
import { ExecutionTier, TIER_PRESETS } from '@seocore/sdk';

export function command(): Command {
  return new Command('describe')
    .description('Show detailed info for a specific execution tier')
    .argument('<tier>', 'Tier to describe (fast/standard/deep/enterprise)')
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
  if (options.json) {
    console.log(JSON.stringify(tier, null, 2));
  } else {
    console.log(pc.bold(pc.cyan(`\n==================================================`)));
    console.log(pc.bold(pc.cyan(`       TIER: ${pc.white(tierName.toUpperCase())}                            `)));
    console.log(pc.bold(pc.cyan(`==================================================\n`)));
    console.log(JSON.stringify(tier, null, 2));
    console.log();
  }
}
