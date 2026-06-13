import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { resolveConfig } from '@seocore/config';
import { createBacklinkClient } from '@seocore/backlinks';
import { Backlink } from '@seocore/sdk';
import fs from 'fs';
import path from 'path';

export function command(): Command {
  return new Command('backlinks')
    .description('Analyze website backlinks')
    .argument('<url>', 'Target website URL')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('-l, --limit <number>', 'Maximum number of backlinks to fetch', parseInt, 100)
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);

    const config = resolveConfig();
    const isJson = options.json || options.format === 'json';

    if (!config.backlinks?.provider) {
      if (isJson) {
        const payload = {
          targetUrl: url,
          checkedAt: new Date().toISOString(),
          status: 'not-configured',
          message: 'No backlink data source configured.',
          backlinks: [],
          totalBacklinks: 0,
        };
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(payload, null, 2), 'utf8');
          console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
        } else {
          console.log(JSON.stringify(payload, null, 2));
        }
        return;
      }

      console.log();
      console.log(pc.bold(pc.yellow('No backlink data source configured — skipping backlink analysis.')));
      console.log();
      console.log('Backlinks need a data source. Two of the three are keyless:');
      console.log(`  ${pc.cyan('•')} Google Search Console export (CSV)  ${pc.gray('— keyless')}`);
      console.log(`     ${pc.gray('SEO_CORE_BACKLINKS_GSC_EXPORT_PATH=./gsc-links.csv')}`);
      console.log(`  ${pc.cyan('•')} Server access logs                  ${pc.gray('— keyless')}`);
      console.log(`     ${pc.gray('SEO_CORE_BACKLINKS_LOG_PATHS=./access.log')}`);
      console.log(`  ${pc.cyan('•')} Bing Webmaster Tools API            ${pc.gray('— optional API key')}`);
      console.log(`     ${pc.gray('SEO_CORE_BACKLINKS_PROVIDER=bing  SEO_CORE_BACKLINKS_API_KEY=...')}`);
      console.log();
      return;
    }

    const spinner = new Spinner(`Analyzing backlinks for ${url}...`);
    if (!isJson) spinner.start();

    const client = createBacklinkClient(config.backlinks);
    const intelligence = await client.getIntelligence(url, options.limit);
    const backlinks = intelligence.backlinks;
    const domainMetrics = intelligence.domainMetrics;

    if (!isJson) spinner.stop('Finished backlink analysis.');

    const output = {
      targetUrl: url,
      checkedAt: new Date().toISOString(),
      provider: config.backlinks.provider,
      sources: intelligence.sources,
      backlinks: backlinks,
      totalBacklinks: backlinks.length,
      domainMetrics: domainMetrics,
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

    console.log();
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(pc.bold(pc.cyan('              BACKLINK ANALYZER                   ')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
    console.log(`${pc.bold('Provider:')} ${config.backlinks.provider}`);
    console.log(`${pc.bold('Sources Used:')} ${intelligence.sources.join(', ')}`);
    console.log();

    if (domainMetrics.totalBacklinks !== undefined) {
      console.log(`${pc.bold('Total Backlinks:')} ${domainMetrics.totalBacklinks}`);
    }
    if (domainMetrics.referringDomains !== undefined) {
      console.log(`${pc.bold('Referring Domains:')} ${domainMetrics.referringDomains}`);
    }
    if (domainMetrics.sourceCount !== undefined) {
      console.log(`${pc.bold('Sources Count:')} ${domainMetrics.sourceCount}`);
    }
    console.log(`${pc.bold('Backlinks Loaded:')} ${backlinks.length}`);
    if (domainMetrics.notes && domainMetrics.notes.length > 0) {
      console.log(`${pc.bold('Notes:')} ${domainMetrics.notes.join(' | ')}`);
    }

    if (backlinks.length > 0) {
      console.log();
      console.log(pc.bold('Recent Backlinks:'));
      console.log(pc.gray('──────────────────────────────────────────────────'));
      backlinks.slice(0, 10).forEach((backlink: Backlink, i: number) => {
        const linkType = backlink.isDofollow === undefined
          ? pc.gray('Unknown')
          : backlink.isDofollow
            ? pc.green('DoFollow')
            : pc.gray('NoFollow');
        console.log(`${i + 1}. ${pc.underline(backlink.sourceUrl)}`);
        console.log(`   Anchor: ${pc.italic(backlink.anchorText || '(not available)')}`);
        console.log(`   Type: ${linkType}`);
        if (backlink.domainAuthority !== undefined) {
          console.log(`   DA: ${backlink.domainAuthority}`);
        }
        if (backlink.spamScore !== undefined) {
          console.log(`   Spam: ${backlink.spamScore}`);
        }
        console.log();
      });
      if (backlinks.length > 10) {
        console.log(pc.gray(`... and ${backlinks.length - 10} more backlinks.`));
      }
    }

    console.log();
  } catch (err: any) {
    console.error(pc.red(`\nBacklink analysis failed: ${err.message}`));
    process.exit(1);
  }
}
