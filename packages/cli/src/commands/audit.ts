import { SeoEngine } from '@seocore/engine';
import { HtmlReporter, JsonReporter, SarifReporter, TerminalReporter } from '@seocore/reporter';
import { AuditPreset, EventBus, Finding, NormalizedPage, Severity } from '@seocore/sdk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import pc from 'picocolors';
import { attachStandardEvents, buildPartialConfig, validateTier, validateUrl } from '../shared/index.js';
import { addPerfOptions } from '../shared/options.js';
import { computeDiff, hasCriticalRegressions } from '../history/diff.js';
import { saveSnapshot, loadLatestSnapshot } from '../history/snapshot-store.js';
import { reportDiff } from '../history/reporter.js';
import { getHistoryDir } from '../history/path-utils.js';
import { explainDryRun, printDryRunSummary } from '../shared/explain.js';

function parseModuleOverride(input?: string): any {
  if (!input) return undefined;
  const normalized = input.split(',').map(s => s.trim()).filter(Boolean);
  const aliasMap: Record<string, keyof any> = { core: 'core', performance: 'performance', mobile: 'mobile', ai_visibility: 'aiVisibility', aiVisibility: 'aiVisibility', security: 'security', backlinks: 'backlinks', hreflang: 'hreflang' };
  const invalid = normalized.filter(e => !aliasMap[e]);
  if (invalid.length) throw new Error(`Invalid module override: ${invalid.join(', ')}`);
  const modules: any = { core: false, performance: false, mobile: false, aiVisibility: false, security: false, backlinks: false, hreflang: false };
  for (const entry of normalized) modules[aliasMap[entry]] = true;
  return modules;
}

export function command(): Command {
  return addPerfOptions(new Command('audit'))
    .description('Audit a website for SEO, speed, indexing, accessibility, and metadata')
    .argument('<url>', 'Target website starting URL')
    .option('-t, --tier <tier>', 'Execution tier: fast, standard, deep, enterprise')
    .option('-p, --preset <preset>', 'Audit preset: quick, standard, deep, enterprise', 'standard')
    .option('--full', 'Crawl the entire site based on tier/preset limits', false)
    .option('-d, --depth <number>', 'Override crawling depth limit', parseInt)
    .option('-m, --max-pages <number>', 'Override maximum pages to audit', parseInt)
    .option('-c, --concurrency <number>', 'Override concurrency limit', parseInt)
    .option('--rate-limit <number>', 'Override rate limit in milliseconds', parseInt)
    .option('--retry-count <number>', 'Override retry count for failed requests', parseInt)
    .option('--exclude <pattern...>', 'Exclude URLs matching pattern(s)')
    .option('--include <pattern...>', 'Only include URLs matching pattern(s)')
    .option('--playwright', 'Use Playwright headless browser rendering')
    .option('--lighthouse', 'Enable Lighthouse performance metrics (slower)')
    .option('--lighthouse-sample <number>', 'Number of pages to sample with Lighthouse', parseInt)
    .option('-f, --format <format>', 'Output format: terminal, json, html, both, all, sarif', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('-v, --verbose', 'Show full diagnostic findings details', false)
    .option('--min-severity <severity>', 'Minimum severity to show in terminal', 'warning')
    .option('--ci', 'Enable CI mode (no prompts, non-zero exit codes)', false)
    .option('--fail-on <severities>', 'Comma-separated severities triggering exit code 1', 'critical,error')
    .option('--budget-lcp <ms>', 'Largest Contentful Paint budget in ms', parseInt)
    .option('--budget-cls <number>', 'Cumulative Layout Shift budget', parseFloat)
    .option('--budget-inp <ms>', 'Interaction to Next Paint budget in ms', parseInt)
    .option('--budget-js <bytes>', 'Total JavaScript payload budget', parseInt)
    .option('--module <modules>', 'Comma-separated module override')
    .option('--save', 'Save audit result as a reusable snapshot', false)
    .option('--diff', 'Compare current audit against the latest saved snapshot', false)
    .option('--history-dir <path>', 'Custom history directory for snapshots')
    .option('--dry-run', 'Show planned tier/modules/rules without crawling', false)
    .action(handler);
}

async function handleDiff(
  url: string,
  currentResult: Awaited<ReturnType<SeoEngine['run']>>,
  options: any
): Promise<void> {
  const historyDir = options.historyDir || process.env.SEOCORE_HISTORY_DIR || getHistoryDir();
  
  const baselineSnapshot = loadLatestSnapshot(url, historyDir);
  
  if (!baselineSnapshot) {
    console.error(pc.red(`\nNo saved snapshot found for ${url}`));
    console.log(pc.yellow(`Run \`seocore audit ${url} --save\` first to create a baseline snapshot.`));
    process.exit(1);
  }
  
  const currentSnapshot = {
    metadata: {
      url,
      host: baselineSnapshot.metadata.host,
      savedAt: new Date().toISOString(),
      cliVersion: '1.0.0',
      tier: options.tier,
      score: currentResult.score,
      snapshotPath: '',
    },
    result: currentResult,
  };
  
  const diff = computeDiff(baselineSnapshot.result, currentResult);
  
  reportDiff(baselineSnapshot, currentSnapshot, diff, {
    verbose: options.verbose,
    ci: options.ci,
  });
  
  if (options.ci && hasCriticalRegressions(diff)) {
    process.exit(1);
  }
}

async function handleSave(
  url: string,
  currentResult: Awaited<ReturnType<SeoEngine['run']>>,
  options: any
): Promise<void> {
  const historyDir = options.historyDir || process.env.SEOCORE_HISTORY_DIR;
  
  saveSnapshot(currentResult, {
    historyDir,
    cliVersion: '1.0.0',
    tier: options.tier,
    config: {
      preset: options.preset,
      full: options.full,
      maxPages: options.maxPages,
      maxDepth: options.depth,
      concurrency: options.concurrency,
      playwright: options.playwright,
      lighthouse: options.lighthouse,
      modules: options.module ? parseModuleOverride(options.module) : undefined,
    },
  });
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');
    const tier = validateTier(options.tier);

    if (options.dryRun) {
      console.log(pc.yellow('\n⚠️  DRY RUN MODE - No crawl will be performed\n'));
      
      const dryRunOutput = await explainDryRun(url, options);
      printDryRunSummary(dryRunOutput, url);
      return;
    }

    const partialConfig: any = buildPartialConfig(options);
    partialConfig.preset = options.preset as AuditPreset;

    if (!options.full) {
      if (options.maxPages === undefined) partialConfig.maxPages = 1;
      if (options.depth === undefined) partialConfig.maxDepth = 1;
    }

    let useLighthouse = options.lighthouse;
    if (!options.ci && options.full && useLighthouse === undefined) {
      console.log(pc.yellow('\n⚠️  Lighthouse will run on EVERY page in a full scan, which can be very slow!'));
      const answers = await inquirer.prompt([
        { type: 'confirm', name: 'enableLighthouse', message: 'Do you want to keep Lighthouse enabled for this full scan?', default: true }
      ]);
      useLighthouse = answers.enableLighthouse;
    }
    if (useLighthouse !== undefined) partialConfig.lighthouseEnabled = useLighthouse;

    const eventBus = new EventBus();
    attachStandardEvents(eventBus, { verbose: options.verbose });

    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig, tier);

    if (options.diff) {
      await handleDiff(url, result, options);
    }

    if (options.save) {
      await handleSave(url, result, options);
    }

    if (options.diff && options.save) {
      console.log(pc.gray('\n--- Saving current audit as new snapshot ---\n'));
      await handleSave(url, result, options);
    }

    if (!options.diff) {
      const format = options.format;
      if (format === 'json' || format === 'both' || format === 'all') {
        const outPath = options.output && options.output.endsWith('.json') ? options.output : './seocore-report.json';
        const absolutePath = JsonReporter.export(result, outPath);
        console.log(pc.green(`✓  JSON Report exported to ${pc.bold(absolutePath)}`));
      }

      if (format === 'html' || format === 'all') {
        const outPath = options.output && options.output.endsWith('.html') ? options.output : './seocore-report.html';
        const absolutePath = HtmlReporter.export(result, outPath);
        console.log(pc.green(`✓  HTML Report exported to ${pc.bold(absolutePath)}`));
      }

      if (format === 'sarif') {
        const outPath = options.output && options.output.endsWith('.sarif') ? options.output : './seocore-report.sarif';
        const absolutePath = SarifReporter.export(result, outPath);
        console.log(pc.green(`✓  SARIF Report exported to ${pc.bold(absolutePath)}`));
      }

      if (format === 'terminal' || format === 'both' || format === 'all') {
        TerminalReporter.report(result, {
          verbose: options.verbose,
          minSeverity: options.minSeverity as Severity,
        });
      }
    }

    if (options.ci) {
      let exitCode = 0;
      const failOnSeverities = options.failOn ? options.failOn.split(',') : ['critical', 'error'];
      const hasMatchingFindings = result.findings.some((finding: Finding) => failOnSeverities.includes(finding.severity));
      if (hasMatchingFindings) {
        exitCode = 1;
      }

      let budgetExceeded = false;
      interface BudgetResult { metric: string; budget: number; actual: number; passed: boolean; }
      const budgetResults: BudgetResult[] = [];

      const pages = Object.values(result.pages || {}) as NormalizedPage[];
      const pagesWithVitals = pages.filter(p => p.coreWebVitals);
      if (pagesWithVitals.length > 0) {
        const avgLcp = pagesWithVitals.reduce((sum, p) => sum + (p.coreWebVitals?.lcp || 0), 0) / pagesWithVitals.length;
        const avgCls = pagesWithVitals.reduce((sum, p) => sum + (p.coreWebVitals?.cls || 0), 0) / pagesWithVitals.length;
        const avgInp = pagesWithVitals.reduce((sum, p) => sum + (p.coreWebVitals?.inp || 0), 0) / pagesWithVitals.length;

        if (options.budgetLcp !== undefined) {
          const passed = avgLcp <= options.budgetLcp;
          budgetResults.push({ metric: 'LCP', budget: options.budgetLcp, actual: avgLcp, passed });
          if (!passed) budgetExceeded = true;
        }
        if (options.budgetCls !== undefined) {
          const passed = avgCls <= options.budgetCls;
          budgetResults.push({ metric: 'CLS', budget: options.budgetCls, actual: avgCls, passed });
          if (!passed) budgetExceeded = true;
        }
        if (options.budgetInp !== undefined) {
          const passed = avgInp <= options.budgetInp;
          budgetResults.push({ metric: 'INP', budget: options.budgetInp, actual: avgInp, passed });
          if (!passed) budgetExceeded = true;
        }
      }

      if (options.budgetJs !== undefined) {
        const totalJs = pages.reduce((sum, p) => sum + (p.resources?.jsSizeBytes || 0), 0) as number;
        const passed = totalJs <= options.budgetJs;
        budgetResults.push({ metric: 'JS Payload', budget: options.budgetJs, actual: totalJs, passed });
        if (!passed) budgetExceeded = true;
      }

      if (budgetExceeded) {
        exitCode = exitCode === 1 ? 3 : 2;
      }

      if (budgetResults.length > 0) {
        console.log('\n' + pc.bold('PERFORMANCE BUDGETS:'));
        for (const br of budgetResults) {
          const statusColor = br.passed ? pc.green : pc.red;
          console.log(`  ${br.metric.padEnd(15)} Budget: ${br.budget}, Actual: ${br.actual.toFixed(2)}, ${statusColor(br.passed ? 'PASSED' : 'FAILED')}`);
        }
      }

      if (exitCode !== 0 && !options.diff) {
        process.exit(exitCode);
      }
    }

  } catch (err: any) {
    console.error(pc.red(`\nAudit failed: ${err.message}`));
    process.exit(4);
  }
}
