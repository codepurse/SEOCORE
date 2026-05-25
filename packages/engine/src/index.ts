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
  TIER_PRESETS
} from '@seocore/sdk';
import { resolveConfig } from '@seocore/config';
import { createBacklinkClient } from '@seocore/backlinks';
import PQueue from 'p-queue';
import Bottleneck from 'bottleneck';
import { HttpCrawler, PlaywrightCrawler, LighthouseCrawler, RobotsTxt, SitemapParser } from '@seocore/crawler';
import { PageNormalizer } from '@seocore/analyzers';
import { RuleEngine } from '@seocore/rules';
import { ScoringEngine } from '@seocore/scoring';

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
  private crawler: Crawler;
  private readonly ruleEngine: RuleEngine;
  private readonly plugins: SeoPlugin[] = [];

  constructor(eventBus = new EventBus()) {
    this.eventBus = eventBus;
    this.ruleEngine = new RuleEngine();
    this.crawler = new HttpCrawler(); // default, will switch in run() if configured
  }

  registerPlugin(plugin: SeoPlugin): void {
    this.plugins.push(plugin);
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
    }

    // Instantiate crawler based on config
    if (config.lighthouseEnabled) {
      this.crawler = new LighthouseCrawler();
    } else if (config.playwrightEnabled) {
      this.crawler = new PlaywrightCrawler();
    } else {
      this.crawler = new HttpCrawler();
    }

    // 1. Run lifecycle hook: onInit
    for (const plugin of this.plugins) {
      if (plugin.lifecycle?.onInit) {
        await plugin.lifecycle.onInit(config);
      }
    }

    await this.eventBus.emit('crawl:start', { startUrl, timestamp: new Date().toISOString() });

    const domain = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queued = new Set<string>();
    const pages: Record<string, NormalizedPage> = {};
    let lighthousePagesCrawled = 0;
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

      pQueue.add(async () => {
        // Check robots.txt Disallow
        const urlObj = new URL(url);
        if (robotsTxt && !robotsTxt.isAllowed(urlObj.pathname)) {
          visited.add(url);
          return;
        }

        // Run hook: onBeforeCrawl
        let finalUrl = url;
        for (const plugin of this.plugins) {
          if (plugin.lifecycle?.onBeforeCrawl) {
            const hookRes = await plugin.lifecycle.onBeforeCrawl(url);
            if (hookRes) finalUrl = hookRes;
          }
        }

        try {
          let crawlResult;
          if (config.lighthouseEnabled && config.lighthouseSampleCount !== undefined && lighthousePagesCrawled >= config.lighthouseSampleCount) {
            // We've hit the sample limit, use HTTP crawler
            crawlResult = await limiter.schedule(() => httpCrawler.crawl(finalUrl, config));
          } else {
            // Use configured crawler
            crawlResult = await limiter.schedule(() => this.crawler.crawl(finalUrl, config));
            if (config.lighthouseEnabled) {
              lighthousePagesCrawled++;
            }
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

          for (const plugin of this.plugins) {
            if (plugin.lifecycle?.onPageCrawled) {
              await plugin.lifecycle.onPageCrawled(crawlResult, page);
            }
          }

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
    const crawlGraph = this.calculateCrawlGraph(pages, startUrl, domain, sitemapUrls);

    const totalLoadTimeMs = Date.now() - startTotalTime;

    // 2. Run lifecycle hook: onBeforeAnalysis
    for (const plugin of this.plugins) {
      if (plugin.lifecycle?.onBeforeAnalysis) {
        await plugin.lifecycle.onBeforeAnalysis(pages);
      }
    }

    let backlinkData: BacklinkIntelligenceData | undefined;
    let backlinkError: string | undefined;

    if (config.backlinks) {
      try {
        const backlinkClient = createBacklinkClient(config.backlinks);
        backlinkData = await backlinkClient.getIntelligence(startUrl, 250);
      } catch (err: any) {
        backlinkError = err.message;
      }
    }

    // 3. Evaluate SEO rules
    let findings = await this.ruleEngine.run(pages, config, backlinkData, backlinkError, tierConfig);

    // 4. Run lifecycle hook: onAfterAnalysis (allowing mutations)
    for (const plugin of this.plugins) {
      if (plugin.lifecycle?.onAfterAnalysis) {
        const mutated = await plugin.lifecycle.onAfterAnalysis(findings);
        if (mutated) findings = mutated;
      }
    }

    await this.eventBus.emit('analyzer:completed', { url: startUrl, findingsCount: findings.length });

    // 5. Calculate score
    const ruleDefs: RuleDefinition[] = this.ruleEngine.getRules(config, tierConfig).map((r) => r.definition);
    const scoringResult = ScoringEngine.calculate(findings, visited.size, config, ruleDefs, tierConfig);

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
    for (const plugin of this.plugins) {
      if (plugin.lifecycle?.onComplete) {
        await plugin.lifecycle.onComplete(auditResult);
      }
    }

    await this.eventBus.emit('audit:complete', { result: auditResult });

    // Clean up crawler resources
    if ('close' in this.crawler && typeof this.crawler.close === 'function') {
      try {
        await this.crawler.close();
      } catch (err) {
        console.warn(`[Engine] Error cleaning up crawler:`, err);
      }
    }

    return auditResult;
  }

  private calculateCrawlGraph(
    pages: Record<string, NormalizedPage>,
    startUrl: string,
    domain: string,
    sitemapUrls: string[]
  ) {
    // 1. Inject sitemap orphans
    for (const sitemapUrl of sitemapUrls) {
      if (!pages[sitemapUrl]) {
        try {
          const sitemapUrlObj = new URL(sitemapUrl);
          if (sitemapUrlObj.origin === domain) {
            pages[sitemapUrl] = {
              url: sitemapUrl,
              statusCode: 0,
              loadTimeMs: 0,
              contentType: 'none',
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              hreflang: [],
              structuredData: [],
              isOrphan: true,
              inDegree: 0,
              outDegree: 0,
              depth: 0,
              authorityScore: 1,
            };
          }
        } catch {
          // ignore
        }
      }
    }

    const nodes: any[] = [];
    const edges: any[] = [];
    const inLinksMap: Record<string, Set<string>> = {};
    const outLinksMap: Record<string, Set<string>> = {};

    for (const url of Object.keys(pages)) {
      inLinksMap[url] = new Set<string>();
      outLinksMap[url] = new Set<string>();
    }

    // Populate out and in links maps and edges
    for (const [url, page] of Object.entries(pages)) {
      for (const link of page.links) {
        if (link.isInternal && pages[link.url]) {
          outLinksMap[url].add(link.url);
          inLinksMap[link.url].add(url);
          edges.push({
            source: url,
            target: link.url,
          });
        }
      }
    }

    let maxDepth = 0;
    for (const [url, page] of Object.entries(pages)) {
      const inDegree = inLinksMap[url].size;
      const outDegree = outLinksMap[url].size;

      page.inDegree = inDegree;
      page.outDegree = outDegree;
      page.isOrphan = page.isOrphan || (url !== startUrl && inDegree === 0);

      if (page.depth && page.depth > maxDepth) {
        maxDepth = page.depth;
      }
    }

    // PageRank calculation
    const numPages = Object.keys(pages).length;
    if (numPages > 0) {
      let ranks: Record<string, number> = {};
      for (const url of Object.keys(pages)) {
        ranks[url] = 1;
      }

      const damping = 0.85;
      const iterations = 5;

      for (let iter = 0; iter < iterations; iter++) {
        const nextRanks: Record<string, number> = {};
        for (const url of Object.keys(pages)) {
          nextRanks[url] = 1 - damping;
        }

        for (const url of Object.keys(pages)) {
          const outCount = outLinksMap[url].size;
          if (outCount > 0) {
            const share = (ranks[url] * damping) / outCount;
            for (const targetUrl of outLinksMap[url]) {
              nextRanks[targetUrl] = (nextRanks[targetUrl] || 0) + share;
            }
          } else {
            const share = (ranks[url] * damping) / numPages;
            for (const targetUrl of Object.keys(pages)) {
              nextRanks[targetUrl] = (nextRanks[targetUrl] || 0) + share;
            }
          }
        }
        ranks = nextRanks;
      }

      const prValues = Object.values(ranks);
      const maxPR = Math.max(...prValues, 1e-4);
      for (const [url, page] of Object.entries(pages)) {
        page.authorityScore = Math.round(1 + 99 * (ranks[url] / maxPR));
      }
    }

    for (const [url, page] of Object.entries(pages)) {
      nodes.push({
        url,
        depth: page.depth || 0,
        isOrphan: !!page.isOrphan,
        inDegree: page.inDegree || 0,
        outDegree: page.outDegree || 0,
        authorityScore: page.authorityScore || 1,
      });
    }

    const orphanCount = nodes.filter((n) => n.isOrphan).length;
    const hubPages = nodes
      .map((n) => ({ url: n.url, outDegree: n.outDegree }))
      .sort((a, b) => b.outDegree - a.outDegree)
      .slice(0, 5);

    const authorityNodes = nodes
      .map((n) => ({ url: n.url, inDegree: n.inDegree }))
      .sort((a, b) => b.inDegree - a.inDegree)
      .slice(0, 5);

    return {
      nodes,
      edges,
      metrics: {
        maxDepth,
        orphanCount,
        hubPages,
        authorityNodes,
      },
    };
  }
}
