import { Command } from 'commander';
import pc from 'picocolors';
import { HttpCrawler } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import fs from 'fs';
import path from 'path';
import { validateUrl, Spinner } from '../shared/index.js';
import { runDirectoryScan } from '../directories/index.js';
import { DirectoryReporter } from '../directories/reporter.js';

export function command(): Command {
  return new Command('directories')
    .alias('directory')
    .description('Check live business directory presence and NAP consistency')
    .argument('<url>', 'Target website URL')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--provider <provider>', 'Search provider: auto, serpapi, cascade, duckduckgo, playwright', 'auto')
    .option('--show', 'Show browser window for Playwright search', false)
    .option('--concurrency <number>', 'Directories to process in parallel', parseInt, 4)
    .option('--max-candidates <number>', 'Candidate listings to verify per directory', parseInt, 3)
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  let spinner: Spinner | null = null;
  let isJson = false;
  try {
    validateUrl(url);
    if (!['auto', 'serpapi', 'cascade', 'duckduckgo', 'playwright'].includes(options.provider)) {
      throw new Error(`Invalid provider "${options.provider}". Use auto, serpapi, cascade, duckduckgo, or playwright.`);
    }
    if (Number.isNaN(options.concurrency) || options.concurrency < 1) {
      throw new Error('--concurrency must be a positive integer.');
    }
    if (Number.isNaN(options.maxCandidates) || options.maxCandidates < 1) {
      throw new Error('--max-candidates must be a positive integer.');
    }

    isJson = options.json || options.format === 'json';
    spinner = new Spinner(`Scanning directory listings for ${url}...`);
    if (!isJson) spinner.start();

    const config = resolveConfig();
    const crawler = new HttpCrawler();
    const crawlResult = await crawler.crawl(url, config);

    if (crawlResult.statusCode !== 200) {
      throw new Error(`Failed to crawl target URL: ${url} (Status ${crawlResult.statusCode})`);
    }

    const html = crawlResult.html || '';
    const scanResult = await runDirectoryScan(html, url, {
      provider: options.provider,
      headless: !options.show,
      concurrency: options.concurrency,
      maxCandidatesPerDirectory: options.maxCandidates,
    });

    if (!isJson) spinner.stop('Finished directory check.');

    if (options.json || options.format === 'json') {
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(scanResult, null, 2), 'utf8');
        console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
      } else {
        console.log(JSON.stringify(scanResult, null, 2));
      }
      return;
    }

    DirectoryReporter.report(scanResult);
  } catch (err: any) {
    if (spinner && !isJson) spinner.stop('Directory check failed.');
    console.error(pc.red(`\nDirectory check failed: ${err.message}`));
    process.exit(1);
  }
}
