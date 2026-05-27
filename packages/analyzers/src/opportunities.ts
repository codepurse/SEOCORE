import { NormalizedPage, Finding } from '@seocore/sdk';

export type OpportunityType = 'metadata' | 'performance' | 'indexing' | 'internal-links' | 'schema' | 'content';
export type OpportunityPriority = 'high' | 'medium' | 'low';

export interface SearchOpportunity {
  id: string;
  url: string;
  title?: string;
  type: OpportunityType;
  priority: OpportunityPriority;
  reason: string;
  supportingMetrics: Record<string, number | string>;
  recommendedActions: string[];
}

export interface GscMetrics {
  impressions?: number;
  clicks?: number;
  ctr?: number;
  position?: number;
}

export interface CruxMetrics {
  lcp?: number;
  cls?: number;
  inp?: number;
}

export interface PageSearchData {
  url: string;
  title?: string;
  gsc?: GscMetrics;
  crux?: CruxMetrics;
}

export interface OpportunitiesResult {
  url: string;
  generatedAt: string;
  opportunities: SearchOpportunity[];
  enrichedPages: number;
  dataSource: 'gsc' | 'crux' | 'heuristics' | 'none';
}

export class OpportunitiesAnalyzer {
  private pages: Record<string, NormalizedPage> = {};
  private findings: Finding[] = [];
  private gscData: Map<string, GscMetrics> = new Map();
  private cruxData: Map<string, CruxMetrics> = new Map();

  setGscData(data: PageSearchData[]): void {
    for (const item of data) {
      if (item.gsc) {
        this.gscData.set(item.url, item.gsc);
      }
    }
  }

  setCruxData(data: PageSearchData[]): void {
    for (const item of data) {
      if (item.crux) {
        this.cruxData.set(item.url, item.crux);
      }
    }
  }

  analyze(pages: Record<string, NormalizedPage>, findings: Finding[], url?: string): OpportunitiesResult {
    this.pages = pages;
    this.findings = findings;

    const opportunities: SearchOpportunity[] = [];

    opportunities.push(...this.findMetadataOpportunities());
    opportunities.push(...this.findPerformanceOpportunities());
    opportunities.push(...this.findIndexingOpportunities());
    opportunities.push(...this.findInternalLinkOpportunities());
    opportunities.push(...this.findSchemaOpportunities());
    opportunities.push(...this.findContentOpportunities());

    opportunities.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const enrichedPages = this.gscData.size + this.cruxData.size;
    const dataSource = this.gscData.size > 0 ? 'gsc' : this.cruxData.size > 0 ? 'crux' : 'heuristics';

    return {
      url: url || Object.keys(pages)[0] || 'unknown',
      generatedAt: new Date().toISOString(),
      opportunities,
      enrichedPages,
      dataSource,
    };
  }

  private findMetadataOpportunities(): SearchOpportunity[] {
    const opportunities: SearchOpportunity[] = [];

    const metadataFindings = this.findings.filter(f =>
      f.category === 'metadata' &&
      (f.severity === 'error' || f.severity === 'critical')
    );

    const pagesByIssue = new Map<string, Finding[]>();
    for (const f of metadataFindings) {
      if (!pagesByIssue.has(f.url)) {
        pagesByIssue.set(f.url, []);
      }
      pagesByIssue.get(f.url)!.push(f);
    }

    for (const [pageUrl, pageFindings] of pagesByIssue) {
      const page = this.pages[pageUrl];
      const gsc = this.gscData.get(pageUrl);
      const hasHighImpressions = gsc && gsc.impressions && gsc.impressions > 1000;

      const issueTypes = new Set(pageFindings.map(f => f.ruleId));
      const isHighPriority = hasHighImpressions || issueTypes.size >= 2;

      const metrics: Record<string, number | string> = {};
      if (gsc) {
        metrics.impressions = gsc.impressions || 0;
        metrics.position = gsc.position || 'N/A';
      }

      opportunities.push({
        id: `metadata-${this.sanitizeId(pageUrl)}`,
        url: pageUrl,
        title: page?.title,
        type: 'metadata',
        priority: isHighPriority ? 'high' : pageFindings.length > 2 ? 'medium' : 'low',
        reason: hasHighImpressions
          ? `Page has ${gsc!.impressions} impressions but has metadata issues affecting CTR`
          : `Page has ${pageFindings.length} metadata issue(s) that may hurt search visibility`,
        supportingMetrics: metrics,
        recommendedActions: this.generateMetadataActions(pageFindings),
      });
    }

    return opportunities;
  }

  private findPerformanceOpportunities(): SearchOpportunity[] {
    const opportunities: SearchOpportunity[] = [];

    const performanceFindings = this.findings.filter(f =>
      f.category === 'performance' &&
      (f.severity === 'error' || f.severity === 'critical')
    );

    for (const finding of performanceFindings) {
      const crux = this.cruxData.get(finding.url);
      const gsc = this.gscData.get(finding.url);
      const isHighVisibility = gsc && gsc.impressions && gsc.impressions > 500;

      const metrics: Record<string, number | string> = {};
      if (crux) {
        metrics.lcp = crux.lcp || 'N/A';
        metrics.cls = crux.cls || 'N/A';
      }
      if (gsc) {
        metrics.position = gsc.position || 'N/A';
      }

      opportunities.push({
        id: `perf-${this.sanitizeId(finding.url)}-${finding.ruleId}`,
        url: finding.url,
        title: this.pages[finding.url]?.title,
        type: 'performance',
        priority: isHighVisibility ? 'high' : 'medium',
        reason: `Performance issue on high-visibility page: ${finding.message}`,
        supportingMetrics: metrics,
        recommendedActions: [finding.recommendation],
      });
    }

    return opportunities;
  }

  private findIndexingOpportunities(): SearchOpportunity[] {
    const opportunities: SearchOpportunity[] = [];

    const indexingFindings = this.findings.filter(f =>
      f.category === 'indexing' &&
      (f.severity === 'error' || f.severity === 'critical')
    );

    const pagesByIssue = new Map<string, Finding[]>();
    for (const f of indexingFindings) {
      if (!pagesByIssue.has(f.url)) {
        pagesByIssue.set(f.url, []);
      }
      pagesByIssue.get(f.url)!.push(f);
    }

    for (const [pageUrl, pageFindings] of pagesByIssue) {
      const page = this.pages[pageUrl];
      const gsc = this.gscData.get(pageUrl);
      const hasRankings = gsc && gsc.position && gsc.position < 20;

      const metrics: Record<string, number | string> = {};
      if (gsc) {
        metrics.position = gsc.position || 'N/A';
        metrics.clicks = gsc.clicks || 0;
      }

      opportunities.push({
        id: `indexing-${this.sanitizeId(pageUrl)}`,
        url: pageUrl,
        title: page?.title,
        type: 'indexing',
        priority: hasRankings ? 'high' : 'medium',
        reason: hasRankings
          ? `Page ranks on page 1 (position ${gsc!.position}) but has indexing issues`
          : `Page has indexing issues that may prevent proper crawling/indexing`,
        supportingMetrics: metrics,
        recommendedActions: this.generateIndexingActions(pageFindings),
      });
    }

    return opportunities;
  }

  private findInternalLinkOpportunities(): SearchOpportunity[] {
    const opportunities: SearchOpportunity[] = [];

    const orphanPages = Object.entries(this.pages)
      .filter(([, page]) => page.isOrphan || (page.inDegree || 0) === 0)
      .map(([url, page]) => ({ url, page }));

    for (const { url, page } of orphanPages) {
      const gsc = this.gscData.get(url);
      const isHighValue = gsc && (gsc.impressions || 0) > 100;

      const metrics: Record<string, number | string> = {};
      if (gsc) {
        metrics.impressions = gsc.impressions || 0;
        metrics.position = gsc.position || 'N/A';
      }

      opportunities.push({
        id: `links-${this.sanitizeId(url)}`,
        url,
        title: page.title,
        type: 'internal-links',
        priority: isHighValue ? 'high' : page.depth === 0 ? 'medium' : 'low',
        reason: isHighValue
          ? `Orphan page has search visibility but no internal links pointing to it`
          : `Orphan page with no internal links may not be discovered by crawlers`,
        supportingMetrics: metrics,
        recommendedActions: [
          'Add links from related high-authority pages',
          'Include in sitemap.xml with adequate priority',
          'Consider adding to navigation if commercially important',
        ],
      });
    }

    return opportunities;
  }

  private findSchemaOpportunities(): SearchOpportunity[] {
    const opportunities: SearchOpportunity[] = [];

    const importantPages = Object.entries(this.pages).filter(([, page]) => {
      if (!page.structuredData || page.structuredData.length === 0) {
        const isProductPage = page.url.includes('/product') || page.url.includes('/service');
        const hasKeywords = page.title && page.title.length > 10;
        return isProductPage || (hasKeywords && page.depth !== undefined && page.depth <= 2);
      }
      return false;
    });

    for (const [url, page] of importantPages) {
      const gsc = this.gscData.get(url);
      const isHighValue = gsc && (gsc.position || 99) < 30;

      const metrics: Record<string, number | string> = {};
      if (gsc) {
        metrics.impressions = gsc.impressions || 0;
        metrics.position = gsc.position || 'N/A';
      }

      opportunities.push({
        id: `schema-${this.sanitizeId(url)}`,
        url,
        title: page.title,
        type: 'schema',
        priority: isHighValue ? 'high' : 'medium',
        reason: 'Important page missing structured data that could improve rich results',
        supportingMetrics: metrics,
        recommendedActions: [
          'Add relevant Schema.org markup (Product, Article, FAQPage, etc.)',
          'Ensure @type matches page content accurately',
          'Include all recommended properties for the entity type',
        ],
      });
    }

    return opportunities;
  }

  private findContentOpportunities(): SearchOpportunity[] {
    const opportunities: SearchOpportunity[] = [];

    const thinContentFindings = this.findings.filter(f =>
      f.ruleId.includes('thin') ||
      f.ruleId.includes('content') ||
      f.message.toLowerCase().includes('content')
    );

    for (const finding of thinContentFindings) {
      const gsc = this.gscData.get(finding.url);
      const isRanking = gsc && gsc.position && gsc.position < 15;
      const hasLowCtr = gsc && gsc.ctr && gsc.ctr < 0.02;

      const metrics: Record<string, number | string> = {};
      if (gsc) {
        metrics.impressions = gsc.impressions || 0;
        metrics.ctr = gsc.ctr || 'N/A';
        metrics.position = gsc.position || 'N/A';
      }

      opportunities.push({
        id: `content-${this.sanitizeId(finding.url)}`,
        url: finding.url,
        title: this.pages[finding.url]?.title,
        type: 'content',
        priority: (isRanking || hasLowCtr) ? 'high' : 'medium',
        reason: hasLowCtr
          ? `Page ranks well (position ${gsc!.position}) but has low CTR - content may not match search intent`
          : `Page has content quality issues that may limit search visibility`,
        supportingMetrics: metrics,
        recommendedActions: [
          'Review content depth and comprehensiveness',
          'Ensure content matches target keyword intent',
          'Add supporting media (images, videos, tables)',
        ],
      });
    }

    return opportunities;
  }

  private generateMetadataActions(findings: Finding[]): string[] {
    const actions: string[] = [];
    const issueTypes = new Set(findings.map(f => f.ruleId));

    if (issueTypes.has('missing-title') || issueTypes.has('empty-title')) {
      actions.push('Add unique, descriptive title tag (50-60 characters)');
    }
    if (issueTypes.has('missing-meta-description') || issueTypes.has('empty-meta-description')) {
      actions.push('Add compelling meta description (120-160 characters)');
    }
    if (issueTypes.has('title-length')) {
      actions.push('Adjust title length to 50-60 characters for full display');
    }
    if (issueTypes.has('meta-description-length')) {
      actions.push('Adjust meta description to 120-160 characters');
    }

    if (actions.length === 0) {
      actions.push('Review and fix metadata issues per findings');
    }

    return actions;
  }

  private generateIndexingActions(findings: Finding[]): string[] {
    const actions: string[] = [];
    const issueTypes = new Set(findings.map(f => f.ruleId));

    if (issueTypes.has('missing-canonical') || issueTypes.has('canonical-mismatch')) {
      actions.push('Add or fix canonical tag to point to preferred URL');
    }
    if (issueTypes.has('noindex')) {
      actions.push('Remove noindex directive if page should be indexed');
    }
    if (issueTypes.has('blocked-robots')) {
      actions.push('Check robots.txt and remove disallow if blocking needed pages');
    }

    if (actions.length === 0) {
      actions.push('Review indexing directives (canonical, robots meta, hreflang)');
    }

    return actions;
  }

  private sanitizeId(url: string): string {
    return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
  }
}
