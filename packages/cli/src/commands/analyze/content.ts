import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl } from '../../shared/index.js';
import { runContentCommand } from '../../content/index.js';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('content')
      .alias('eeat')
      .description('E-E-A-T & Content Quality analysis with AI citation readiness')
      .argument('<url>', 'Target URL')
      .option('--deep', 'Analyze all pages on site instead of just landing', false)
      .option('--focus <categories>', 'Focus on specific categories (comma-separated)')
      .option('--json', 'Output results in raw JSON format', false)
      .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
      .option('-o, --output <path>', 'Export file path')
      .option('--ci', 'Enable CI mode with non-zero exit codes', false)
      .option('--budget-eeat <score>', 'Fail CI if overall E-E-A-T score is below this number')
      .option('--budget-content <score>', 'Fail CI if overall content quality score is below this number')
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore analyze content https://example.com/blog/post',
          'seocore analyze content https://example.com --deep --focus eeat,readability',
          'seocore analyze content https://example.com --format html --output ./content-report.html',
          'seocore analyze content https://example.com --ci --budget-eeat 70 --budget-content 75',
        ],
      },
    ]
  );
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);
    await runContentCommand(url, {
      deep: options.deep,
      focus: options.focus,
      json: options.json,
      format: options.format as any,
      output: options.output,
      ci: options.ci,
      budgetEeat: options.budgetEeat ? Number(options.budgetEeat) : undefined,
      budgetContent: options.budgetContent ? Number(options.budgetContent) : undefined
    });
  } catch (err: any) {
    console.error(pc.red(`\nE-E-A-T & Content Quality analysis failed: ${err.message}`));
    process.exit(1);
  }
}
