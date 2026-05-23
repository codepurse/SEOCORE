#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus, Severity, AuditPreset, Category } from '@seocore/sdk';
import { TerminalReporter, JsonReporter, HtmlReporter } from '@seocore/reporter';
import { initConfigFile, resolveConfig } from '@seocore/config';
import { RuleEngine } from '@seocore/rules';

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
  .option('--playwright', 'Use Playwright headless browser rendering')
  .option('-f, --format <format>', 'Output format: terminal, json, html, both, all', 'terminal')
  .option('-o, --output <path>', 'JSON or HTML export file path (defaults to ./seocore-report.json or ./seocore-report.html)')
  .option('-v, --verbose', 'Show full diagnostic findings details', false)
  .option('--min-severity <severity>', 'Minimum severity to show in terminal: critical, error, warning, info', 'warning')
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
      if (options.playwright) partialConfig.playwrightEnabled = true;

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

      // Print terminal report if requested
      if (options.format === 'terminal' || options.format === 'both' || options.format === 'all') {
        TerminalReporter.report(result, {
          verbose: options.verbose,
          minSeverity: options.minSeverity as Severity,
        });
      }

    } catch (err: any) {
      console.error(pc.red(`\nAudit failed: ${err.message}`));
      process.exit(1);
    }
  });

// ==========================================
// 2. CRAWL COMMAND
// ==========================================
program
  .command('crawl')
  .description('Crawl a website and list discovered pages without scoring or rules evaluation')
  .argument('<url>', 'Target website starting URL')
  .option('-d, --depth <number>', 'Override crawling depth limit', parseInt)
  .option('-m, --max-pages <number>', 'Override maximum pages limit', parseInt)
  .action(async (url, options) => {
    try {
      const partialConfig: any = { maxPages: options.maxPages || 100 };
      if (options.depth !== undefined) partialConfig.maxDepth = options.depth;

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
  .action(async (url, options) => {
    try {
      // Validate starting URL protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: Target URL must start with http:// or https://'));
        process.exit(1);
      }

      const { runAiVisibility } = await import('./ai-visibility/index.js');
      await runAiVisibility(url, { json: options.json });
    } catch (err: any) {
      console.error(pc.red(`\nAI Visibility Analysis failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
