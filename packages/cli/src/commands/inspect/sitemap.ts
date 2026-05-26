import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { HttpCrawler, SitemapParser } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import fs from 'fs';
import path from 'path';
import PQueue from 'p-queue';

export function command(): Command {
  return new Command('sitemap')
    .description('Check a website\'s sitemap.xml file')
    .argument('<url>', 'Target website URL')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--list-urls', 'List all URLs from the sitemap', false)
    .option('--check-links', 'Check if sitemap URLs are reachable', false)
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);

    const isJson = options.json || options.format === 'json';
    const spinner = new Spinner(`Checking sitemap.xml for ${url}...`);
    if (!isJson) spinner.start();

    const config = resolveConfig();
    const crawler = new HttpCrawler();

    const baseUrl = new URL(url);
    const sitemapUrl = `${baseUrl.origin}/sitemap.xml`;
    const result = await crawler.crawl(sitemapUrl, config);

    if (!isJson) spinner.stop('Finished sitemap.xml check.');

    let sitemapUrls: string[] = [];
    if (result.statusCode === 200 && result.html) {
      sitemapUrls = SitemapParser.parse(result.html);
    }

    let linkCheckResults: Array<{ url: string; statusCode: number; ok: boolean; error?: string }> = [];
    if (options.checkLinks && sitemapUrls.length > 0) {
      console.log(pc.cyan(`\nChecking ${sitemapUrls.length} sitemap URLs...`));
      const queue = new PQueue({ concurrency: 5 });
      
      for (const sitemapUrlItem of sitemapUrls) {
        queue.add(async () => {
          try {
            const checkResult = await crawler.crawl(sitemapUrlItem, config);
            linkCheckResults.push({
              url: sitemapUrlItem,
              statusCode: checkResult.statusCode,
              ok: checkResult.statusCode === 200,
              error: checkResult.error,
            });
            console.log(`${pc.gray('  [')}${checkResult.statusCode === 200 ? pc.green('✓') : pc.red('✗')}${pc.gray(']')} ${sitemapUrlItem} (Status: ${checkResult.statusCode})`);
          } catch (err: any) {
            linkCheckResults.push({
              url: sitemapUrlItem,
              statusCode: 0,
              ok: false,
              error: err.message,
            });
            console.log(`${pc.gray('  [')}${pc.red('✗')}${pc.gray(']')} ${sitemapUrlItem} (Error: ${err.message})`);
          }
        });
      }
      await queue.onIdle();
    }

    const output = {
      url: sitemapUrl,
      statusCode: result.statusCode,
      ok: result.statusCode === 200,
      content: result.html,
      error: result.error,
      urls: sitemapUrls,
      urlCount: sitemapUrls.length,
      linkChecks: linkCheckResults.length > 0 ? linkCheckResults : undefined,
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
    console.log(pc.bold(pc.cyan('            SITEMAP.XML CHECKER                   ')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
    console.log(`${pc.bold('Sitemap URL:')} ${pc.underline(sitemapUrl)}`);
    console.log();

    if (result.statusCode === 200) {
      console.log(pc.green('✓ sitemap.xml is available!'));
      console.log(`${pc.bold('URLs Found:')} ${sitemapUrls.length}`);
      
      if (options.listUrls) {
        console.log();
        console.log(pc.bold('Sitemap URLs:'));
        console.log(pc.gray('──────────────────────────────────────────────────'));
        sitemapUrls.forEach((u, i) => console.log(`${i + 1}. ${u}`));
      }

      if (options.checkLinks && linkCheckResults.length > 0) {
        const okCount = linkCheckResults.filter(r => r.ok).length;
        const brokenCount = linkCheckResults.length - okCount;
        console.log();
        console.log(pc.bold('Link Check Results:'));
        console.log(pc.gray('──────────────────────────────────────────────────'));
        console.log(`${pc.green('✓ OK:')} ${okCount}`);
        console.log(`${pc.red('✗ Broken:')} ${brokenCount}`);
      }
    } else {
      console.log(pc.red(`✗ sitemap.xml not found or inaccessible (Status: ${result.statusCode})`));
      if (result.error) {
        console.log(pc.red(`Error: ${result.error}`));
      }
    }
    console.log();
  } catch (err: any) {
    console.error(pc.red(`\nSitemap check failed: ${err.message}`));
    process.exit(1);
  }
}
