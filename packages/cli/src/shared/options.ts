import { Command } from 'commander';

export function addCrawlOptions(cmd: Command): Command {
  return cmd
    .option('-t, --tier <tier>', 'Execution tier: fast, standard, deep, enterprise (overrides preset)')
    .option('-p, --preset <preset>', 'Audit preset: quick, standard, deep, enterprise', 'standard')
    .option('-d, --depth <n>', 'Override crawling depth limit', (value: string) => parseInt(value, 10))
    .option('-m, --max-pages <n>', 'Override maximum pages limit', (value: string) => parseInt(value, 10))
    .option('-c, --concurrency <n>', 'Override concurrency limit', (value: string) => parseInt(value, 10))
    .option('--rate-limit <n>', 'Override rate limit in milliseconds', (value: string) => parseInt(value, 10))
    .option('--retry-count <n>', 'Override retry count for failed requests', (value: string) => parseInt(value, 10))
    .option('--exclude <pattern...>', 'Exclude URLs matching pattern(s)')
    .option('--include <pattern...>', 'Only include URLs matching pattern(s)')
    .option('--playwright', 'Use Playwright headless browser rendering')
    .option('--lighthouse', 'Enable Lighthouse performance metrics and Core Web Vitals (slower)')
    .option('--lighthouse-sample <n>', 'Number of pages to sample with Lighthouse', (value: string) => parseInt(value, 10));
}

export function addOutputOptions(cmd: Command): Command {
  return cmd
    .option('-f, --format <fmt>', 'Output format: terminal, json, html, sarif, both, all', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-v, --verbose', 'Show full diagnostic findings details', false);
}

export function addCiOptions(cmd: Command): Command {
  return cmd
    .option('--ci', 'CI mode (no interactive prompts, non-zero exit codes)', false)
    .option('--fail-on <severities>', 'Comma-separated severities that trigger exit code 1 (default: critical,error)');
}

export function addBudgetOptions(cmd: Command): Command {
  return cmd
    .option('--budget-lcp <ms>', 'Largest Contentful Paint budget in ms', (value: string) => parseInt(value, 10))
    .option('--budget-cls <n>', 'Cumulative Layout Shift budget', (value: string) => parseFloat(value))
    .option('--budget-inp <ms>', 'Interaction to Next Paint budget in ms', (value: string) => parseInt(value, 10))
    .option('--budget-js <bytes>', 'Total JavaScript payload budget', (value: string) => parseInt(value, 10));
}

export function addPerfOptions(cmd: Command): Command {
  return cmd
    .option('--legacy-buffered', 'Use legacy buffered pipeline instead of streaming', false)
    .option('--no-cache', 'Disable persistent crawl cache', false)
    .option('--cache-dir <path>', 'Custom cache directory')
    .option('--no-adaptive', 'Disable adaptive concurrency (AIMD)', false)
    .option('--rule-concurrency <n>', 'Max concurrent rules per page', (value: string) => parseInt(value, 10));
}
