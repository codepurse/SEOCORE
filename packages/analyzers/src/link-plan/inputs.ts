import { NormalizedPage, CrawlGraph } from '@seocore/sdk';
import { NormalizedPageFacts } from './types.js';

const COMMERCIAL_PATTERNS = [
  '/product', '/products', '/service', '/services',
  '/pricing', '/buy', '/shop', '/checkout', '/cart',
];

const UTILITY_PATTERNS = [
  '/contact', '/about', '/terms', '/privacy', '/sitemap',
  '/robots.txt', '/login', '/register', '/search', '/auth',
  '/logout', '/account', '/user', '/admin',
];

export function normalizePageFacts(
  pages: Record<string, NormalizedPage>,
  crawlGraph?: CrawlGraph
): Map<string, NormalizedPageFacts> {
  const facts = new Map<string, NormalizedPageFacts>();
  const graphNodeMap = new Map<string, { depth: number; inDegree: number; outDegree: number; authorityScore: number; isOrphan: boolean }>();

  if (crawlGraph?.nodes) {
    for (const node of crawlGraph.nodes) {
      graphNodeMap.set(node.url, {
        depth: node.depth,
        inDegree: node.inDegree,
        outDegree: node.outDegree,
        authorityScore: node.authorityScore,
        isOrphan: node.isOrphan,
      });
    }
  }

  for (const [url, page] of Object.entries(pages)) {
    const graphNode = graphNodeMap.get(url);

    facts.set(url, {
      url,
      title: page.title,
      h1: page.headings?.h1 || [],
      h2: page.headings?.h2 || [],
      depth: graphNode?.depth ?? page.depth ?? 0,
      inDegree: graphNode?.inDegree ?? page.inDegree ?? 0,
      outDegree: graphNode?.outDegree ?? page.outDegree ?? page.links?.length ?? 0,
      authorityScore: graphNode?.authorityScore ?? page.authorityScore ?? 0,
      isOrphan: graphNode?.isOrphan ?? page.isOrphan ?? (page.inDegree === 0),
      hasStructuredData: Array.isArray(page.structuredData) && page.structuredData.length > 0,
      isCommercial: isCommercialUrl(url),
      isUtility: isUtilityPage(url),
      links: page.links || [],
    });
  }

  return facts;
}

export function isCommercialUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return COMMERCIAL_PATTERNS.some(p => lower.includes(p));
}

export function isUtilityPage(url: string): boolean {
  const lower = url.toLowerCase();
  return UTILITY_PATTERNS.some(p => lower.endsWith(p) || lower.includes(p + '/'));
}

export function getOutboundInternalLinks(facts: NormalizedPageFacts): Set<string> {
  const targets = new Set<string>();
  for (const link of facts.links) {
    if (link.isInternal) {
      targets.add(link.url);
    }
  }
  return targets;
}
