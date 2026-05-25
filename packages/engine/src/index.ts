import {
  AuditResult,
  BacklinkIntelligenceData,
  Crawler,
  EventBus,
  NormalizedPage,
  SeoConfig,
  SeoPlugin,
  RuleDefinition,
  ExecutionTier,
  ExecutionTierConfig,
  TIER_PRESETS,
  DataSource
} from '@seocore/sdk';
import { resolveConfig } from '@seocore/config';
import { DefaultPluginRegistry, loadPluginsForTier } from './plugin-registry.js';
import PQueue from 'p-queue';
import Bottleneck from 'bottleneck';
import { HttpCrawler, PlaywrightCrawler, LighthouseCrawler, RobotsTxt, SitemapParser, CrawlerRegistry, createDefaultRegistry } from '@seocore/crawler';
import { PageNormalizer } from '@seocore/analyzers';
import { RuleEngine } from '@seocore/rules';
import { ScoringEngine, CrawlGraphBuilder } from '@seocore/scoring-core';

function patternToRegex(pattern: string): RegExp {
  // Escape regex special chars except '*' and '?'
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(regexStr, 'i');
}

export function isUrlMatch(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  try {
    const urlObj = new URL(url);
    const pathAndQuery = urlObj.pathname + urlObj.search;
    return patterns.some(pattern => {
      const regex = patternToRegex(pattern);
      return regex.test(pathAndQuery) || regex.test(url);
    });
  } catch {
    return false;
  }
}

export class SeoEngine {
  private readonly eventBus: EventBus;
  private readonly crawlerRegistry: CrawlerRegistry;
  private readonly ruleEngine: RuleEngine;
  private readonly pluginRegistry: DefaultPluginRegistry;

  constructor(
    eventBus = new EventBus(),
    crawlerRegistry?: CrawlerRegistry,
    pluginRegistry?: DefaultPluginRegistry
  ) {
    this.eventBus = eventBus;
    this.ruleEngine = new RuleEngine();
    this.crawlerRegistry = crawlerRegistry ?? createDefaultRegistry();
    this.pluginRegistry = pluginRegistry ?? new DefaultPluginRegistry();
  }

  registerPlugin(plugin: SeoPlugin): void {
    this.pluginRegistry.register(plugin);
    if (plugin.rules) {
      for (const rule of plugin.rules) {
        this.ruleEngine.registerRule(rule);
      }
    }
  }

  async run(startUrl: string, partialConfig: Partial<SeoConfig> = {}, tier?: ExecutionTier): Promise<AuditResult> {
    // Determine tier config
    let tierConfig: ExecutionTierConfig | undefined;
    if (tier) {
      tierConfig = TIER_PRESETS[tier];
    } else if (partialConfig.preset) {
      // Map preset to tier (quick -> fast)
      const presetToTier: Record<string, ExecutionTier> = {
        quick: 'fast',
        standard: 'standard',
        deep: 'deep',
        enterprise: 'enterprise'
      };
      const mappedTier = presetToTier[partialConfig.preset];
      if (mappedTier) {
        tierConfig = TIER_PRESETS[mappedTier];
      }
    }

    // Resolve config, merging tier settings with user overrides
    let config = resolveConfig(partialConfig);
    
    // Apply tier config crawl settings if available
    if (tierConfig) {
      config = {
        ...config,
        maxDepth: tierConfig.crawl.maxDepth,
        maxPages: tierConfig.crawl.maxPages,
        concurrency: tierConfig.crawl.concurrency,
        rateLimitMs: tierConfig.crawl.rateLimitMs,
        playwrightEnabled: tierConfig.crawl.playwrightEnabled,
        lighthouseEnabled: tierConfig.crawl.lighthouseEnabled
      };
      const autoPlugins = await loadPluginsForTier(tierConfig);
      for (const p of autoPlugins) {
        this.registerPlugin(p);
      }
    }

    const { name: crawlerName, crawler } = await this.crawlerRegistry.selectForConfig(config);
    await this.eventBus.emit('crawler:selected', { name: crawlerName });

    // 1. Run lifecycle hook: onInit
    await this.pluginRegistry.runHook('onInit', config);

    await this.eventBus.emit('crawl:start', { startUrl, timestamp: new Date().toISOString() });

    const domain = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queued = new Set<string>();
    const pages: Record<string, NormalizedPage> = {};
    const sampledUrls = new Set<string>();
    const httpCrawler = new HttpCrawler();

    let robotsTxt: RobotsTxt | null = null;
    let robotsTxtFound = false;
    let sitemapXmlFound = false;
    let sitemapUrls: string[] = [];

    // Step A: Pre-crawl fetch robots.txt and sitemap.xml
    try {
      const robotsUrl = `${domain}/robots.txt`;
      const robotsResult = await httpCrawler.crawl(robotsUrl, config);
      if (robotsResult.statusCode === 200 && robotsResult.html) {
        robotsTxt = new RobotsTxt(robotsResult.html);
        robotsTxtFound = true;
      }
    } catch {
      // ignore, robotsTxt stays null
    }

    try {
      const sitemapUrl = `${domain}/sitemap.xml`;
      const sitemapResult = await httpCrawler.crawl(sitemapUrl, config);
      if (sitemapResult.statusCode === 200 && sitemapResult.html) {
        sitemapXmlFound = true;
        sitemapUrls = SitemapParser.parse(sitemapResult.html);
      }
    } catch {
      // ignore
    }

    const startTotalTime = Date.now();

    const limiter = new Bottleneck({
      minTime: config.rateLimitMs,
    });

    const pQueue = new PQueue({ concurrency: config.concurrency });

    const enqueue = (url: string, depth: number) => {
      if (queued.has(url) || queued.size >= config.maxPages) {
        return;
      }

      // A. Check Exclude Patterns
      if (config.excludePatterns.length > 0 && isUrlMatch(url, config.excludePatterns)) {
        return;
      }

      // B. Check Include Patterns (if specified, URL must match at least one)
      if (config.includePatterns.length > 0 && !isUrlMatch(url, config.includePatterns)) {
        return;
      }

      queued.add(url);

      if (config.lighthouseEnabled) {
        if (config.lighthouseSampleCount === undefined || sampledUrls.size < config.lighthouseSampleCount) {
          sampledUrls.add(url);
        }
      }

      pQueue.add(async () => {
        // Check robots.txt Disallow
        const urlObj = new URL(url);
        if (robotsTxt && !robotsTxt.isAllowed(urlObj.pathname)) {
          visited.add(url);
          return;
        }

        // Run hook: onBeforeCrawl
        const finalUrl = await this.pluginRegistry.runUrlRewriteHook('onBeforeCrawl', url);

        try {
          let crawlResult;
          const useLighthouse = sampledUrls.has(url);
          if (config.lighthouseEnabled && !useLighthouse) {
            // We've hit the sample limit, use HTTP crawler
            crawlResult = await limiter.schedule(() => httpCrawler.crawl(finalUrl, config));
          } else {
            // Use configured crawler
            crawlResult = await limiter.schedule(() => crawler.crawl(finalUrl, config));
          }
          visited.add(url);

          await this.eventBus.emit('page:loaded', {
            url: finalUrl,
            statusCode: crawlResult.statusCode,
            loadTimeMs: crawlResult.loadTimeMs,
          });

          const page = PageNormalizer.normalize(crawlResult);
          page.depth = depth;

          if (url === startUrl) {
            page.robotsTxtFound = robotsTxtFound;
            page.sitemapXmlFound = sitemapXmlFound;
          }

          pages[finalUrl] = page;

          await this.pluginRegistry.runHook('onPageCrawled', crawlResult, page);

          await this.eventBus.emit('dom:parsed', { url: finalUrl, page });

          if (depth < config.maxDepth && crawlResult.statusCode === 200) {
            for (const link of page.links) {
              if (link.isInternal && !queued.has(link.url)) {
                enqueue(link.url, depth + 1);
              }
            }
          }
        } catch (err) {
          visited.add(url);
          console.error(`[Crawler] Failed to crawl ${url}:`, err);
        }
      });
    };

    enqueue(startUrl, 1);
    await pQueue.onIdle();

    // Calculate Crawl Graph before running analysis
    const crawlGraph = CrawlGraphBuilder.build({ pages, startUrl, domain, sitemapUrls });

    const totalLoadTimeMs = Date.now() - startTotalTime;

    const dataSources = new Map<string, DataSource>();

    // 2. Run lifecycle hook: onBeforeAnalysis
    const beforeAnalysisCtx = { startUrl, config, dataSources };
    await this.pluginRegistry.runHook('onBeforeAnalysis', pages, beforeAnalysisCtx);

    const backlinksDS = dataSources.get('backlinks');
    const backlinkData = backlinksDS?.data as BacklinkIntelligenceData | undefined;
    const backlinkError = backlinksDS?.status === 'error' ? backlinksDS.error : undefined;

    // 3. Evaluate SEO rules
    let findings = await this.ruleEngine.run(pages, config, dataSources, tierConfig, backlinkData, backlinkError);

    // 4. Run lifecycle hook: onAfterAnalysis (allowing mutations)
    findings = await this.pluginRegistry.runMutationHook('onAfterAnalysis', findings);

    await this.eventBus.emit('analyzer:completed', { url: startUrl, findingsCount: findings.length });

    // 5. Calculate score
    const ruleDefs: RuleDefinition[] = this.ruleEngine.getRules(config, tierConfig).map((r) => r.definition);
    const scoringResult = ScoringEngine.calculate({
      findings,
      pagesAudited: visited.size,
      config,
      tierConfig: tierConfig ?? TIER_PRESETS.standard,
      ruleDefinitions: ruleDefs,
    });

    await this.eventBus.emit('score:calculated', {
      score: scoringResult.score,
      categories: scoringResult.categories,
    });

    const auditResult: AuditResult = {
      url: startUrl,
      timestamp: new Date().toISOString(),
      config: partialConfig,
      score: scoringResult.score,
      categories: scoringResult.categories,
      findings,
      pagesAudited: visited.size,
      totalLoadTimeMs,
      pages,
      crawlGraph,
      backlinkData,
    };

    // 6. Run lifecycle hook: onComplete
    await this.pluginRegistry.runHook('onComplete', auditResult);

    await this.eventBus.emit('audit:complete', { result: auditResult });

    // Clean up crawler resources
    if (crawler && 'close' in crawler && typeof crawler.close === 'function') {
      try {
        await crawler.close();
      } catch (err) {
        console.warn(`[Engine] Error cleaning up crawler:`, err);
      }
    }

    return auditResult;
  }
}
