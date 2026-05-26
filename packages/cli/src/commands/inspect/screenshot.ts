import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl } from '../../shared/index.js';
import { captureScreenshots } from '../../screenshot.js';

export function command(): Command {
  return new Command('screenshot')
    .description('Capture visual screenshots of target page/site')
    .argument('<url>', 'Target URL')
    .option('--breakpoints <sizes>', 'Viewport breakpoints (comma-separated: mobile,tablet,desktop)')
    .option('--device <name>', 'Use Playwright device descriptor (e.g., "iPhone 15 Pro")')
    .option('--full-page', 'Capture full-page screenshots (not just viewport)')
    .option('--deep', 'Capture screenshots for all pages on site instead of just landing')
    .option('-o, --output <path>', 'Output directory for screenshots (default: ./screenshots)')
    .option('-c, --config <path>', 'Path to seocore.config.json')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds', '30000')
    .action(handler);
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
