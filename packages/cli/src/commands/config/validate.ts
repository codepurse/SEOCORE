import { Command } from 'commander';
import pc from 'picocolors';
import { resolveConfig, initConfigFile } from '@seocore/config';
import * as path from 'node:path';

export function command(): Command {
  return new Command('validate')
    .description('Validate seocore config file')
    .option('-c, --config <path>', 'Path to config file')
    .option('--json', 'Output raw JSON')
    .action(handler);
}

export async function handler(options: any): Promise<void> {
  try {
    console.log(pc.cyan('\nValidating seocore config file...\n'));

    // Try to resolve config (will throw if invalid)
    const config = resolveConfig({}, options.config);

    console.log(pc.green('✅ Config file is valid!\n'));

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log('Resolved config:');
      console.log(`  Tier/Preset: ${config.tier || config.preset}`);
      console.log(`  Concurrency: ${config.concurrency}`);
      console.log(`  Max pages: ${config.maxPages}`);
      console.log(`  Max depth: ${config.maxDepth}`);
      console.log(`  Playwright: ${config.playwrightEnabled ? 'enabled' : 'disabled'}`);
      console.log(`  Exclude patterns: ${config.excludePatterns.length > 0 ? config.excludePatterns.join(', ') : 'none'}`);
      console.log(`  Include patterns: ${config.includePatterns.length > 0 ? config.includePatterns.join(', ') : 'none'}`);
    }

  } catch (err: any) {
    console.error(pc.red(`\nConfig validation failed: ${err.message}`));
    process.exit(1);
  }
}
