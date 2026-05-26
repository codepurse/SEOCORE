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
  DataSource,
  Category,
  ModuleActivation,
  RuleEvaluationContext,
  Finding,
} from '@seocore/sdk';
import { resolveConfig } from '@seocore/config';
import { DefaultPluginRegistry, loadPluginsForTier } from './plugin-registry.js';
import PQueue from 'p-queue';
import Bottleneck from 'bottleneck';
import { AimdConcurrencyController } from './concurrency/index.js';
import { HttpCrawler, PlaywrightCrawler, LighthouseCrawler, RobotsTxt, SitemapParser, CrawlerRegistry, createDefaultRegistry } from '@seocore/crawler';
import { PageNormalizer } from '@seocore/analyzers';
import { createDefaultRuleEngine, type RuleEngine, PageIndexRegistry } from '@seocore/rules-core';
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

function getCategoriesForModules(modules: ModuleActivation): Category[] {
  const categories = new Set<Category>();

  if (modules.core) {
    categories.add('seo');
    categories.add('metadata');
    categories.add('indexing');
    categories.add('links');
    categories.add('accessibility');
  }
  if (modules.performance) categories.add('performance');
  if (modules.mobile) categories.add('mobile_seo');
  if (modules.aiVisibility) categories.add('ai_visibility');
  if (modules.security) categories.add('security');
  if (modules.backlinks) categories.add('backlink_intelligence');
  if (modules.hreflang) categories.add('indexing');

  return [...categories];
}

export class SeoEngine {
  private readonly eventBus: EventBus;
  private readonly crawlerRegistry: CrawlerRegistry;
  private readonly pluginRegistry: DefaultPluginRegistry;

  constructor(
    eventBus = new EventBus(),
    crawlerRegistry?: CrawlerRegistry,
    pluginRegistry?: DefaultPluginRegistry
  ) {
    this.eventBus = eventBus;
    this.crawlerRegistry = crawlerRegistry ?? createDefaultRegistry();
    this.pluginRegistry = pluginRegistry ?? new DefaultPluginRegistry();
  }

  registerPlugin(plugin: SeoPlugin): void {
    this.pluginRegistry.register(plugin);
  }

  private async createRuleEngine(tierConfig?: ExecutionTierConfig): Promise<RuleEngine> {
    const ruleEngine = createDefaultRuleEngine();

    if (tierConfig?.modules.performance) {
      const { getPerformanceRules } = await import('@seocore/rules-performance');
      ruleEngine.registerRules(getPerformanceRules());
    }

    if (tierConfig?.modules.mobile) {
      const { getMobileRules } = await import('@seocore/rules-mobile');
      ruleEngine.registerRules(getMobileRules());
    }

    if (tierConfig?.modules.aiVisibility) {
      const { getAiVisibilityRules } = await import('@seocore/rules-ai-visibility');
      ruleEngine.registerRules(getAiVisibilityRules());
    }

    if (tierConfig?.modules.security !== false) {
      const { getSecurityRules } = await import('@seocore/rules-security');
      ruleEngine.registerRules(getSecurityRules());
    }

    if (tierConfig?.modules.hreflang) {
      const { getHreflangRules } = await import('@seocore/rules-hreflang');
      ruleEngine.registerRules(getHreflangRules());
    }

    const pluginRules = this.pluginRegistry.getRules();
    if (pluginRules.length > 0) {
      ruleEngine.registerRules(pluginRules);
    }

    return ruleEngine;
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
      if (config.modules) {
        const mergedModules = {
          ...tierConfig.modules,
          ...config.modules,
        };
        tierConfig = {
          ...tierConfig,
          modules: mergedModules,
          ruleFilter: {
            ...tierConfig.ruleFilter,
            categories: getCategoriesForModules(mergedModules),
          },
        };
      }
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
    
    // Initialize cache if configured
    const httpCrawler = config.cacheDir ? new HttpCrawler(config.cacheDir) : new HttpCrawler();

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

    // Initialize AIMD controller if configured
    let aimdController: AimdConcurrencyController | undefined;
    let initialConcurrency = config.concurrency;
    if (config.adaptiveConcurrency) {
      aimdController = new AimdConcurrencyController({
        initialConcurrency: config.concurrency,
      });
      initialConcurrency = aimdController.concurrency;
    }

    const pQueue = new PQueue({ concurrency: initialConcurrency });

    // Initialize rule engine and indexes for streaming
    const ruleEngine = await this.createRuleEngine(tierConfig);
    const indexes = new PageIndexRegistry();
    
    // Get stateless rules to run during crawl
    const allRules = ruleEngine.getRules(config, tierConfig);
    const statelessRules = allRules.filter(r => r.definition.stateless);
    const statefulRules = allRules.filter(r => !r.definition.stateless);
    
    // Initialize findings array
    const findings: any[] = [];

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

        let crawlSuccess = false;
        try {
          // Acquire AIMD permit if enabled
          if (aimdController) {
            await aimdController.acquire();
          }

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
          crawlSuccess = true;

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

          // Index the page
          indexes.indexPage(page);

          // Run stateless rules immediately
          if (statelessRules.length > 0) {
            const ctx: any = {
              allPages: pages,
              config,
              dataSources: new Map(),
              indexes,
            };
            
            // Parallel rule execution
            const rulePromises = statelessRules.map(async rule => {
              try {
                const ruleFindings = await rule.evaluate(page, ctx);
                if (ruleFindings) {
                  return ruleFindings;
                }
              } catch (err) {
                console.error(`[RuleEngine] Error in stateless rule ${rule.definition.id}:`, err);
              }
              return [];
            });
            
            const ruleResults = await Promise.all(rulePromises);
            for (const result of ruleResults) {
              findings.push(...result);
            }
          }

          // Drop HTML if streaming is enabled
          if (config.streamingEnabled) {
            page.html = undefined;
            page.htmlDropped = true;
          }

          await this.eventBus.emit('page:processed', { url: finalUrl, findingsSoFar: findings.length });

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
        } finally {
          // Release AIMD permit if enabled
          if (aimdController) {
            aimdController.release(crawlSuccess);
            // Update queue concurrency
            pQueue.concurrency = aimdController.concurrency;
          }
        }
      });
    };

    enqueue(startUrl, 1);
    await pQueue.onIdle();

    // Run stateful rules now that all pages are crawled
    if (statefulRules.length > 0) {
      const dataSources = new Map<string, DataSource>();
      
      // 2. Run lifecycle hook: onBeforeAnalysis
      const beforeAnalysisCtx = { startUrl, config, dataSources };
      await this.pluginRegistry.runHook('onBeforeAnalysis', pages, beforeAnalysisCtx);

      const backlinksDS = dataSources.get('backlinks');
      const backlinkData = backlinksDS?.data as BacklinkIntelligenceData | undefined;
      const backlinkError = backlinksDS?.status === 'error' ? backlinksDS.error : undefined;

      // Run stateful rules (need to iterate over all pages for each rule)
      const ctx: RuleEvaluationContext = {
        allPages: pages,
        config,
        dataSources,
        backlinkData,
        backlinkError,
        indexes,
      };
      
      const statefulPromises = Object.values(pages).map(async page => {
        const pageFindings: Finding[] = [];
        for (const rule of statefulRules) {
          try {
            const ruleFindings = await rule.evaluate(page, ctx);
            pageFindings.push(...ruleFindings);
          } catch (err) {
            console.error(`[RuleEngine] Error in stateful rule ${rule.definition.id}:`, err);
          }
        }
        return pageFindings;
      });
      
      const statefulResults = await Promise.all(statefulPromises);
      for (const result of statefulResults) {
        findings.push(...result);
      }

      // 4. Run lifecycle hook: onAfterAnalysis (allowing mutations)
      const mutatedFindings = await this.pluginRegistry.runMutationHook('onAfterAnalysis', findings);
      findings.splice(0, findings.length, ...mutatedFindings);
    }

    // Calculate Crawl Graph before running analysis
    const crawlGraph = CrawlGraphBuilder.build({ pages, startUrl, domain, sitemapUrls });

    const totalLoadTimeMs = Date.now() - startTotalTime;

    await this.eventBus.emit('analyzer:completed', { url: startUrl, findingsCount: findings.length });

    // 5. Calculate score
    const ruleDefs: RuleDefinition[] = ruleEngine.getRules(config, tierConfig).map((r) => r.definition);
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
      backlinkData: undefined,
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
