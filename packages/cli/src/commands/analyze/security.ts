import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl } from '../../shared/index.js';
import { runSecurityAudit } from '../../security/index.js';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('security')
      .description('Audit a page\'s security headers, transport, CSP, cookies, and disclosure posture')
      .argument('<url>', 'Target website URL')
      .option('--json', 'Output results in raw JSON format', false)
      .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
      .option('-o, --output <path>', 'JSON or HTML export file path')
      .option('-v, --verbose', 'Show remediation steps and evidence for each finding', false)
      .option('--config <path>', 'Path to seocore.config.json file')
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore analyze security https://example.com',
          'seocore analyze security https://example.com --verbose',
          'seocore analyze security https://example.com --format html --output ./security-report.html',
        ],
      },
    ],
  );
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);
    await runSecurityAudit(url, {
      json: options.json,
      format: options.format,
      output: options.output,
      verbose: options.verbose,
      config: options.config,
    });
  } catch (err: any) {
    console.error(pc.red(`\nSecurity audit failed: ${err.message}`));
    process.exit(1);
  }
}
