import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { checkGoogleRank } from '../../rank-checker.js';
import fs from 'fs';
import path from 'path';

export function command(): Command {
  return new Command('rank')
    .description('Check Google search ranking for a keyword and URL')
    .argument('<keyword>', 'Search keyword to check')
    .argument('<url>', 'Target website URL to look for')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--show', 'Show Chrome window for debugging captcha', false)
    .action(handler);
}

export async function handler(keyword: string, url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    const isJson = options.json || options.format === 'json';
    const spinner = new Spinner(`Checking Google top 10 for "${keyword}"...`);
    if (!isJson) spinner.start();

    const result = await checkGoogleRank(keyword, url, { headless: !options.show });

    if (!isJson) spinner.stop('Rank check complete.');

    if (isJson) {
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2), 'utf8');
        console.log(pc.green(`✓ JSON saved to ${path.resolve(options.output)}`));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
      return;
    }

    console.log();
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(pc.bold(pc.cyan('         GOOGLE TOP 10 RANK CHECKER               ')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Keyword:')}    ${pc.yellow(keyword)}`);
    console.log(`${pc.bold('Target:')}     ${pc.underline(url)}`);
    console.log(`${pc.bold('Domain:')}     ${result.targetDomain}`);
    console.log(`${pc.bold('Source:')}     ${result.source === 'serpapi' ? pc.green('SerpAPI') : pc.yellow('Playwright (free, captcha-prone)')}`);
    console.log(`${pc.bold('Checked At:')} ${pc.gray(result.checkedAt)}`);
    console.log();

    if (result.error) {
      console.log(pc.red(`✗ ${result.error}`));
      console.log(pc.gray('Tip: get a free key at https://serpapi.com (100/mo), then run: $env:SERPAPI_KEY="your_key"'));
      console.log();
      return;
    }

    if (result.inTop10 && result.position) {
      console.log(pc.green(pc.bold(`✓ FOUND in TOP 10 at position #${result.position}`)));
    } else {
      console.log(pc.red(pc.bold('✗ NOT in TOP 10')));
    }
    console.log();

    if (result.topResults.length > 0) {
      console.log(pc.bold('Top 10 Organic Results:'));
      console.log(pc.gray('──────────────────────────────────────────────────'));
      result.topResults.forEach((item) => {
        const isTarget = item.position === result.position;
        const bullet = isTarget ? pc.green('►') : pc.gray('•');
        const posStr = isTarget ? pc.green(pc.bold(`#${item.position}`)) : pc.gray(`#${item.position}`);
        const title = isTarget ? pc.green(pc.bold(item.title)) : pc.white(item.title);
        console.log(`${bullet} ${posStr} ${title}`);
        console.log(`     ${pc.gray(item.url)}`);
      });
    } else {
      console.log(pc.yellow('No organic results parsed. Google may have served a captcha or non-standard layout.'));
    }
    console.log();

  } catch (err: any) {
    console.error(pc.red(`\nRank check failed: ${err.message}`));
    process.exit(1);
  }
}
