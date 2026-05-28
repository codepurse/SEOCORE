import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl } from '../../shared/index.js';
import { captureScreenshots } from '../../screenshot.js';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('screenshot')
      .description('Capture visual screenshots of target page/site')
      .argument('<url>', 'Target URL')
      .option('--breakpoints <sizes>', 'Viewport breakpoints (comma-separated: mobile,tablet,desktop)')
      .option('--device <name>', 'Use Playwright device descriptor (e.g., "iPhone 15 Pro")')
      .option('--full-page', 'Capture full-page screenshots (not just viewport)')
      .option('--deep', 'Capture screenshots for all pages on site instead of just landing')
      .option('-o, --output <path>', 'Output directory for screenshots (default: ./screenshots)')
      .option('-c, --config <path>', 'Path to seocore.config.json')
      .option('--timeout <ms>', 'Navigation timeout in milliseconds', '30000')
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore inspect screenshot https://example.com',
          'seocore inspect screenshot https://example.com --breakpoints mobile,tablet,desktop',
          'seocore inspect screenshot https://example.com --device "iPhone 15 Pro" --full-page',
          'seocore inspect screenshot https://example.com --deep --output ./screenshots',
        ],
      },
    ]
  );
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);
    await captureScreenshots(url, options);
  } catch (err: any) {
    console.error(pc.red(`\nScreenshot capture failed: ${err.message}`));
    process.exit(1);
  }
}
