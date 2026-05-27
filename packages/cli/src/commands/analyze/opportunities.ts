import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { OpportunitiesAnalyzer, PageSearchData } from '@seocore/analyzers';
import { validateUrl } from '../../shared/index.js';

export function command(): Command {
  return new Command('opportunities')
    .description('Identify SEO opportunities based on crawl findings and search data')
    .argument('<url>', 'Target website starting URL')
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('--with-gsc', 'Include GSC data from export file', false)
    .option('--with-crux', 'Include CrUX field data', false)
    .option('--gsc-file <path>', 'Path to GSC export JSON file')
    .option('--full', 'Crawl the entire site', false)
    .option('-d, --depth <number>', 'Crawl depth limit', parseInt)
    .option('-m, --max-pages <number>', 'Maximum pages to crawl', parseInt)
    .action(handler);
}

async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    console.log(pc.cyan('\n🎯  Analyzing search opportunities...\n'));

    const gscData = await loadGscData(options);
    const cruxData = await loadCruxData(options);

    const partialConfig: any = {
      maxPages: options.maxPages || (options.full ? 100 : 50),
      maxDepth: options.depth || (options.full ? 5 : 3),
      preset: 'standard',
    };

    const eventBus = new EventBus();
    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig);

    const analyzer = new OpportunitiesAnalyzer();

    if (gscData.length > 0) {
      analyzer.setGscData(gscData);
    }
    if (cruxData.length > 0) {
      analyzer.setCruxData(cruxData);
    }

    const opportunitiesResult = analyzer.analyze(result.pages, result.findings, url);

    if (options.format === 'json') {
      const outPath = options.output || './opportunities-report.json';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, JSON.stringify(opportunitiesResult, null, 2), 'utf8');
      console.log(pc.green(`✓  JSON report exported to ${pc.bold(outPath)}`));
      return;
    }

    printTerminalReport(opportunitiesResult);
  } catch (err: any) {
    console.error(pc.red(`\nOpportunities analysis failed: ${err.message}`));
    process.exit(1);
  }
}

async function loadGscData(options: any): Promise<PageSearchData[]> {
  if (!options.gscFile && !options.withGsc) {
    return [];
  }

  const gscPath = options.gscFile;
  if (!gscPath) {
    console.log(pc.yellow('⚠  --with-gsc specified but no --gsc-file provided. Skipping GSC data.'));
    return [];
  }

  try {
    const fs = await import('node:fs');
    if (!fs.existsSync(gscPath)) {
      console.log(pc.yellow(`⚠  GSC file not found: ${gscPath}. Skipping GSC data.`));
      return [];
    }

    const content = fs.readFileSync(gscPath, 'utf8');
    const data = JSON.parse(content);

    if (Array.isArray(data)) {
      return data.map((item: any) => ({
        url: item.url || item.page || item.pageUrl,
        gsc: {
          impressions: item.impressions,
          clicks: item.clicks,
          ctr: item.ctr,
          position: item.position,
        },
      }));
    }

    return [];
  } catch (err) {
    console.log(pc.yellow(`⚠  Failed to load GSC data: ${(err as Error).message}`));
    return [];
  }
}

async function loadCruxData(options: any): Promise<PageSearchData[]> {
  if (!options.withCrux) {
    return [];
  }

  console.log(pc.yellow('⚠  CrUX data requires API access. Using heuristics only.'));

  return [];
}

function printTerminalReport(result: any): void {
  const { opportunities, dataSource, enrichedPages } = result;

  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                 SEARCH OPPORTUNITIES')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  const dataSourceLabel = dataSource === 'none' ? 'No external data' :
    dataSource === 'gsc' ? 'Google Search Console' :
    dataSource === 'crux' ? 'CrUX Field Data' : 'Crawl heuristics';
  console.log(`${pc.bold('Data Source:')} ${pc.cyan(dataSourceLabel)}`);
  console.log(`${pc.bold('Enriched Pages:')} ${enrichedPages > 0 ? pc.green(String(enrichedPages)) : pc.gray('0')}`);
  console.log();

  if (opportunities.length === 0) {
    console.log(pc.green('✓  No significant SEO opportunities detected!\n'));
    return;
  }

  const highPriority = opportunities.filter((o: any) => o.priority === 'high');
  const mediumPriority = opportunities.filter((o: any) => o.priority === 'medium');
  const lowPriority = opportunities.filter((o: any) => o.priority === 'low');

  if (highPriority.length > 0) {
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`HIGH PRIORITY OPPORTUNITIES (${highPriority.length}):`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));

    for (const opp of highPriority.slice(0, 10)) {
      printOpportunity(opp);
    }
    if (highPriority.length > 10) {
      console.log(`  ${pc.gray(`... and ${highPriority.length - 10} more high-priority opportunities`)}`);
    }
    console.log();
  }

  if (mediumPriority.length > 0) {
    console.log(pc.bold(pc.yellow('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.yellow(`MEDIUM PRIORITY OPPORTUNITIES (${mediumPriority.length}):`)));
    console.log(pc.yellow('───────────────────────────────────────────────────────────────'));

    for (const opp of mediumPriority.slice(0, 8)) {
      printOpportunity(opp);
    }
    if (mediumPriority.length > 8) {
      console.log(`  ${pc.gray(`... and ${mediumPriority.length - 8} more medium-priority opportunities`)}`);
    }
    console.log();
  }

  if (lowPriority.length > 0) {
    console.log(pc.bold(pc.gray('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.gray(`LOW PRIORITY OPPORTUNITIES (${lowPriority.length}):`)));
    console.log(pc.gray('───────────────────────────────────────────────────────────────'));

    for (const opp of lowPriority.slice(0, 5)) {
      printOpportunity(opp);
    }
    if (lowPriority.length > 5) {
      console.log(`  ${pc.gray(`... and ${lowPriority.length - 5} more low-priority opportunities`)}`);
    }
    console.log();
  }

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  console.log(pc.bold('SUMMARY:'));
  console.log(`  ${pc.red('●')} High:   ${pc.red(String(highPriority.length))}`);
  console.log(`  ${pc.yellow('●')} Medium: ${pc.yellow(String(mediumPriority.length))}`);
  console.log(`  ${pc.gray('●')} Low:    ${pc.gray(String(lowPriority.length))}`);
  console.log();

  if (highPriority.length > 0) {
    console.log(pc.yellow('💡 Focus on high-priority opportunities first for maximum ROI.\n'));
  }
}

function printOpportunity(opp: any): void {
  const typeIcon = opp.type === 'metadata' ? '📝' :
    opp.type === 'performance' ? '⚡' :
    opp.type === 'indexing' ? '🔍' :
    opp.type === 'internal-links' ? '🔗' :
    opp.type === 'schema' ? '📋' : '📄';

  const typeLabel = opp.type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  const urlShort = opp.url.length > 65 ? opp.url.slice(0, 62) + '...' : opp.url;

  console.log(`  ${typeIcon} ${pc.bold(typeLabel)}`);
  console.log(`    ${pc.cyan(urlShort)}`);
  if (opp.title) {
    console.log(`    ${pc.gray('└─')} Title: "${opp.title.slice(0, 50)}${opp.title.length > 50 ? '...' : ''}"`);
  }
  console.log(`    ${pc.gray('└─')} ${opp.reason}`);

  const metrics = Object.entries(opp.supportingMetrics);
  if (metrics.length > 0) {
    const metricStr = metrics.map(([k, v]) => `${k}: ${v}`).join(' | ');
    console.log(`    ${pc.gray('└─')} Metrics: ${metricStr}`);
  }

  if (opp.recommendedActions.length > 0) {
    console.log(`    ${pc.green('→')} Actions:`);
    for (const action of opp.recommendedActions.slice(0, 2)) {
      console.log(`       • ${action}`);
    }
    if (opp.recommendedActions.length > 2) {
      console.log(`       ${pc.gray(`... and ${opp.recommendedActions.length - 2} more`)}`);
    }
  }
  console.log();
}
