import { NormalizedPage, CrawlGraph } from '@seocore/sdk';

export interface PlannedTarget {
  url: string;
  title?: string;
  depth: number;
  inDegree: number;
  isOrphan: boolean;
  reason: string;
}

export interface HubSummary {
  url: string;
  outDegree: number;
  inDegree: number;
  authorityScore: number;
}

export interface LinkSuggestion {
  sourceUrl: string;
  sourceTitle?: string;
  targetUrl: string;
  targetTitle?: string;
  anchorText?: string;
  anchorTheme: string;
  confidence: number;
  reason: string;
}

export interface LinkPlanResult {
  url: string;
  generatedAt: string;
  orphanPages: PlannedTarget[];
  priorityPages: PlannedTarget[];
  suggestions: LinkSuggestion[];
  hubs: HubSummary[];
}

const COMMERCIAL_PATTERNS = [
  '/product',
  '/products',
  '/service',
  '/services',
  '/pricing',
  '/buy',
  '/shop',
  '/checkout',
  '/cart',
];

const UTILITY_PATTERNS = [
  '/contact',
  '/about',
  '/terms',
  '/privacy',
  '/sitemap',
  '/robots.txt',
  '/login',
  '/register',
  '/search',
];

export class LinkPlanAnalyzer {
  private pages: Record<string, NormalizedPage> = {};
  private graph: CrawlGraph | undefined;

  analyze(pages: Record<string, NormalizedPage>, crawlGraph?: CrawlGraph, url?: string): LinkPlanResult {
    this.pages = pages;
    this.graph = crawlGraph;

    const orphanPages = this.findOrphanPages();
    const priorityPages = this.findPriorityPages(orphanPages);
    const hubs = this.findHubs();
    const suggestions = this.generateLinkSuggestions(orphanPages, priorityPages, hubs);

    return {
      url: url || Object.keys(pages)[0] || 'unknown',
      generatedAt: new Date().toISOString(),
      orphanPages,
      priorityPages,
      suggestions,
      hubs,
    };
  }

  private findOrphanPages(): PlannedTarget[] {
    const orphans: PlannedTarget[] = [];

    for (const [url, page] of Object.entries(this.pages)) {
      const inDegree = page.inDegree || 0;

      if (inDegree === 0 || page.isOrphan) {
        const reason = inDegree === 0
          ? 'No incoming links from other crawled pages'
          : 'Marked as orphan by crawler';

        orphans.push({
          url,
          title: page.title,
          depth: page.depth || 0,
          inDegree,
          isOrphan: true,
          reason,
        });
      }
    }

    orphans.sort((a, b) => {
      const aCommercial = this.isCommercialUrl(a.url);
      const bCommercial = this.isCommercialUrl(b.url);
      if (aCommercial && !bCommercial) return -1;
      if (bCommercial && !aCommercial) return 1;
      return a.depth - b.depth;
    });

    return orphans;
  }

  private findPriorityPages(orphanPages: PlannedTarget[]): PlannedTarget[] {
    const priorityUrls = new Set<string>();

    for (const page of Object.values(this.pages)) {
      if (this.isCommercialUrl(page.url)) {
        priorityUrls.add(page.url);
      }

      if (page.structuredData && Array.isArray(page.structuredData)) {
        for (const schema of page.structuredData) {
          const type = schema['@type'];
          if (type === 'Product' || type === 'Service' || type === 'Article') {
            priorityUrls.add(page.url);
          }
        }
      }
    }

    const orphanSet = new Set(orphanPages.map(o => o.url));
    const priorities: PlannedTarget[] = [];

    for (const url of priorityUrls) {
      if (orphanSet.has(url)) continue;

      const page = this.pages[url];
      if (!page) continue;

      priorities.push({
        url,
        title: page.title,
        depth: page.depth || 0,
        inDegree: page.inDegree || 0,
        isOrphan: false,
        reason: this.isCommercialUrl(url)
          ? 'Commercial URL pattern detected'
          : 'Contains structured data for important entity type',
      });
    }

    priorities.sort((a, b) => {
      const aRank = this.calculatePriorityScore(a);
      const bRank = this.calculatePriorityScore(b);
      return bRank - aRank;
    });

    return priorities;
  }

  private findHubs(): HubSummary[] {
    const hubMap = new Map<string, HubSummary>();

    for (const [url, page] of Object.entries(this.pages)) {
      const outDegree = page.outDegree || page.links?.length || 0;
      const inDegree = page.inDegree || 0;
      const authorityScore = page.authorityScore || 0;

      if (outDegree > 5 || authorityScore > 50) {
        hubMap.set(url, {
          url,
          outDegree,
          inDegree,
          authorityScore,
        });
      }
    }

    return Array.from(hubMap.values())
      .sort((a, b) => b.outDegree - a.outDegree)
      .slice(0, 20);
  }

  private generateLinkSuggestions(
    orphanPages: PlannedTarget[],
    priorityPages: PlannedTarget[],
    hubs: HubSummary[]
  ): LinkSuggestion[] {
    const suggestions: LinkSuggestion[] = [];
    const seenPairs = new Set<string>();

    const highAuthorityPages = hubs.filter(h => h.authorityScore > 30 || h.inDegree > 10);

    for (const orphan of orphanPages.slice(0, 20)) {
      for (const hub of highAuthorityPages) {
        if (this.isSelfLink(hub.url, orphan.url)) continue;
        if (this.isUtilityPage(hub.url)) continue;

        const pairKey = `${hub.url}|${orphan.url}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const anchorTheme = this.inferAnchorTheme(orphan.url, orphan.title);
        const confidence = this.calculateLinkConfidence(hub, orphan);

        suggestions.push({
          sourceUrl: hub.url,
          sourceTitle: this.pages[hub.url]?.title,
          targetUrl: orphan.url,
          targetTitle: orphan.title,
          anchorTheme,
          confidence,
          reason: `${hub.authorityScore > 50 ? 'High authority' : 'Good authority'} page (${hub.inDegree} in-links) linking to orphan page`,
        });
      }
    }

    for (const priority of priorityPages.slice(0, 15)) {
      const priorityInLinks = priority.inDegree || 0;

      if (priorityInLinks < 3) {
        const relatedPages = this.findRelatedPages(priority);

        for (const related of relatedPages.slice(0, 5)) {
          const pairKey = `${related.url}|${priority.url}`;
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          const anchorTheme = this.inferAnchorTheme(priority.url, priority.title);
          const confidence = this.calculateLinkConfidence(
            { url: related.url, outDegree: 0, inDegree: related.inDegree || 0, authorityScore: 0 },
            priority
          ) * 0.8;

          suggestions.push({
            sourceUrl: related.url,
            sourceTitle: related.title,
            targetUrl: priority.url,
            targetTitle: priority.title,
            anchorTheme,
            confidence,
            reason: 'Related page (topic overlap) linking to priority page',
          });
        }
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, 50);
  }

  private findRelatedPages(target: PlannedTarget): PlannedTarget[] {
    const targetTitle = target.title?.toLowerCase() || '';
    const targetKeywords = new Set(targetTitle.split(/\s+/).filter(w => w.length > 3));
    const targetUrl = target.url.toLowerCase();

    const related: PlannedTarget[] = [];

    for (const [url, page] of Object.entries(this.pages)) {
      if (url === target.url) continue;
      if (this.isSelfLink(url, target.url)) continue;
      if (this.isUtilityPage(url)) continue;

      let score = 0;

      const pageTitle = page.title?.toLowerCase() || '';
      const pageKeywords = new Set(pageTitle.split(/\s+/).filter(w => w.length > 3));

      for (const keyword of targetKeywords) {
        if (pageKeywords.has(keyword)) score++;
        if (pageTitle.includes(keyword)) score += 0.5;
      }

      const urlOverlap = this.calculateUrlOverlap(targetUrl, url.toLowerCase());
      score += urlOverlap * 2;

      if (score > 1) {
        related.push({
          url,
          title: page.title,
          depth: page.depth || 0,
          inDegree: page.inDegree || 0,
          isOrphan: page.isOrphan || false,
          reason: `Topic relevance score: ${score.toFixed(1)}`,
        });
      }
    }

    return related.sort((a, b) => b.inDegree - a.inDegree);
  }

  private calculateUrlOverlap(url1: string, url2: string): number {
    const seg1 = url1.split('/').filter(Boolean);
    const seg2 = url2.split('/').filter(Boolean);

    if (seg1.length === 0 || seg2.length === 0) return 0;

    const set1 = new Set(seg1);
    const set2 = new Set(seg2);
    let intersection = 0;

    for (const seg of set1) {
      if (set2.has(seg) && seg.length > 2) {
        intersection++;
      }
    }

    const union = new Set([...set1, ...set2]).size;
    return union > 0 ? intersection / union : 0;
  }

  private isCommercialUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return COMMERCIAL_PATTERNS.some(p => lowerUrl.includes(p));
  }

  private isUtilityPage(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return UTILITY_PATTERNS.some(p => lowerUrl.endsWith(p) || lowerUrl.includes(p + '/'));
  }

  private isSelfLink(source: string, target: string): boolean {
    try {
      const sourceHost = new URL(source).hostname;
      const targetHost = new URL(target).hostname;
      return sourceHost === targetHost && source === target;
    } catch {
      return source === target;
    }
  }

  private inferAnchorTheme(url: string, title?: string): string {
    if (title && title.length > 0) {
      const cleanTitle = title.replace(/[^\w\s-]/g, '').trim();
      const words = cleanTitle.split(/\s+/).slice(0, 4);
      return words.join(' ');
    }

    const urlPath = url.split('/').filter(Boolean);
    const lastSegment = urlPath[urlPath.length - 1] || '';

    const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
    const formatted = withoutExt.replace(/[-_]/g, ' ');

    return formatted.length > 0 ? formatted : 'Learn more';
  }

  private calculatePriorityScore(page: PlannedTarget): number {
    let score = 0;

    score += Math.max(0, 10 - page.depth);

    if (this.isCommercialUrl(page.url)) {
      score += 10;
    }

    if (page.title && page.title.length > 10) {
      score += 5;
    }

    const actualPage = this.pages[page.url];
    if (actualPage?.structuredData && actualPage.structuredData.length > 0) {
      score += 3;
    }

    return score;
  }

  private calculateLinkConfidence(source: HubSummary, target: PlannedTarget): number {
    let confidence = 50;

    if (source.authorityScore > 70) {
      confidence += 20;
    } else if (source.authorityScore > 40) {
      confidence += 10;
    }

    if (source.inDegree > 50) {
      confidence += 15;
    } else if (source.inDegree > 20) {
      confidence += 10;
    }

    const sourceUtil = this.isUtilityPage(source.url);
    if (!sourceUtil) {
      confidence += 10;
    }

    if (target.isOrphan) {
      confidence += 15;
    }

    return Math.min(100, confidence);
  }
}
