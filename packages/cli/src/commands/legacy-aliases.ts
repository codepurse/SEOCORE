import { Command } from 'commander';
import pc from 'picocolors';
import { handler as robotsHandler } from './inspect/robots.js';
import { handler as sitemapHandler } from './inspect/sitemap.js';
import { handler as llmsTxtHandler } from './inspect/llms-txt.js';
import { handler as schemaHandler } from './inspect/schema.js';
import { handler as hreflangHandler } from './inspect/hreflang.js';
import { handler as backlinksHandler } from './inspect/backlinks.js';
import { handler as rankHandler } from './inspect/rank.js';
import { handler as screenshotHandler } from './inspect/screenshot.js';
import { handler as contentHandler } from './analyze/content.js';
import { handler as aiVisibilityHandler } from './analyze/ai-visibility.js';
import { handler as configInitHandler } from './config/init.js';
import { handler as configValidateHandler } from './config/validate.js';
import { handler as rulesListHandler } from './rules/list.js';
import { handler as tierListHandler } from './tier/list.js';

export function registerLegacyAliases(program: Command): void {
  const showWarning = (newPath: string) => {
    if (!process.env.CI && process.stdout.isTTY) {
      console.warn(pc.yellow(`⚠️  This command is deprecated. Please use: ${pc.bold(newPath)} instead.`));
    }
  };

  program
    .command('robots <url>', { hidden: true })
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(async (url, opts) => {
      showWarning('inspect robots <url>');
      await robotsHandler(url, opts);
    });

  program
    .command('sitemap <url>', { hidden: true })
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--list-urls', 'List all URLs from the sitemap', false)
    .option('--check-links', 'Check if sitemap URLs are reachable', false)
    .action(async (url, opts) => {
      showWarning('inspect sitemap <url>');
      await sitemapHandler(url, opts);
    });

  program
    .command('llms-txt <url>', { hidden: true })
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--check-bots <bots>', 'Comma-separated list of bots to check', 'GPTBot,ClaudeBot,PerplexityBot,Google-Extended')
    .option('--check-well-known', 'Also check /.well-known/llms.txt', true)
    .option('--verbose', 'Show full directive parsing details', false)
    .action(async (url, opts) => {
      showWarning('inspect llms-txt <url>');
      await llmsTxtHandler(url, opts);
    });

  program
    .command('schema <url>', { hidden: true })
    .option('--schema <types>', 'Filter to specific schema types (comma-separated)')
    .option('--json', 'Output raw JSON')
    .option('-f, --format <format>', 'Output format: terminal, json, sarif', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(async (url, opts) => {
      showWarning('inspect schema <url>');
      await schemaHandler(url, opts);
    });

  program
    .command('validate <url>', { hidden: true })
    .option('--schema <types>', 'Filter to specific schema types (comma-separated)')
    .option('--json', 'Output raw JSON')
    .option('-f, --format <format>', 'Output format: terminal, json, sarif', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(async (url, opts) => {
      showWarning('config validate <url>');
      await configValidateHandler(url, opts);
    });

  program
    .command('hreflang <url>', { hidden: true })
    .option('--deep', 'Validate all pages on the site', false)
    .option('--lang <codes>', 'Filter to specific languages (comma-separated)')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(async (url, opts) => {
      showWarning('inspect hreflang <url>');
      await hreflangHandler(url, opts);
    });

  program
    .command('backlinks <url>', { hidden: true })
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('-l, --limit <number>', 'Maximum number of backlinks to fetch', parseInt, 100)
    .action(async (url, opts) => {
      showWarning('inspect backlinks <url>');
      await backlinksHandler(url, opts);
    });

  program
    .command('rank-check <keyword> <url>', { hidden: true })
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--show', 'Show Chrome window (useful for solving captcha or debugging)', false)
    .action(async (keyword, url, opts) => {
      showWarning('inspect rank <keyword> <url>');
      await rankHandler(keyword, url, opts);
    });

  program
    .command('screenshot <url>', { hidden: true })
    .option('--breakpoints <sizes>', 'Viewport breakpoints (comma-separated: mobile,tablet,desktop)')
    .option('--device <name>', 'Use Playwright device descriptor (e.g., "iPhone 15 Pro")')
    .option('--full-page', 'Capture full-page screenshots (not just viewport)')
    .option('--deep', 'Capture screenshots for all pages on site instead of just landing')
    .option('-o, --output <path>', 'Output directory for screenshots (default: ./screenshots)')
    .option('-c, --config <path>', 'Path to seocore.config.json')
    .option('--timeout <ms>', 'Navigation timeout in milliseconds (default: 30000)', '30000')
    .action(async (url, opts) => {
      showWarning('inspect screenshot <url>');
      await screenshotHandler(url, opts);
    });

  program
    .command('content <url>', { hidden: true })
    .alias('eeat')
    .option('--deep', 'Analyze all pages on site instead of just landing', false)
    .option('--focus <categories>', 'Focus on specific categories (comma-separated)')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('--ci', 'Enable CI mode with non-zero exit codes', false)
    .option('--budget-eeat <score>', 'Fail CI if overall E-E-A-T score is below this number')
    .option('--budget-content <score>', 'Fail CI if overall content quality score is below this number')
    .action(async (url, opts) => {
      showWarning('analyze content <url>');
      await contentHandler(url, opts);
    });

  program
    .command('ai-visibility <url>', { hidden: true })
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
    .option('-o, --output <path>', 'JSON or HTML export file path')
    .option('-v, --verbose', 'Show full diagnostic findings details', false)
    .action(async (url, opts) => {
      showWarning('analyze ai-visibility <url>');
      await aiVisibilityHandler(url, opts);
    });

  program
    .command('config:init', { hidden: true })
    .action(async () => {
      showWarning('config init');
      await configInitHandler();
    });

  program
    .command('rules:list', { hidden: true })
    .action(async () => {
      showWarning('rules list');
      await rulesListHandler();
    });

  program
    .command('tier:list', { hidden: true })
    .action(async () => {
      showWarning('tier list');
      await tierListHandler();
    });
}
