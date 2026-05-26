import { Command } from 'commander';
import pc from 'picocolors';
import { resolveConfig } from '@seocore/config';

export function command(): Command {
  return new Command('show')
    .description('Show resolved effective SEO config')
    .option('--json', 'Output as raw JSON', false)
    .action(handler);
}

export async function handler(options: any): Promise<void> {
  const config = resolveConfig();
  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log(pc.bold(pc.cyan('\n==================================================')));
    console.log(pc.bold(pc.cyan('          EFFECTIVE SEOCORE CONFIG                ')));
    console.log(pc.bold(pc.cyan('==================================================\n')));
    console.log(JSON.stringify(config, null, 2));
    console.log();
  }
}
