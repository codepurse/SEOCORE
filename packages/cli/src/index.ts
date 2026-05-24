#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus, Severity, AuditPreset, Category, Backlink } from '@seocore/sdk';
import { TerminalReporter, JsonReporter, HtmlReporter } from '@seocore/reporter';
import { initConfigFile, resolveConfig } from '@seocore/config';
import { RuleEngine } from '@seocore/rules';
import { createBacklinkClient } from '@seocore/backlinks';
import { Spinner } from './utils/spinner.js';
import inquirer from 'inquirer';

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
      if (options.concurrency !== undefined) partialConfig.concurrency = options.concurrency;
      if (options.rateLimit !== undefined) partialConfig.rateLimitMs = options.rateLimit;
      if (options.retryCount !== undefined) partialConfig.retryCount = options.retryCount;
      if (options.exclude) partialConfig.excludePatterns = options.exclude;
      if (options.include) partialConfig.includePatterns = options.include;
      if (options.playwright) partialConfig.playwrightEnabled = true;
      if (options.lighthouseSample !== undefined) partialConfig.lighthouseSampleCount = options.lighthouseSample;
      
      // Check if we need to prompt about Lighthouse for full scans
      let useLighthouse = options.lighthouse;
      if (options.full && useLighthouse === undefined) {
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

program.parse(process.argv);
