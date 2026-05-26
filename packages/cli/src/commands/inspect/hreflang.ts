import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { HttpCrawler } from '@seocore/crawler';
import { PageNormalizer, HreflangValidator } from '@seocore/analyzers';
import { resolveConfig } from '@seocore/config';
import { HreflangReporter } from '../../hreflang/reporter.js';
import fs from 'fs';
import path from 'path';

export function command(): Command {
  return new Command('hreflang')
    .description('Validate a website\'s hreflang tags')
    .argument('<url>', 'Target website URL')
    .option('--deep', 'Validate all pages on the site', false)
    .option('--lang <codes>', 'Filter to specific languages (comma-separated)')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);

    const isJson = options.json || options.format === 'json';
    const spinner = new Spinner(`Validating hreflang tags for ${url}...`);
    if (!isJson) spinner.start();

    const config = resolveConfig();
    const crawler = new HttpCrawler();
    const validator = new HreflangValidator();

    const mainResult = await crawler.crawl(url, config);
    if (mainResult.statusCode !== 200) {
      throw new Error(`Failed to load target page: HTTP ${mainResult.statusCode}`);
    }
    const mainPage = PageNormalizer.normalize(mainResult);

    const pagesToCheck = [mainPage];

    if (options.deep) {
      const uniqueUrls = new Set<string>();
      for (const alt of mainPage.hreflang) {
        uniqueUrls.add(alt.url);
      }

      for (const altUrl of uniqueUrls) {
        try {
          const result = await crawler.crawl(altUrl, config);
          if (result.statusCode === 200) {
            pagesToCheck.push(PageNormalizer.normalize(result));
          }
        } catch {
          // Ignore errors for deep crawl
        }
      }
    }

    const validationResult = validator.validate(pagesToCheck);

    if (!isJson) spinner.stop('Finished hreflang validation.');

    if (isJson) {
      const output = HreflangReporter.exportJson(validationResult, options.output);
      if (options.output) {
        console.log(pc.green(`✓ JSON report saved to ${output}`));
      } else {
        console.log(output);
      }
      return;
    }

    HreflangReporter.report(validationResult, url);

  } catch (err: any) {
    console.error(pc.red(`\nHreflang validation failed: ${err.message}`));
    process.exit(1);
  }
}
