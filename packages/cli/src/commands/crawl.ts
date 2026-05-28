import { SeoEngine } from '@seocore/engine';
import { AuditPreset, EventBus } from '@seocore/sdk';
import { Command } from 'commander';
import pc from 'picocolors';
import { buildPartialConfig, validateUrl } from '../shared/index.js';
import { buildHelp } from '../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('crawl')
      .description('Crawl a website and list discovered pages without scoring')
      .argument('<url>', 'Target website starting URL')
      .option('-p, --preset <preset>', 'Audit preset: quick, standard, deep, enterprise', 'standard')
      .option('-d, --depth <number>', 'Override crawling depth limit', parseInt)
      .option('-m, --max-pages <number>', 'Override maximum pages limit', parseInt)
      .option('-c, --concurrency <number>', 'Override concurrency limit', parseInt)
      .option('--rate-limit <number>', 'Override rate limit in milliseconds', parseInt)
      .option('--retry-count <number>', 'Override retry count for failed requests', parseInt)
      .option('--exclude <pattern...>', 'Exclude URLs matching pattern(s)')
      .option('--include <pattern...>', 'Only include URLs matching pattern(s)')
      .option('--playwright', 'Use Playwright headless browser rendering')
      .option('--lighthouse', 'Enable Lighthouse performance metrics')
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore crawl https://example.com',
          'seocore crawl https://example.com --depth 2 --max-pages 100',
          'seocore crawl https://example.com --include /blog/* --exclude /admin/*',
        ],
      },
    ]
  );
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    const partialConfig: any = buildPartialConfig(options);
    partialConfig.preset = options.preset as AuditPreset;
    if (options.maxPages === undefined) partialConfig.maxPages = 100;
    partialConfig.ruleOverrides = { '*': { enabled: false } };

    const eventBus = new EventBus();
    console.log(pc.cyan(`\n🕷  Discovered Crawl Nodes for ${pc.bold(url)}`));
    console.log(pc.gray('──────────────────────────────────────────────────'));
    eventBus.on('page:loaded', (data) => {
      const codeColor = data.statusCode === 200 ? pc.green : pc.red;
      console.log(
        ` • ${pc.cyan(data.url.padEnd(60))} ` +
        `(${codeColor(String(data.statusCode))}) - ${pc.yellow(`${data.loadTimeMs}ms`)}`
      );
    });

    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig);

    console.log(pc.gray('──────────────────────────────────────────────────'));
    console.log(pc.bold(pc.green(`Crawled ${result.pagesAudited} pages in ${result.totalLoadTimeMs}ms.\n`)));

  } catch (err: any) {
    console.error(pc.red(`\nCrawl failed: ${err.message}`));
    process.exit(1);
  }
}
