import { Command } from 'commander';
import pc from 'picocolors';
import { initConfigFile } from '@seocore/config';

export function command(): Command {
  return new Command('init')
    .description('Initialize a local seocore.config.json file with default values')
    .action(handler);
}

export async function handler(): Promise<void> {
  try {
    const filePath = initConfigFile();
    console.log(pc.green(`\n✔  Initialized default SEO core config file successfully at:`));
    console.log(pc.bold(filePath));
    console.log(`Customize this file to configure rule severities, concurrency limits, and crawl exclusions.\n`);
  } catch (err: any) {
    console.error(pc.red(`\nError: ${err.message}`));
    process.exit(1);
  }
}
