import { NormalizedPage, CrawlGraph, CrawlGraphNode, CrawlGraphEdge } from '@seocore/sdk';

export interface GraphBuildInput {
  pages: Record<string, NormalizedPage>;
  startUrl: string;
  domain: string;
  sitemapUrls: string[];
}

export interface PageRankOptions {
  damping?: number;       // default 0.85
  iterations?: number;    // default 20 (was 5)
  tolerance?: number;     // default 1e-4 (early termination)
}

function computeL1Diff(ranks1: Map<string, number>, ranks2: Map<string, number>): number {
  let diff = 0;
  for (const [url, rank] of ranks1.entries()) {
    const nextRank = ranks2.get(url) || 0;
    diff += Math.abs(rank - nextRank);
  }
  return diff;
}

export class PageRankCalculator {
  static calculate(
    nodes: string[],
    outLinks: Map<string, Set<string>>,
    opts?: PageRankOptions
  ): Map<string, number> {
    const damping = opts?.damping ?? 0.85;
    const iterations = opts?.iterations ?? 20;
    const tolerance = opts?.tolerance ?? 1e-4;
    const numPages = nodes.length;

    let ranks = new Map<string, number>();
    if (numPages === 0) {
      return ranks;
    }

    for (const url of nodes) {
      ranks.set(url, 1);
    }

    for (let iter = 0; iter < iterations; iter++) {
      const nextRanks = new Map<string, number>();
      for (const url of nodes) {
        nextRanks.set(url, 1 - damping);
      }

      // Sum dangling rank once, redistribute uniformly
      let danglingSum = 0;
      for (const url of nodes) {
        const outSet = outLinks.get(url);
        if (!outSet || outSet.size === 0) {
          danglingSum += ranks.get(url) || 0;
        }
      }
      const danglingShare = (danglingSum * damping) / numPages;

      // Add danglingShare to every node BEFORE the link distribution pass
      for (const url of nodes) {
        nextRanks.set(url, nextRanks.get(url)! + danglingShare);
      }

      // Link distribution pass
      for (const url of nodes) {
        const outSet = outLinks.get(url);
        if (outSet && outSet.size > 0) {
          const share = ((ranks.get(url) || 0) * damping) / outSet.size;
          for (const targetUrl of outSet) {
            if (nextRanks.has(targetUrl)) {
              nextRanks.set(targetUrl, nextRanks.get(targetUrl)! + share);
            }
          }
        }
      }

      const delta = computeL1Diff(ranks, nextRanks);
      ranks = nextRanks;
      if (delta < tolerance) {
        break;
      }
    }

    return ranks;
  }
}

export class CrawlGraphBuilder {
  static build(input: GraphBuildInput): CrawlGraph {
    const { pages, startUrl, domain, sitemapUrls } = input;

    // 1. Inject sitemap orphans
    CrawlGraphBuilder.injectSitemapOrphans(pages, sitemapUrls, domain);

    // 2. Build link maps
    const { inLinks, outLinks, edges } = CrawlGraphBuilder.buildLinkMaps(pages);

    // 3. Compute degrees
    CrawlGraphBuilder.computeDegrees(pages, inLinks, outLinks, startUrl);

    // 4. Delegate PageRank calculation
    const urls = Object.keys(pages);
    const ranks = PageRankCalculator.calculate(urls, outLinks);

    // 5. Compute normalized authority scores
    CrawlGraphBuilder.computeNormalizedAuthorityScores(pages, ranks);

    // 6. Compute metrics
    const nodes: CrawlGraphNode[] = [];
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

    const { maxDepth, orphanCount, hubPages, authorityNodes } = CrawlGraphBuilder.computeMetrics(nodes);

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

  private static injectSitemapOrphans(
    pages: Record<string, NormalizedPage>,
    sitemapUrls: string[],
    domain: string
  ): void {
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
  }

  private static buildLinkMaps(pages: Record<string, NormalizedPage>): {
    inLinks: Map<string, Set<string>>;
    outLinks: Map<string, Set<string>>;
    edges: CrawlGraphEdge[];
  } {
    const inLinks = new Map<string, Set<string>>();
    const outLinks = new Map<string, Set<string>>();
    const edges: CrawlGraphEdge[] = [];

    const urls = Object.keys(pages);
    for (const url of urls) {
      inLinks.set(url, new Set<string>());
      outLinks.set(url, new Set<string>());
    }

    for (const [url, page] of Object.entries(pages)) {
      for (const link of page.links) {
        if (link.isInternal && pages[link.url]) {
          outLinks.get(url)!.add(link.url);
          inLinks.get(link.url)!.add(url);
          edges.push({
            source: url,
            target: link.url,
          });
        }
      }
    }

    return { inLinks, outLinks, edges };
  }

  private static computeDegrees(
    pages: Record<string, NormalizedPage>,
    inLinks: Map<string, Set<string>>,
    outLinks: Map<string, Set<string>>,
    startUrl: string
  ): void {
    for (const url of Object.keys(pages)) {
      const inDegree = inLinks.get(url)?.size ?? 0;
      const outDegree = outLinks.get(url)?.size ?? 0;

      const page = pages[url];
      page.inDegree = inDegree;
      page.outDegree = outDegree;
      page.isOrphan = page.isOrphan || (url !== startUrl && inDegree === 0);
    }
  }

  private static computeNormalizedAuthorityScores(
    pages: Record<string, NormalizedPage>,
    ranks: Map<string, number>
  ): void {
    const prValues = Array.from(ranks.values());
    const maxPR = Math.max(...prValues, 1e-4);
    for (const [url, page] of Object.entries(pages)) {
      const rank = ranks.get(url) ?? 0;
      page.authorityScore = Math.round(1 + 99 * (rank / maxPR));
    }
  }

  private static computeMetrics(nodes: CrawlGraphNode[]): {
    maxDepth: number;
    orphanCount: number;
    hubPages: { url: string; outDegree: number }[];
    authorityNodes: { url: string; inDegree: number }[];
  } {
    let maxDepth = 0;
    let orphanCount = 0;

    for (const node of nodes) {
      if (node.depth > maxDepth) {
        maxDepth = node.depth;
      }
      if (node.isOrphan) {
        orphanCount++;
      }
    }

    const hubPages = nodes
      .map((n) => ({ url: n.url, outDegree: n.outDegree }))
      .sort((a, b) => b.outDegree - a.outDegree)
      .slice(0, 5);

    const authorityNodes = nodes
      .map((n) => ({ url: n.url, inDegree: n.inDegree }))
      .sort((a, b) => b.inDegree - a.inDegree)
      .slice(0, 5);

    return {
      maxDepth,
      orphanCount,
      hubPages,
      authorityNodes,
    };
  }
}
