import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl } from '../../shared/index.js';
import { runAiVisibility } from '../../ai-visibility/index.js';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('ai-visibility')
      .description('Analyze a website\'s visibility and structure for AI crawlers')
      .argument('<url>', 'Target website URL')
      .option('--json', 'Output results in raw JSON format', false)
      .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
      .option('-o, --output <path>', 'JSON or HTML export file path')
      .option('-v, --verbose', 'Show full diagnostic findings details', false)
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore analyze ai-visibility https://example.com',
          'seocore analyze ai-visibility https://example.com --verbose',
          'seocore analyze ai-visibility https://example.com --format html --output ./ai-visibility.html',
        ],
      },
    ]
  );
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);
    await runAiVisibility(url, { 
      json: options.json,
      format: options.format as any,
      output: options.output,
      verbose: options.verbose 
    });
  } catch (err: any) {
    console.error(pc.red(`\nAI Visibility Analysis failed: ${err.message}`));
    process.exit(1);
  }
}
