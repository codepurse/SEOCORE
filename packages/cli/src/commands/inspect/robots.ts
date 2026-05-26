import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { HttpCrawler } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import fs from 'fs';
import path from 'path';

export function command(): Command {
  return new Command('robots')
    .description('Check a website\'s robots.txt file')
    .argument('<url>', 'Target website URL')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);

    const isJson = options.json || options.format === 'json';
    const spinner = new Spinner(`Checking robots.txt for ${url}...`);
    if (!isJson) spinner.start();

    const config = resolveConfig();
    const crawler = new HttpCrawler();

    const baseUrl = new URL(url);
    const robotsUrl = `${baseUrl.origin}/robots.txt`;
    const result = await crawler.crawl(robotsUrl, config);

    if (!isJson) spinner.stop('Finished robots.txt check.');

    const output = {
      url: robotsUrl,
      statusCode: result.statusCode,
      ok: result.statusCode === 200,
      content: result.html,
      error: result.error,
      checkedAt: new Date().toISOString(),
    };

    if (options.json || options.format === 'json') {
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf8');
        console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
      } else {
        console.log(JSON.stringify(output, null, 2));
      }
      return;
    }

    // Terminal output
    console.log();
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(pc.bold(pc.cyan('            ROBOTS.TXT CHECKER                    ')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
    console.log(`${pc.bold('Robots URL:')} ${pc.underline(robotsUrl)}`);
    console.log();

    if (result.statusCode === 200) {
      console.log(pc.green('✓ robots.txt is available!'));
      console.log();
      console.log(pc.bold('Content:'));
      console.log(pc.gray('──────────────────────────────────────────────────'));
      console.log(result.html);
    } else {
      console.log(pc.red(`✗ robots.txt not found or inaccessible (Status: ${result.statusCode})`));
      if (result.error) {
        console.log(pc.red(`Error: ${result.error}`));
      }
    }
    console.log();
  } catch (err: any) {
    console.error(pc.red(`\nRobots.txt check failed: ${err.message}`));
    process.exit(1);
  }
}
