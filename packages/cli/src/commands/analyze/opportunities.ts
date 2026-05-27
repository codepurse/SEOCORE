import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import {
  OpportunitiesAnalyzer,
  loadGscFile,
  loadCruxFile,
  PageSearchData,
} from '@seocore/analyzers';
import { validateUrl } from '../../shared/index.js';
import { generateHtmlReport } from './html-reporter.js';

export function command(): Command {
  return new Command('opportunities')
    .description('Identify SEO opportunities based on crawl findings and search data')
    .argument('<url>', 'Target website starting URL')
    .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('--with-gsc', 'Include GSC data from export file', false)
    .option('--with-crux', 'Include CrUX field data', false)
    .option('--gsc-file <path>', 'Path to GSC export JSON file')
    .option('--crux-file <path>', 'Path to CrUX field data JSON file')
    .option('--full', 'Crawl the entire site', false)
    .option('-d, --depth <number>', 'Crawl depth limit', parseInt)
    .option('-m, --max-pages <number>', 'Maximum pages to crawl', parseInt)
    .option('--top <n>', 'Limit shown/exported top items', parseInt)
    .option('--min-priority <priority>', 'Minimum priority to display (low, medium, high)', 'low')
    .option('--verbose', 'Show full score breakdown and warning counts', false)
    .action(handler);
}

async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    if (options.verbose) {
      console.log(pc.cyan(`\n🎯  Analyzing search opportunities in Verbose mode...\n`));
    } else {
      console.log(pc.cyan('\n🎯  Analyzing search opportunities...\n'));
    }

    // 1. Loader step with provider abstraction layer
    let gscData: any[] = [];
    let cruxData: any[] = [];

    if (options.withGsc || options.gscFile) {
      const gscPath = options.gscFile || './gsc-pages.json';
      const loader = loadGscFile(gscPath);
      if (loader.error) {
        console.log(pc.yellow(`⚠  GSC Loader warning: ${loader.error}. Falling back to crawl heuristics.`));
      } else {
        gscData = loader.data;
        if (options.verbose && loader.warningCount > 0) {
          console.log(pc.yellow(`⚠  GSC Loader warning: Skipped ${loader.warningCount} malformed rows.`));
        }
      }
    }

    if (options.withCrux || options.cruxFile) {
      const cruxPath = options.cruxFile || './crux-pages.json';
      const loader = loadCruxFile(cruxPath);
      if (loader.error) {
        console.log(pc.yellow(`⚠  CrUX Loader warning: ${loader.error}. Using synthetic core web vitals.`));
      } else {
        cruxData = loader.data;
        if (options.verbose && loader.warningCount > 0) {
          console.log(pc.yellow(`⚠  CrUX Loader warning: Skipped ${loader.warningCount} malformed rows.`));
        }
      }
    }

    // 2. Engine run configuration
    const partialConfig: any = {
      maxPages: options.maxPages || (options.full ? 100 : 50),
      maxDepth: options.depth || (options.full ? 5 : 3),
      preset: 'standard',
    };

    const eventBus = new EventBus();
    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig);

    // 3. Formulate opportunities
    const analyzer = new OpportunitiesAnalyzer();

    if (gscData.length > 0) {
      const searchData: PageSearchData[] = gscData.map(d => ({
        url: d.url,
        gsc: d,
      }));
      analyzer.setGscData(searchData);
    }
    
    if (cruxData.length > 0) {
      const searchData: PageSearchData[] = cruxData.map(d => ({
        url: d.url,
        crux: d,
      }));
      analyzer.setCruxData(searchData);
    }

    const opportunitiesResult = analyzer.analyze(result.pages, result.findings, url);

    // Filter by min-priority if requested
    const minPriorityMap = { low: 0, medium: 1, high: 2 };
    const minVal = minPriorityMap[options.minPriority as 'low' | 'medium' | 'high'] || 0;
    
    let filteredOpportunities = opportunitiesResult.opportunities.filter(opp => {
      const val = minPriorityMap[opp.priority] || 0;
      return val >= minVal;
    });

    // Handle --top limiting
    if (options.top && !isNaN(options.top)) {
      filteredOpportunities = filteredOpportunities.slice(0, options.top);
    }

    opportunitiesResult.opportunities = filteredOpportunities;

    // Recalculate summary counts based on remaining filtered items
    const high = filteredOpportunities.filter(o => o.priority === 'high').length;
    const medium = filteredOpportunities.filter(o => o.priority === 'medium').length;
    const low = filteredOpportunities.filter(o => o.priority === 'low').length;
    
    opportunitiesResult.summary.high = high;
    opportunitiesResult.summary.medium = medium;
    opportunitiesResult.summary.low = low;

    // 4. Output rendering pathways
    if (options.format === 'json') {
      const outPath = options.output || './opportunities-report.json';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, JSON.stringify(opportunitiesResult, null, 2), 'utf8');
      console.log(pc.green(`✓  JSON report exported to ${pc.bold(outPath)}`));
      return;
    }

    if (options.format === 'html') {
      const outPath = options.output || './opportunities-report.html';
      const htmlContent = generateHtmlReport(opportunitiesResult);
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, htmlContent, 'utf8');
      console.log(pc.green(`✓  HTML report exported to ${pc.bold(outPath)}`));
      return;
    }

    printTerminalReport(opportunitiesResult, options.verbose);
  } catch (err: any) {
    console.error(pc.red(`\nOpportunities analysis failed: ${err.message}`));
    process.exit(1);
  }
}

function printTerminalReport(result: any, verbose: boolean): void {
  const { opportunities, dataSource, enrichedPages, scannedPages, summary } = result;

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                 SEARCH OPPORTUNITIES')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  const dataSourceLabel = dataSource === 'none' ? 'No external data' :
    dataSource === 'gsc' ? 'Google Search Console' :
    dataSource === 'gsc+crux' ? 'GSC + CrUX Field Data' : 'Crawl heuristics';
  
  console.log(`${pc.bold('Data Source:')} ${pc.cyan(dataSourceLabel)}`);
  console.log(`${pc.bold('Scanned Pages:')} ${pc.white(String(scannedPages))}`);
  console.log(`${pc.bold('Enriched Pages:')} ${enrichedPages > 0 ? pc.green(String(enrichedPages)) : pc.gray('0')}`);
  console.log();

  if (opportunities.length === 0) {
    console.log(pc.green('✓  No significant SEO opportunities matching your criteria detected!\n'));
    return;
  }

  const highPriority = opportunities.filter((o: any) => o.priority === 'high');
  const mediumPriority = opportunities.filter((o: any) => o.priority === 'medium');
  const lowPriority = opportunities.filter((o: any) => o.priority === 'low');

  if (highPriority.length > 0) {
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`HIGH PRIORITY OPPORTUNITIES (${highPriority.length}):`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));

    for (const opp of highPriority) {
      printOpportunity(opp, verbose);
    }
    console.log();
  }

  if (mediumPriority.length > 0) {
    console.log(pc.bold(pc.yellow('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.yellow(`MEDIUM PRIORITY OPPORTUNITIES (${mediumPriority.length}):`)));
    console.log(pc.yellow('───────────────────────────────────────────────────────────────'));

    for (const opp of mediumPriority) {
      printOpportunity(opp, verbose);
    }
    console.log();
  }

  if (lowPriority.length > 0) {
    console.log(pc.bold(pc.gray('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.gray(`LOW PRIORITY OPPORTUNITIES (${lowPriority.length}):`)));
    console.log(pc.gray('───────────────────────────────────────────────────────────────'));

    for (const opp of lowPriority) {
      printOpportunity(opp, verbose);
    }
    console.log();
  }

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  console.log(pc.bold('SUMMARY (Grouped by Priority):'));
  console.log(`  ${pc.red('●')} High:   ${pc.red(String(summary.high))}`);
  console.log(`  ${pc.yellow('●')} Medium: ${pc.yellow(String(summary.medium))}`);
  console.log(`  ${pc.gray('●')} Low:    ${pc.gray(String(summary.low))}`);
  console.log();

  console.log(pc.bold('SUMMARY (Grouped by Type):'));
  for (const [type, count] of Object.entries(summary.byType)) {
    if ((count as number) > 0) {
      console.log(`  • ${pc.bold(type.toUpperCase())}: ${count}`);
    }
  }
  console.log();

  if (highPriority.length > 0) {
    console.log(pc.yellow('💡 Focus on high-priority opportunities first for maximum ROI.\n'));
  }
}

function printOpportunity(opp: any, verbose: boolean): void {
  const typeIcon = opp.type === 'metadata' ? '📝' :
    opp.type === 'performance' ? '⚡' :
    opp.type === 'indexing' ? '🔍' :
    opp.type === 'internal-links' ? '🔗' :
    opp.type === 'schema' ? '📋' : '📄';

  const typeLabel = opp.type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  const urlShort = opp.url.length > 65 ? opp.url.slice(0, 62) + '...' : opp.url;

  console.log(`  ${typeIcon} ${pc.bold(typeLabel)} ${pc.gray(`[Score: ${opp.score}]`)}`);
  console.log(`    ${pc.cyan(urlShort)}`);
  if (opp.title) {
    console.log(`    ${pc.gray('└─')} Title: "${opp.title.slice(0, 50)}${opp.title.length > 50 ? '...' : ''}"`);
  }
  console.log(`    ${pc.gray('└─')} Reason: ${opp.reason}`);

  const metrics = Object.entries(opp.supportingMetrics);
  if (metrics.length > 0) {
    const metricStr = metrics.map(([k, v]) => `${k}: ${v}`).join(' | ');
    console.log(`    ${pc.gray('└─')} Metrics: ${metricStr}`);
  }

  if (verbose && opp.sourceSignals && opp.sourceSignals.length > 0) {
    console.log(`    ${pc.gray('└─')} Signals:`);
    for (const sig of opp.sourceSignals) {
      console.log(`       • ${pc.gray(sig)}`);
    }
  }

  if (opp.recommendedActions.length > 0) {
    console.log(`    ${pc.green('→')} Actions:`);
    for (const action of opp.recommendedActions.slice(0, 3)) {
      console.log(`       • ${action}`);
    }
    if (opp.recommendedActions.length > 3) {
      console.log(`       ${pc.gray(`... and ${opp.recommendedActions.length - 3} more`)}`);
    }
  }
  console.log();
}
