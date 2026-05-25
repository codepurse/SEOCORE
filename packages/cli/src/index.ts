#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus, Severity, AuditPreset, Category, Backlink, AuditResult } from '@seocore/sdk';
import { TerminalReporter, JsonReporter, HtmlReporter, SarifReporter, CompareEngine } from '@seocore/reporter';
import { initConfigFile, resolveConfig } from '@seocore/config';
import { RuleEngine } from '@seocore/rules';
import { createBacklinkClient } from '@seocore/backlinks';
import { Spinner } from './utils/spinner.js';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('seocore')
  .description('Enterprise-grade SEO Analysis CLI Platform')
  .version('1.0.0');

// ==========================================
// 1. AUDIT COMMAND
// ==========================================
program
  .command('audit')
  .description('Audit a website for SEO, speed, indexing, accessibility, and metadata')
  .argument('<url>', 'Target website starting URL (e.g. https://example.com)')
  .option('-p, --preset <preset>', 'Audit preset: quick, standard, deep, enterprise', 'standard')
  .option('--full', 'Crawl the entire site based on preset limits (multi-page scan)', false)
  .option('-d, --depth <number>', 'Override crawling depth limit', parseInt)
  .option('-m, --max-pages <number>', 'Override maximum pages to audit', parseInt)
  .option('-c, --concurrency <number>', 'Override concurrency limit', parseInt)
  .option('--rate-limit <number>', 'Override rate limit in milliseconds', parseInt)
  .option('--retry-count <number>', 'Override retry count for failed requests', parseInt)
  .option('--exclude <pattern...>', 'Exclude URLs matching pattern(s)')
  .option('--include <pattern...>', 'Only include URLs matching pattern(s)')
  .option('--playwright', 'Use Playwright headless browser rendering')
  .option('--lighthouse', 'Enable Lighthouse performance metrics and Core Web Vitals (slower)')
  .option('--lighthouse-sample', 'Number of pages to sample with Lighthouse (default: all pages)', parseInt)
  .option('-f, --format <format>', 'Output format: terminal, json, html, both, all, sarif', 'terminal')
  .option('-o, --output <path>', 'Export file path')
  .option('-v, --verbose', 'Show full diagnostic findings details', false)
  .option('--min-severity <severity>', 'Minimum severity to show in terminal: critical, error, warning, info', 'warning')
  .option('--ci', 'Enable CI mode (no interactive prompts, non-zero exit codes)', false)
  .option('--fail-on <severities>', 'Comma-separated severities that trigger exit code 1 (default: critical,error)')
  .option('--budget-lcp <ms>', 'Largest Contentful Paint budget in ms')
  .option('--budget-cls <number>', 'Cumulative Layout Shift budget')
  .option('--budget-inp <ms>', 'Interaction to Next Paint budget in ms')
  .option('--budget-js <bytes>', 'Total JavaScript payload budget')
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      // Build partial config from overrides
      const partialConfig: any = {
        preset: options.preset as AuditPreset,
      };

      // If --full is NOT specified, default to landing page only (1 page, depth 1)
      if (!options.full) {
        if (options.maxPages === undefined) {
          partialConfig.maxPages = 1;
        }
        if (options.depth === undefined) {
          partialConfig.maxDepth = 1;
        }
      }

      if (options.depth !== undefined) partialConfig.maxDepth = options.depth;
      if (options.maxPages !== undefined) partialConfig.maxPages = options.maxPages;
      if (options.concurrency !== undefined) partialConfig.concurrency = options.concurrency;
      if (options.rateLimit !== undefined) partialConfig.rateLimitMs = options.rateLimit;
      if (options.retryCount !== undefined) partialConfig.retryCount = options.retryCount;
      if (options.exclude) partialConfig.excludePatterns = options.exclude;
      if (options.include) partialConfig.includePatterns = options.include;
      if (options.playwright) partialConfig.playwrightEnabled = true;
      if (options.lighthouseSample !== undefined) partialConfig.lighthouseSampleCount = options.lighthouseSample;
      
      // Check if we need to prompt about Lighthouse for full scans (only if not in CI mode)
      let useLighthouse = options.lighthouse;
      if (!options.ci && options.full && useLighthouse === undefined) {
        console.log(pc.yellow('\n⚠️  Lighthouse will run on EVERY page in a full scan, which can be very slow!'));
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'enableLighthouse',
            message: 'Do you want to keep Lighthouse enabled for this full scan?',
            default: true
          }
        ]);
        useLighthouse = answers.enableLighthouse;
      }
      
      if (useLighthouse !== undefined) partialConfig.lighthouseEnabled = useLighthouse;

      // Initialize events
      const eventBus = new EventBus();

      eventBus.on('crawl:start', (data) => {
        console.log(pc.cyan(`\n🕷  Starting Crawler pipeline on ${pc.bold(data.startUrl)}`));
        console.log(pc.gray('──────────────────────────────────────────────────'));
      });

      eventBus.on('page:loaded', (data) => {
        const codeColor = data.statusCode === 200 ? pc.green : pc.red;
        console.log(
          `  ${pc.gray('[Crawl]')} ${pc.white(data.url)} ` +
          `(${codeColor(String(data.statusCode))}) - ${pc.yellow(`${data.loadTimeMs}ms`)}`
        );
      });

      eventBus.on('dom:parsed', (data) => {
        if (options.verbose) {
          console.log(`  ${pc.gray('[Parse]')} Extracted metadata, links (${data.page.links.length}), images (${data.page.images.length})`);
        }
      });

      eventBus.on('analyzer:completed', (data) => {
        console.log(pc.gray('──────────────────────────────────────────────────'));
        console.log(pc.cyan(`🔍  Evaluating SEO Rule Engine contracts... (${data.findingsCount} findings total)`));
      });

      eventBus.on('score:calculated', () => {
        console.log(pc.green('✔  Scoring calculated. Generating reports...'));
      });

      const engine = new SeoEngine(eventBus);
      const result = await engine.run(url, partialConfig);

      // Update AI Visibility score with strict, granular scoring
      try {
        const { runAiVisibility } = await import('./ai-visibility/index.js');
        const aiVisResult = await runAiVisibility(url, { silent: true });
        
        if (result.categories && result.categories.ai_visibility) {
          result.categories.ai_visibility.score = aiVisResult.score;
          result.categories.ai_visibility.totalDeductions = Math.round((100 - aiVisResult.score) * 10) / 10;
          
          // Recompute total score based on CATEGORY_WEIGHTS
          const CATEGORY_WEIGHTS: Record<string, number> = {
          indexing: 0.15,
          metadata: 0.15,
          links: 0.10,
          seo: 0.10,
          ai_visibility: 0.15,
          accessibility: 0.10,
          performance: 0.10,
          mobile_seo: 0.15,
          backlink_intelligence: 0.10,
        };
          
          let weightedSum = 0;
          let weightTotal = 0;
          for (const cat of Object.keys(result.categories)) {
            const catTyped = cat as Category;
            const catWeight = CATEGORY_WEIGHTS[catTyped] ?? 0;
            weightedSum += result.categories[catTyped].score * catWeight;
            weightTotal += catWeight;
          }
          result.score = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 100;
        }
      } catch {
        // Fallback gracefully
      }

      // Export JSON if requested
      if (options.format === 'json' || options.format === 'both' || options.format === 'all') {
        const outPath = options.output && options.output.endsWith('.json') ? options.output : './seocore-report.json';
        const absolutePath = JsonReporter.export(result, outPath);
        console.log(pc.green(`✔  JSON Report exported to ${pc.bold(absolutePath)}`));
      }

      // Export HTML if requested
      if (options.format === 'html' || options.format === 'all') {
        const outPath = options.output && options.output.endsWith('.html') ? options.output : './seocore-report.html';
        const absolutePath = HtmlReporter.export(result, outPath);
        console.log(pc.green(`✔  HTML Report exported to ${pc.bold(absolutePath)}`));
      }

      // Export SARIF if requested
      if (options.format === 'sarif') {
        const outPath = options.output && options.output.endsWith('.sarif') ? options.output : './seocore-report.sarif';
        const absolutePath = SarifReporter.export(result, outPath);
        console.log(pc.green(`✔  SARIF Report exported to ${pc.bold(absolutePath)}`));
      }

      // Print terminal report if requested
      if (options.format === 'terminal' || options.format === 'both' || options.format === 'all') {
        TerminalReporter.report(result, {
          verbose: options.verbose,
          minSeverity: options.minSeverity as Severity,
        });
      }

      // CI Mode: Check for failures and exit codes
      if (options.ci) {
        let exitCode = 0;

        // 1. Check findings against fail-on severities
        const failOnSeverities = options.failOn ? options.failOn.split(',') : ['critical', 'error'];
        const hasMatchingFindings = result.findings.some(finding => failOnSeverities.includes(finding.severity));
        if (hasMatchingFindings) {
          exitCode = 1;
        }

        // 2. Check budgets
        let budgetExceeded = false;
        interface BudgetResult { metric: string; budget: number; actual: number; passed: boolean; }
        const budgetResults: BudgetResult[] = [];

        const pagesWithVitals = Object.values(result.pages || {}).filter(p => p.coreWebVitals);
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
          const totalJs = Object.values(result.pages || {}).reduce((sum, p) => sum + (p.resources?.jsSizeBytes || 0), 0);
          const passed = totalJs <= options.budgetJs;
          budgetResults.push({ metric: 'JS Payload', budget: options.budgetJs, actual: totalJs, passed });
          if (!passed) budgetExceeded = true;
        }

        if (budgetExceeded) {
          exitCode = exitCode === 1 ? 3 : 2;
        }

        // Print budget results
        if (budgetResults.length > 0) {
          console.log('\n' + pc.bold('PERFORMANCE BUDGETS:'));
          for (const br of budgetResults) {
            const statusColor = br.passed ? pc.green : pc.red;
            console.log(`  ${br.metric.padEnd(15)} Budget: ${br.budget}, Actual: ${br.actual.toFixed(2)}, ${statusColor(br.passed ? 'PASSED' : 'FAILED')}`);
          }
        }

        // Exit with appropriate code
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      }

    } catch (err: any) {
      console.error(pc.red(`\nAudit failed: ${err.message}`));
      process.exit(4);
    }
  });

// ==========================================
// 2. CRAWL COMMAND
// ==========================================
program
  .command('crawl')
  .description('Crawl a website and list discovered pages without scoring or rules evaluation')
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
  .option('--lighthouse', 'Enable Lighthouse performance metrics and Core Web Vitals (slower, runs on every page)')
  .action(async (url, options) => {
    try {
      const partialConfig: any = { 
        preset: options.preset as AuditPreset,
        maxPages: options.maxPages || 100 
      };
      if (options.depth !== undefined) partialConfig.maxDepth = options.depth;
      if (options.concurrency !== undefined) partialConfig.concurrency = options.concurrency;
      if (options.rateLimit !== undefined) partialConfig.rateLimitMs = options.rateLimit;
      if (options.retryCount !== undefined) partialConfig.retryCount = options.retryCount;
      if (options.exclude) partialConfig.excludePatterns = options.exclude;
      if (options.include) partialConfig.includePatterns = options.include;
      if (options.playwright) partialConfig.playwrightEnabled = true;
      if (options.lighthouse !== undefined) partialConfig.lighthouseEnabled = options.lighthouse;

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
      // Stub rule engine execution by temporarily clearing rules or resolving empty findings
      const result = await engine.run(url, {
        ...partialConfig,
        ruleOverrides: {
          '*': { enabled: false } // We can turn off all rules by overriding
        }
      });

      console.log(pc.gray('──────────────────────────────────────────────────'));
      console.log(pc.bold(pc.green(`Crawled ${result.pagesAudited} pages in ${result.totalLoadTimeMs}ms.\n`)));

    } catch (err: any) {
      console.error(pc.red(`\nCrawl failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 3. RULES:LIST COMMAND
// ==========================================
program
  .command('rules:list')
  .description('List all available declarative SEO validation rules')
  .action(() => {
    const config = resolveConfig();
    const ruleEngine = new RuleEngine();
    const rules = ruleEngine.getRules(config);

    console.log(pc.bold(pc.cyan(`\nSEOCORE REGISTERED RULES (${rules.length} total):`)));
    console.log(pc.gray('─────────────────────────────────────────────────────────────────────────────────'));

    const sevColors: Record<Severity, any> = {
      critical: pc.red,
      error: pc.red,
      warning: pc.yellow,
      info: pc.blue,
    };

    for (const rule of rules) {
      const d = rule.definition;
      const sevColor = sevColors[d.defaultSeverity];
      console.log(
        `${pc.bold(pc.white(d.id.padEnd(25)))} | ` +
        `${pc.cyan(d.category.toUpperCase().padEnd(14))} | ` +
        `Sev: ${sevColor(d.defaultSeverity.padEnd(8))} | ` +
        `Weight: ${pc.yellow(String(d.defaultWeight).padStart(2))}`
      );
      console.log(`  ${pc.gray(d.description)}`);
      if (d.documentationLink) {
        console.log(`  Docs: ${pc.underline(pc.gray(d.documentationLink))}`);
      }
      console.log(pc.gray('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─'));
    }
    console.log();
  });

// ==========================================
// 4. CONFIG:INIT COMMAND
// ==========================================
program
  .command('config:init')
  .description('Initialize a local seocore.config.json file with default values')
  .action(() => {
    try {
      const filePath = initConfigFile();
      console.log(pc.green(`\n✔  Initialized default SEO core config file successfully at:`));
      console.log(pc.bold(filePath));
      console.log(`Customize this file to configure rule severities, concurrency limits, and crawl exclusions.\n`);
    } catch (err: any) {
      console.error(pc.red(`\nError: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 5. AI-VISIBILITY COMMAND
// ==========================================
program
  .command('ai-visibility')
  .description('Analyze a website\'s visibility and structure for AI crawlers, chatbots, and search engines')
  .argument('<url>', 'Target website URL (e.g. https://example.com)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
  .option('-o, --output <path>', 'JSON or HTML export file path')
  .option('-v, --verbose', 'Show full diagnostic findings details', false)
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const { runAiVisibility } = await import('./ai-visibility/index.js');
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
  });

// ==========================================
// 6. CONTENT / E-E-A-T COMMAND
// ==========================================
program
  .command('content')
  .alias('eeat')
  .description('E-E-A-T & Content Quality analysis with AI citation readiness')
  .argument('<url>', 'Target URL (e.g. https://example.com/blog/post)')
  .option('--deep', 'Analyze all pages on site instead of just landing', false)
  .option('--focus <categories>', 'Focus on specific categories (comma-separated)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
  .option('-o, --output <path>', 'Export file path')
  .option('--ci', 'Enable CI mode with non-zero exit codes', false)
  .option('--budget-eeat <score>', 'Fail CI if overall E-E-A-T score is below this number')
  .option('--budget-content <score>', 'Fail CI if overall content quality score is below this number')
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const { runContentCommand } = await import('./content/index.js');
      await runContentCommand(url, {
        deep: options.deep,
        focus: options.focus,
        json: options.json,
        format: options.format as any,
        output: options.output,
        ci: options.ci,
        budgetEeat: options.budgetEeat ? Number(options.budgetEeat) : undefined,
        budgetContent: options.budgetContent ? Number(options.budgetContent) : undefined
      });
    } catch (err: any) {
      console.error(pc.red(`\nE-E-A-T & Content Quality analysis failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 6. ROBOTS COMMAND
// ==========================================
program
  .command('robots')
  .description('Check a website\'s robots.txt file')
  .argument('<url>', 'Target website URL (e.g. https://example.com)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const isJson = options.json || options.format === 'json';
      const spinner = new Spinner(`Checking robots.txt for ${url}...`);
      if (!isJson) spinner.start();

      const { HttpCrawler } = await import('@seocore/crawler');
      const { resolveConfig } = await import('@seocore/config');
      const config = resolveConfig();
      const crawler = new HttpCrawler();

      const baseUrl = new URL(url);
      const robotsUrl = `${baseUrl.origin}/robots.txt`;
      const result = await crawler.crawl(robotsUrl, config);

      if (!isJson) spinner.stop('Finished robots.txt check.');

      const output = {
        url: robotsUrl,
        statusCode: result.statusCode,
        ok: result.statusCode === 200,
        content: result.html,
        error: result.error,
        checkedAt: new Date().toISOString(),
      };

      if (options.json || options.format === 'json') {
        if (options.output) {
          const fs = await import('fs');
          const path = await import('path');
          fs.writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf8');
          console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
        } else {
          console.log(JSON.stringify(output, null, 2));
        }
        return;
      }

      // Terminal output
      console.log();
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(pc.bold(pc.cyan('            ROBOTS.TXT CHECKER                    ')));
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
      console.log(`${pc.bold('Robots URL:')} ${pc.underline(robotsUrl)}`);
      console.log();

      if (result.statusCode === 200) {
        console.log(pc.green('✓ robots.txt is available!'));
        console.log();
        console.log(pc.bold('Content:'));
        console.log(pc.gray('──────────────────────────────────────────────────'));
        console.log(result.html);
      } else {
        console.log(pc.red(`✗ robots.txt not found or inaccessible (Status: ${result.statusCode})`));
        if (result.error) {
          console.log(pc.red(`Error: ${result.error}`));
        }
      }
      console.log();
    } catch (err: any) {
      console.error(pc.red(`\nRobots.txt check failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 7. SITEMAP COMMAND
// ==========================================
program
  .command('sitemap')
  .description('Check a website\'s sitemap.xml file')
  .argument('<url>', 'Target website URL (e.g. https://example.com)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .option('--list-urls', 'List all URLs from the sitemap', false)
  .option('--check-links', 'Check if sitemap URLs are reachable (200 OK)', false)
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const isJson = options.json || options.format === 'json';
      const spinner = new Spinner(`Checking sitemap.xml for ${url}...`);
      if (!isJson) spinner.start();

      const { HttpCrawler, SitemapParser } = await import('@seocore/crawler');
      const { resolveConfig } = await import('@seocore/config');
      const config = resolveConfig();
      const crawler = new HttpCrawler();

      const baseUrl = new URL(url);
      const sitemapUrl = `${baseUrl.origin}/sitemap.xml`;
      const result = await crawler.crawl(sitemapUrl, config);

      if (!isJson) spinner.stop('Finished sitemap.xml check.');

      let sitemapUrls: string[] = [];
      if (result.statusCode === 200 && result.html) {
        sitemapUrls = SitemapParser.parse(result.html);
      }

      let linkCheckResults: Array<{ url: string; statusCode: number; ok: boolean; error?: string }> = [];
      if (options.checkLinks && sitemapUrls.length > 0) {
        console.log(pc.cyan(`\nChecking ${sitemapUrls.length} sitemap URLs...`));
        const PQueue = (await import('p-queue')).default;
        const queue = new PQueue({ concurrency: 5 });
        
        for (const sitemapUrlItem of sitemapUrls) {
          queue.add(async () => {
            try {
              const checkResult = await crawler.crawl(sitemapUrlItem, config);
              linkCheckResults.push({
                url: sitemapUrlItem,
                statusCode: checkResult.statusCode,
                ok: checkResult.statusCode === 200,
                error: checkResult.error,
              });
              console.log(`${pc.gray('  [')}${checkResult.statusCode === 200 ? pc.green('✓') : pc.red('✗')}${pc.gray(']')} ${sitemapUrlItem} (Status: ${checkResult.statusCode})`);
            } catch (err: any) {
              linkCheckResults.push({
                url: sitemapUrlItem,
                statusCode: 0,
                ok: false,
                error: err.message,
              });
              console.log(`${pc.gray('  [')}${pc.red('✗')}${pc.gray(']')} ${sitemapUrlItem} (Error: ${err.message})`);
            }
          });
        }
        await queue.onIdle();
      }

      const output = {
        url: sitemapUrl,
        statusCode: result.statusCode,
        ok: result.statusCode === 200,
        content: result.html,
        error: result.error,
        urls: sitemapUrls,
        urlCount: sitemapUrls.length,
        linkChecks: linkCheckResults.length > 0 ? linkCheckResults : undefined,
        checkedAt: new Date().toISOString(),
      };

      if (options.json || options.format === 'json') {
        if (options.output) {
          const fs = await import('fs');
          const path = await import('path');
          fs.writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf8');
          console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
        } else {
          console.log(JSON.stringify(output, null, 2));
        }
        return;
      }

      // Terminal output
      console.log();
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(pc.bold(pc.cyan('            SITEMAP.XML CHECKER                   ')));
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
      console.log(`${pc.bold('Sitemap URL:')} ${pc.underline(sitemapUrl)}`);
      console.log();

      if (result.statusCode === 200) {
        console.log(pc.green('✓ sitemap.xml is available!'));
        console.log(`${pc.bold('URLs Found:')} ${sitemapUrls.length}`);
        
        if (options.listUrls) {
          console.log();
          console.log(pc.bold('Sitemap URLs:'));
          console.log(pc.gray('──────────────────────────────────────────────────'));
          sitemapUrls.forEach((u, i) => console.log(`${i + 1}. ${u}`));
        }

        if (options.checkLinks && linkCheckResults.length > 0) {
          const okCount = linkCheckResults.filter(r => r.ok).length;
          const brokenCount = linkCheckResults.length - okCount;
          console.log();
          console.log(pc.bold('Link Check Results:'));
          console.log(pc.gray('──────────────────────────────────────────────────'));
          console.log(`${pc.green('✓ OK:')} ${okCount}`);
          console.log(`${pc.red('✗ Broken:')} ${brokenCount}`);
        }
      } else {
        console.log(pc.red(`✗ sitemap.xml not found or inaccessible (Status: ${result.statusCode})`));
        if (result.error) {
          console.log(pc.red(`Error: ${result.error}`));
        }
      }
      console.log();
    } catch (err: any) {
      console.error(pc.red(`\nSitemap check failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 7.5. LLMS.TXT COMMAND
// ==========================================
program
  .command('llms-txt')
  .description('Check a website\'s llms.txt file for AI crawler directives')
  .argument('<url>', 'Target website URL (e.g. https://example.com)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .option('--check-bots <bots>', 'Comma-separated list of bots to check (default: GPTBot,ClaudeBot,PerplexityBot,Google-Extended)')
  .option('--check-well-known', 'Also check /.well-known/llms.txt (default: true)', true)
  .option('--verbose', 'Show full directive parsing details', false)
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const isJson = options.json || options.format === 'json';
      const spinner = new Spinner(`Checking llms.txt for ${url}...`);
      if (!isJson) spinner.start();

      const { HttpCrawler, LlmsTxtParser } = await import('@seocore/crawler');
      const { resolveConfig } = await import('@seocore/config');
      const config = resolveConfig();
      const crawler = new HttpCrawler();

      const baseUrl = new URL(url);
      const llmsTxtUrl = `${baseUrl.origin}/llms.txt`;
      const wellKnownLlmsTxtUrl = `${baseUrl.origin}/.well-known/llms.txt`;

      const [llmsTxtResult, wellKnownLlmsTxtResult] = await Promise.all([
        crawler.crawl(llmsTxtUrl, config),
        options.checkWellKnown ? crawler.crawl(wellKnownLlmsTxtUrl, config) : Promise.resolve(null),
      ]);

      if (!isJson) spinner.stop('Finished llms.txt check.');

      // Parse llms.txt if found
      let parseResult: any = null;
      if (llmsTxtResult.statusCode === 200 && llmsTxtResult.html) {
        parseResult = LlmsTxtParser.parse(llmsTxtResult.html);
      } else if (wellKnownLlmsTxtResult?.statusCode === 200 && wellKnownLlmsTxtResult.html) {
        parseResult = LlmsTxtParser.parse(wellKnownLlmsTxtResult.html);
      }

      // Parse bot list
      const botList = options.checkBots ? options.checkBots.split(',') : ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];
      const botAnalyses: any[] = [];
      if (parseResult) {
        for (const bot of botList) {
          botAnalyses.push({
            bot,
            ...LlmsTxtParser.getBotStatus(parseResult, bot),
          });
        }
      }

      // Build recommendations
      const recommendations: string[] = [];
      if (llmsTxtResult.statusCode !== 200 && (!wellKnownLlmsTxtResult || wellKnownLlmsTxtResult.statusCode !== 200)) {
        recommendations.push('No llms.txt file found at either /llms.txt or /.well-known/llms.txt');
      }
      if (options.checkWellKnown && (!wellKnownLlmsTxtResult || wellKnownLlmsTxtResult.statusCode !== 200)) {
        recommendations.push('Consider adding a /.well-known/llms.txt file for standards compliance');
      }
      if (parseResult) {
        for (const bot of botList) {
          const analysis = botAnalyses.find(a => a.bot === bot);
          if (analysis?.status === 'implicit') {
            recommendations.push(`${bot} has no explicit rules. Add a "User-agent: ${bot}" section.`);
          }
        }
      }

      const output = {
        url,
        checkedAt: new Date().toISOString(),
        discovery: {
          llmsTxt: {
            url: llmsTxtUrl,
            statusCode: llmsTxtResult.statusCode,
            found: llmsTxtResult.statusCode === 200,
            sizeBytes: llmsTxtResult.html ? Buffer.byteLength(llmsTxtResult.html, 'utf8') : 0,
          },
          wellKnownLlmsTxt: options.checkWellKnown ? {
            url: wellKnownLlmsTxtUrl,
            statusCode: wellKnownLlmsTxtResult?.statusCode || 0,
            found: wellKnownLlmsTxtResult?.statusCode === 200,
          } : undefined,
        },
        parsing: parseResult ? {
          sections: parseResult.sections,
          totalAllowRules: parseResult.totalAllowRules,
          totalDisallowRules: parseResult.totalDisallowRules,
          parseErrors: parseResult.parseErrors,
        } : undefined,
        botAnalysis: botAnalyses,
        recommendations,
      };

      if (isJson) {
        if (options.output) {
          const fs = await import('fs');
          const path = await import('path');
          fs.writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf8');
          console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
        } else {
          console.log(JSON.stringify(output, null, 2));
        }
        return;
      }

      // Terminal output
      console.log();
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(pc.bold(pc.cyan('            LLMS.TXT CHECKER                     ')));
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
      console.log(`${pc.bold('Checked At:')} ${new Date().toISOString()}`);
      console.log();

      console.log(pc.bold('LLMS.TXT DISCOVERY:'));
      const llmsFound = llmsTxtResult.statusCode === 200;
      console.log(`  /llms.txt           ${llmsFound ? pc.green('✓ Found') : pc.red('✗ Not Found')} (HTTP ${llmsTxtResult.statusCode})`);
      if (llmsFound && llmsTxtResult.html) {
        console.log(`                       ${pc.gray(`(${Buffer.byteLength(llmsTxtResult.html, 'utf8')} bytes)`)}`);
      }

      if (options.checkWellKnown) {
        const wellKnownFound = wellKnownLlmsTxtResult?.statusCode === 200;
        console.log(`  /.well-known/llms.txt ${wellKnownFound ? pc.green('✓ Found') : pc.red('✗ Not Found')} (HTTP ${wellKnownLlmsTxtResult?.statusCode || 0})`);
        if (wellKnownFound && wellKnownLlmsTxtResult?.html) {
          console.log(`                       ${pc.gray(`(${Buffer.byteLength(wellKnownLlmsTxtResult.html, 'utf8')} bytes)`)}`);
        }
      }
      console.log();

      if (parseResult) {
        console.log(pc.bold('DIRECTIVE SUMMARY:'));
        console.log(`  Total Sections:     ${parseResult.sections.length}`);
        console.log(`  Total Allow Rules:  ${parseResult.totalAllowRules}`);
        console.log(`  Total Disallow Rules: ${parseResult.totalDisallowRules}`);
        if (parseResult.parseErrors.length > 0) {
          console.log(pc.yellow(`  Parse Warnings:     ${parseResult.parseErrors.length}`));
          if (options.verbose) {
            parseResult.parseErrors.forEach((err: string) => {
              console.log(pc.yellow(`    - ${err}`));
            });
          }
        }
        console.log();

        console.log(pc.bold('AI BOT ANALYSIS:'));
        for (const analysis of botAnalyses) {
          const statusColor = analysis.status === 'allowed' ? pc.green : analysis.status === 'disallowed' ? pc.red : pc.yellow;
          const statusIcon = analysis.status === 'allowed' ? '✓' : analysis.status === 'disallowed' ? '✗' : '⚠';
          console.log(`  ${statusIcon} ${pc.bold(analysis.bot.padEnd(20))} ${statusColor(analysis.status.toUpperCase().padEnd(10))}`);
          if (analysis.allowedPaths.length > 0) {
            console.log(`                       Allowed: ${analysis.allowedPaths.join(', ')}`);
          }
          if (analysis.blockedPaths.length > 0) {
            console.log(`                       Blocked: ${analysis.blockedPaths.join(', ')}`);
          }
        }
        console.log();
      } else {
        console.log(pc.yellow('  No llms.txt file found to parse.'));
        console.log();
      }

      if (recommendations.length > 0) {
        console.log(pc.bold(pc.yellow('RECOMMENDATIONS:')));
        recommendations.forEach((rec) => {
          console.log(`  ⚠ ${rec}`);
        });
        console.log();
      }
    } catch (err: any) {
      console.error(pc.red(`\nllms.txt check failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 8. BACKLINKS COMMAND
// ==========================================
program
  .command('backlinks')
  .description('Analyze website backlinks using Bing, GSC exports, and access logs')
  .argument('<url>', 'Target website URL (e.g. https://example.com)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .option('-l, --limit <number>', 'Maximum number of backlinks to fetch', parseInt, 100)
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const config = resolveConfig();
      
      if (!config.backlinks?.provider) {
        console.error(
          pc.red(
            'Error: Backlink provider not configured. Set SEO_CORE_BACKLINKS_PROVIDER plus Bing, GSC export, or log-source settings in env vars or config.'
          )
        );
        process.exit(1);
      }

      const isJson = options.json || options.format === 'json';
      const spinner = new Spinner(`Analyzing backlinks for ${url}...`);
      if (!isJson) spinner.start();

      const client = createBacklinkClient(config.backlinks);
      const intelligence = await client.getIntelligence(url, options.limit);
      const backlinks = intelligence.backlinks;
      const domainMetrics = intelligence.domainMetrics;

      if (!isJson) spinner.stop('Finished backlink analysis.');

      const output = {
        targetUrl: url,
        checkedAt: new Date().toISOString(),
        provider: config.backlinks.provider,
        sources: intelligence.sources,
        backlinks: backlinks,
        totalBacklinks: backlinks.length,
        domainMetrics: domainMetrics,
      };

      if (options.json || options.format === 'json') {
        if (options.output) {
          const fs = await import('fs');
          const path = await import('path');
          fs.writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf8');
          console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
        } else {
          console.log(JSON.stringify(output, null, 2));
        }
        return;
      }

      // Terminal output
      console.log();
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(pc.bold(pc.cyan('              BACKLINK ANALYZER                   ')));
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
      console.log(`${pc.bold('Provider:')} ${config.backlinks.provider}`);
      console.log(`${pc.bold('Sources Used:')} ${intelligence.sources.join(', ')}`);
      console.log();

      if (domainMetrics.totalBacklinks !== undefined) {
        console.log(`${pc.bold('Total Backlinks:')} ${domainMetrics.totalBacklinks}`);
      }
      if (domainMetrics.referringDomains !== undefined) {
        console.log(`${pc.bold('Referring Domains:')} ${domainMetrics.referringDomains}`);
      }
      if (domainMetrics.sourceCount !== undefined) {
        console.log(`${pc.bold('Sources Count:')} ${domainMetrics.sourceCount}`);
      }
      console.log(`${pc.bold('Backlinks Loaded:')} ${backlinks.length}`);
      if (domainMetrics.notes && domainMetrics.notes.length > 0) {
        console.log(`${pc.bold('Notes:')} ${domainMetrics.notes.join(' | ')}`);
      }

      if (backlinks.length > 0) {
        console.log();
        console.log(pc.bold('Recent Backlinks:'));
        console.log(pc.gray('──────────────────────────────────────────────────'));
        backlinks.slice(0, 10).forEach((backlink: Backlink, i: number) => {
          const linkType = backlink.isDofollow === undefined
            ? pc.gray('Unknown')
            : backlink.isDofollow
              ? pc.green('DoFollow')
              : pc.gray('NoFollow');
          console.log(`${i + 1}. ${pc.underline(backlink.sourceUrl)}`);
          console.log(`   Anchor: ${pc.italic(backlink.anchorText || '(not available)')}`);
          console.log(`   Type: ${linkType}`);
          if (backlink.domainAuthority !== undefined) {
            console.log(`   DA: ${backlink.domainAuthority}`);
          }
          if (backlink.spamScore !== undefined) {
            console.log(`   Spam: ${backlink.spamScore}`);
          }
          console.log();
        });
        if (backlinks.length > 10) {
          console.log(pc.gray(`... and ${backlinks.length - 10} more backlinks.`));
        }
      }

      console.log();
    } catch (err: any) {
      console.error(pc.red(`\nBacklink analysis failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 9. GOOGLE RANK CHECK COMMAND
// ==========================================
program
  .command('rank-check')
  .description('Check if a website appears in Google\'s top 10 search results for a keyword')
  .argument('<keyword>', 'Search keyword to check (use quotes for multi-word keywords)')
  .argument('<url>', 'Target website URL to look for in search results')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .option('--show', 'Show Chrome window (useful for solving captcha or debugging)', false)
  .action(async (keyword, url, options) => {
    try {
      // Validate URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const isJson = options.json || options.format === 'json';
      const spinner = new Spinner(`Checking Google top 10 for "${keyword}"...`);
      if (!isJson) spinner.start();

      const { checkGoogleRank } = await import('./rank-checker.js');
      const result = await checkGoogleRank(keyword, url, { headless: !options.show });

      if (!isJson) spinner.stop('Rank check complete.');

      if (isJson) {
        if (options.output) {
          const fs = await import('node:fs');
          const path = await import('node:path');
          fs.writeFileSync(options.output, JSON.stringify(result, null, 2), 'utf8');
          console.log(pc.green(`✓ JSON saved to ${path.resolve(options.output)}`));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        return;
      }

      console.log();
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(pc.bold(pc.cyan('         GOOGLE TOP 10 RANK CHECKER               ')));
      console.log(pc.bold(pc.cyan('==================================================')));
      console.log(`${pc.bold('Keyword:')}    ${pc.yellow(keyword)}`);
      console.log(`${pc.bold('Target:')}     ${pc.underline(url)}`);
      console.log(`${pc.bold('Domain:')}     ${result.targetDomain}`);
      console.log(`${pc.bold('Source:')}     ${result.source === 'serpapi' ? pc.green('SerpAPI') : pc.yellow('Playwright (free, captcha-prone)')}`);
      console.log(`${pc.bold('Checked At:')} ${pc.gray(result.checkedAt)}`);
      console.log();

      if (result.error) {
        console.log(pc.red(`✗ ${result.error}`));
        console.log(pc.gray('Tip: get a free key at https://serpapi.com (100/mo), then run: $env:SERPAPI_KEY="your_key"'));
        console.log();
        return;
      }

      if (result.inTop10 && result.position) {
        console.log(pc.green(pc.bold(`✓ FOUND in TOP 10 at position #${result.position}`)));
      } else {
        console.log(pc.red(pc.bold('✗ NOT in TOP 10')));
      }
      console.log();

      if (result.topResults.length > 0) {
        console.log(pc.bold('Top 10 Organic Results:'));
        console.log(pc.gray('──────────────────────────────────────────────────'));
        result.topResults.forEach((item) => {
          const isTarget = item.position === result.position;
          const bullet = isTarget ? pc.green('►') : pc.gray('•');
          const posStr = isTarget ? pc.green(pc.bold(`#${item.position}`)) : pc.gray(`#${item.position}`);
          const title = isTarget ? pc.green(pc.bold(item.title)) : pc.white(item.title);
          console.log(`${bullet} ${posStr} ${title}`);
          console.log(`     ${pc.gray(item.url)}`);
        });
      } else {
        console.log(pc.yellow('No organic results parsed. Google may have served a captcha or non-standard layout.'));
      }
      console.log();

    } catch (err: any) {
      console.error(pc.red(`\nRank check failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 10. COMPARE Command
// ==========================================
program
  .command('compare')
  .description('Compare two websites or SEO audit reports')
  .argument('<source1>', 'First URL or audit report JSON file')
  .argument('<source2>', 'Second URL or audit report JSON file')
  .option('--name1 <name>', 'Name for first site')
  .option('--name2 <name>', 'Name for second site')
  .option('--focus <type>', 'Focus comparison on: technical, content, ai-visibility, backlinks, mobile')
  .option('--format <format>', 'Output format: terminal, json, html', 'terminal')
  .option('--output <path>', 'Output file path for json/html formats')
  .action(async (source1: string, source2: string, options) => {
    try {
      // Helper function to get audit result (either from file or by auditing URL)
      const getAuditResult = async (source: string): Promise<AuditResult> => {
        // Check if source is a URL
        if (source.startsWith('http://') || source.startsWith('https://')) {
          // Audit the URL
          console.log(pc.cyan(`\n🕷  Auditing ${source}...`));
          const eventBus = new EventBus();
          const engine = new SeoEngine(eventBus);
          const result = await engine.run(source, {
            maxPages: 1, // Default to single page for quick comparison
            maxDepth: 1
          });

          // Update AI visibility score
          try {
            const { runAiVisibility } = await import('./ai-visibility/index.js');
            const aiVisResult = await runAiVisibility(source, { silent: true });
            if (result.categories && result.categories.ai_visibility) {
              result.categories.ai_visibility.score = aiVisResult.score;
              result.categories.ai_visibility.totalDeductions = Math.round((100 - aiVisResult.score) * 10) / 10;
              
              const CATEGORY_WEIGHTS: Record<string, number> = {
                indexing: 0.15,
                metadata: 0.15,
                links: 0.10,
                seo: 0.10,
                ai_visibility: 0.15,
                accessibility: 0.10,
                performance: 0.10,
                mobile_seo: 0.15,
                backlink_intelligence: 0.10,
              };
              
              let weightedSum = 0;
              let weightTotal = 0;
              for (const cat of Object.keys(result.categories)) {
                const catTyped = cat as Category;
                const catWeight = CATEGORY_WEIGHTS[catTyped] ?? 0;
                weightedSum += result.categories[catTyped].score * catWeight;
                weightTotal += catWeight;
              }
              result.score = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 100;
            }
          } catch {}

          return result;
        } else {
          // Read from file
          const absolutePath = path.resolve(source);
          if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found: ${source}`);
          }
          const content = fs.readFileSync(absolutePath, 'utf8');
          return JSON.parse(content);
        }
      };

      // Get both audit results
      const audit1 = await getAuditResult(source1);
      const audit2 = await getAuditResult(source2);

      // Validate focus option
      const validFoci = ['technical', 'content', 'ai-visibility', 'backlinks', 'mobile'];
      if (options.focus && !validFoci.includes(options.focus)) {
        console.error(pc.red(`Invalid focus: ${options.focus}. Valid options: ${validFoci.join(', ')}`));
        process.exit(1);
      }

      // Validate format option
      const validFormats = ['terminal', 'json', 'html'];
      if (options.format && !validFormats.includes(options.format)) {
        console.error(pc.red(`Invalid format: ${options.format}. Valid options: ${validFormats.join(', ')}`));
        process.exit(1);
      }

      // Run comparison
      if (options.format === 'terminal') {
        CompareEngine.report(audit1, audit2, {
          siteAName: options.name1,
          siteBName: options.name2,
          focus: options.focus as 'technical' | 'content' | 'ai-visibility' | 'backlinks' | 'mobile'
        });
      } else if (options.format === 'json') {
        const outputPath = options.output || './seocore-comparison.json';
        const savedPath = CompareEngine.exportJson(audit1, audit2, outputPath, {
          siteAName: options.name1,
          siteBName: options.name2
        });
        console.log(pc.green(`\n✓ Comparison report saved to ${pc.bold(savedPath)}`));
      } else if (options.format === 'html') {
        const outputPath = options.output || './seocore-comparison.html';
        const savedPath = CompareEngine.exportHtml(audit1, audit2, outputPath, {
          siteAName: options.name1,
          siteBName: options.name2
        });
        console.log(pc.green(`\n✓ Comparison report saved to ${pc.bold(savedPath)}`));
      }
    } catch (err: any) {
      console.error(pc.red(`\nComparison failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// SCHEMA COMMAND (Validate Schema.org)
// ==========================================
const schemaAction = async (url: string, options: any) => {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.error(pc.red('Error: Target URL must start with http:// or https://'));
      process.exit(1);
    }

    const { Spinner } = await import('./utils/spinner.js');
    const { resolveConfig } = await import('@seocore/config');
    const { HttpCrawler } = await import('@seocore/crawler');
    const { PageNormalizer, SchemaValidator } = await import('@seocore/analyzers');
    const { SchemaReporter } = await import('./validate/reporter.js');

    const config = resolveConfig();
    const spinner = new Spinner('Validating Schema.org structured data...');
    if (options.format !== 'json' && !options.json) spinner.start();

    const crawler = new HttpCrawler();
    const crawlResult = await crawler.crawl(url, config);

    if (crawlResult.error) {
      throw new Error(crawlResult.error);
    }

    const normalizedPage = PageNormalizer.normalize(crawlResult);
    const validator = new SchemaValidator();
    let validationResult = validator.validate(normalizedPage.structuredData, url, normalizedPage);

    if (options.schema) {
      const targetTypes = options.schema.split(',').map((t: string) => t.trim().toLowerCase());
      validationResult = {
        ...validationResult,
        schemas: validationResult.schemas.filter((schema: any) =>
          targetTypes.includes(schema.type.toLowerCase())
        )
      };
      validationResult.totalSchemas = validationResult.schemas.length;
      validationResult.validSchemas = validationResult.schemas.filter((s: any) => s.valid).length;
      validationResult.invalidSchemas = validationResult.totalSchemas - validationResult.validSchemas;
      validationResult.totalErrors = validationResult.schemas.reduce((sum: number, s: any) => sum + s.issues.filter((i: any) => i.level === 'error').length, 0);
      validationResult.totalWarnings = validationResult.schemas.reduce((sum: number, s: any) => sum + s.issues.filter((i: any) => i.level === 'warning').length, 0);
    }

    if (options.format !== 'json' && !options.json && options.format !== 'sarif') spinner.stop('Validation complete!');

    if (options.json || options.format === 'json') {
      SchemaReporter.reportJson(validationResult, options.output);
    } else if (options.format === 'sarif') {
      SchemaReporter.reportSarif(validationResult, options.output || './seocore-schema-report.sarif');
    } else {
      SchemaReporter.reportTerminal(validationResult);
      if (options.output) {
        if (options.output.endsWith('.sarif')) {
          SchemaReporter.reportSarif(validationResult, options.output);
        } else {
          SchemaReporter.reportJson(validationResult, options.output);
        }
      }
    }

  } catch (err: any) {
    console.error(pc.red(`\nValidation failed: ${err.message}`));
    process.exit(1);
  }
};

program
  .command('schema')
  .description('Validate Schema.org structured data')
  .argument('<url>', 'Target URL')
  .option('--schema <types>', 'Filter to specific schema types (comma-separated)')
  .option('--json', 'Output raw JSON')
  .option('-f, --format <format>', 'Output format: terminal, json, sarif', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .action(schemaAction);

// Alias for backwards compatibility: seocore validate <url>
program
  .command('validate')
  .description('Validate Schema.org structured data (alias for schema)')
  .argument('<url>', 'Target URL')
  .option('--schema <types>', 'Filter to specific schema types (comma-separated)')
  .option('--json', 'Output raw JSON')
  .option('-f, --format <format>', 'Output format: terminal, json, sarif', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .action(schemaAction);

program
  .command('hreflang')
  .description('Validate a website\'s hreflang tags')
  .argument('<url>', 'Target website URL (e.g., https://example.com)')
  .option('--deep', 'Validate all pages on the site', false)
  .option('--lang <codes>', 'Filter to specific languages (comma-separated)')
  .option('--json', 'Output results in raw JSON format', false)
  .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
  .option('-o, --output <path>', 'Export to file')
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const isJson = options.json || options.format === 'json';
      const spinner = new Spinner(`Validating hreflang tags for ${url}...`);
      if (!isJson) spinner.start();

      const { HttpCrawler } = await import('@seocore/crawler');
      const { PageNormalizer, HreflangValidator } = await import('@seocore/analyzers');
      const { resolveConfig } = await import('@seocore/config');
      const config = resolveConfig();
      const crawler = new HttpCrawler();
      const validator = new HreflangValidator();

      // First crawl the main page
      const mainResult = await crawler.crawl(url, config);
      if (mainResult.statusCode !== 200) {
        throw new Error(`Failed to load target page: HTTP ${mainResult.statusCode}`);
      }
      const mainPage = PageNormalizer.normalize(mainResult);

      // Collect all pages to check
      const pagesToCheck = [mainPage];

      // If --deep, crawl all hreflang URLs
      if (options.deep) {
        const uniqueUrls = new Set<string>();
        for (const alt of mainPage.hreflang) {
          uniqueUrls.add(alt.url);
        }

        for (const altUrl of uniqueUrls) {
          try {
            const result = await crawler.crawl(altUrl, config);
            if (result.statusCode === 200) {
              pagesToCheck.push(PageNormalizer.normalize(result));
            }
          } catch {
            // Ignore errors for deep crawl
          }
        }
      }

      // Validate
      const validationResult = validator.validate(pagesToCheck);

      if (!isJson) spinner.stop('Finished hreflang validation.');

      // Import reporter
      const { HreflangReporter } = await import('./hreflang/reporter.js');

      if (isJson) {
        const output = HreflangReporter.exportJson(validationResult, options.output);
        if (options.output) {
          console.log(pc.green(`✓ JSON report saved to ${output}`));
        } else {
          console.log(output);
        }
        return;
      }

      // Terminal output
      HreflangReporter.report(validationResult, url);

    } catch (err: any) {
      console.error(pc.red(`\nHreflang validation failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 11. SCREENSHOT COMMAND
// ==========================================
program
  .command('screenshot')
  .description('Capture visual screenshots of target page/site')
  .argument('<url>', 'Target URL')
  .option('--breakpoints <sizes>', 'Viewport breakpoints (comma-separated: mobile,tablet,desktop)')
  .option('--device <name>', 'Use Playwright device descriptor (e.g., "iPhone 15 Pro")')
  .option('--full-page', 'Capture full-page screenshots (not just viewport)')
  .option('--deep', 'Capture screenshots for all pages on site instead of just landing')
  .option('-o, --output <path>', 'Output directory for screenshots (default: ./screenshots)')
  .option('-c, --config <path>', 'Path to seocore.config.json')
  .option('--timeout <ms>', 'Navigation timeout in milliseconds (default: 30000)', '30000')
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }
      const { captureScreenshots } = await import('./screenshot.js');
      await captureScreenshots(url, options);
    } catch (err: any) {
      console.error(pc.red(`\nScreenshot capture failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
