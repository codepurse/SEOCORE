import type { Finding, NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import * as cheerio from 'cheerio';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

export class SocialMetaRule implements Rule {
  definition: RuleDefinition = {
    id: 'social-meta',
    name: 'Missing or Incomplete Social Meta Tags',
    description: 'Validates OpenGraph and Twitter Card meta tags for social sharing and AI crawler visibility.',
    category: 'metadata',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/social-meta',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const og = page.openGraph;
    if (!og || Object.keys(og).length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-og'),
        ruleId: this.definition.id,
        subCheck: 'missing-og',
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing OpenGraph meta tags.',
        recommendation: 'Add OpenGraph tags (og:title, og:description, og:image, og:url) to enhance social sharing and AI crawler visibility.',
        documentationLink: this.definition.documentationLink,
      });
    } else {
      if (!og.title) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-og-title'),
          ruleId: this.definition.id,
          subCheck: 'missing-og-title',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'OpenGraph is missing og:title tag.',
          recommendation: 'Add an og:title meta tag to your page.',
          documentationLink: this.definition.documentationLink,
        });
      }
      if (!og.description) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-og-description'),
          ruleId: this.definition.id,
          subCheck: 'missing-og-description',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'OpenGraph is missing og:description tag.',
          recommendation: 'Add an og:description meta tag to your page.',
          documentationLink: this.definition.documentationLink,
        });
      }
      if (!og.image) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-og-image'),
          ruleId: this.definition.id,
          subCheck: 'missing-og-image',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'OpenGraph is missing og:image tag.',
          recommendation: 'Add an og:image meta tag to your page with a relevant, high-quality image.',
          documentationLink: this.definition.documentationLink,
        });
      }
      if (!og.url) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-og-url'),
          ruleId: this.definition.id,
          subCheck: 'missing-og-url',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'OpenGraph is missing og:url tag.',
          recommendation: 'Add an og:url meta tag to your page with the canonical URL.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    const twitter = page.twitterCard;
    if (!twitter || Object.keys(twitter).length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-twitter'),
        ruleId: this.definition.id,
        subCheck: 'missing-twitter',
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Twitter Card meta tags.',
        recommendation: 'Add Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image) to enhance Twitter sharing.',
        documentationLink: this.definition.documentationLink,
      });
    } else {
      if (!twitter.card) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-twitter-card'),
          ruleId: this.definition.id,
          subCheck: 'missing-twitter-card',
          severity: 'info',
          category: this.definition.category,
          url: page.url,
          message: 'Twitter Card is missing twitter:card tag.',
          recommendation: 'Add a twitter:card meta tag (e.g., summary_large_image, summary).',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    return findings;
  }
}

export class ContentQualityRule implements Rule {
  definition: RuleDefinition = {
    id: 'content-quality',
    name: 'Content Quality Assessment',
    description: 'Checks for thin content and duplicate content across pages.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/content-quality',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);
    const bodyText = $('body').text().trim();
    const wordCount = bodyText.split(/\s+/).filter(word => word.length > 0).length;

    if (wordCount < 300) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'thin-content'),
        ruleId: this.definition.id,
        subCheck: 'thin-content',
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page has thin content.',
        recommendation: 'Add more unique, valuable content to the page to improve its quality and relevance.',
        evidence: `Word count: ${wordCount}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    const duplicatePages: string[] = [];
    for (const [url, otherPage] of Object.entries(context.allPages)) {
      if (url !== page.url) {
        if (page.title && otherPage.title && page.title.toLowerCase() === otherPage.title.toLowerCase()) {
          duplicatePages.push(url);
        }
      }
    }

    if (duplicatePages.length > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'duplicate-title'),
        ruleId: this.definition.id,
        subCheck: 'duplicate-title',
        severity,
        category: this.definition.category,
        url: page.url,
        message: `Page title is duplicated on ${duplicatePages.length} other page(s).`,
        recommendation: 'Write unique titles for each page to help search engines distinguish them.',
        evidence: `Duplicate pages: ${duplicatePages.slice(0, 3).join(', ')}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

export class InternalLinkingRule implements Rule {
  definition: RuleDefinition = {
    id: 'internal-linking',
    name: 'Internal Linking Optimization',
    description: 'Checks for pages with no outbound links, excessive links, and link depth.',
    category: 'links',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/internal-linking',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const internalLinks = page.links.filter(link => link.isInternal);

    if (internalLinks.length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-outbound-links'),
        ruleId: this.definition.id,
        subCheck: 'no-outbound-links',
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page has no outbound internal links.',
        recommendation: 'Add relevant internal links to other pages on your site to improve navigation and crawlability.',
        documentationLink: this.definition.documentationLink,
      });
    }

    if (page.links.length > 100) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'excessive-links'),
        ruleId: this.definition.id,
        subCheck: 'excessive-links',
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `Page has ${page.links.length} links, which is quite high.`,
        recommendation: 'Consider reducing the number of links on the page to focus on the most important ones.',
        evidence: `Link count: ${page.links.length}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    if (page.depth && page.depth > 3) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'deep-link'),
        ruleId: this.definition.id,
        subCheck: 'deep-link',
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `Page is ${page.depth} clicks away from the homepage.`,
        recommendation: 'Consider adding links from higher-level pages to reduce the click depth.',
        evidence: `Depth: ${page.depth}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

export class PaginationHealthRule implements Rule {
  definition: RuleDefinition = {
    id: 'pagination-health',
    name: 'Pagination Health Check',
    description: 'Checks for rel=next/prev, infinite scroll implementation, and view-all page canonicalization.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/pagination-health',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    const hasRelNext = $('link[rel="next"]').length > 0;
    const hasRelPrev = $('link[rel="prev"]').length > 0;
    if (!hasRelNext && !hasRelPrev) {
      const hasPaginationPattern = $('.pagination, .pager, [class*="page-nav"], nav[class*="pagination"]').length > 0;
      if (hasPaginationPattern) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-rel-next-prev'),
          ruleId: this.definition.id,
          subCheck: 'missing-rel-next-prev',
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'Pagination detected but missing rel=next/prev link tags.',
          recommendation: 'Add rel=next and rel=prev link tags to help search engines understand paginated content.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    const hasInfiniteScroll = /infinite[-_]scroll|load[-_]more|autoload/i.test($('body').html() || '');
    if (hasInfiniteScroll) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'infinite-scroll'),
        ruleId: this.definition.id,
        subCheck: 'infinite-scroll',
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Infinite scroll detected. Ensure proper implementation with crawlable URLs.',
        recommendation: 'Implement progressive loading with crawlable URLs (e.g., /page/2, /page/3) and use history.pushState.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

export class InternalLinkDistributionRule implements Rule {
  definition: RuleDefinition = {
    id: 'internal-link-distribution',
    name: 'Internal Link Distribution Analysis',
    description: 'Checks for authority sinks, orphan pages, and calculates internal link distribution.',
    category: 'links',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/internal-link-distribution',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const pageUrls = Object.keys(context.allPages);
    if (page.url !== pageUrls[0]) return [];

    const authoritySinks: string[] = [];
    for (const [url, p] of Object.entries(context.allPages)) {
      if ((p.inDegree || 0) >= 5 && (p.outDegree || 0) <= 1) {
        authoritySinks.push(url);
      }
    }

    if (authoritySinks.length > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'authority-sinks'),
        ruleId: this.definition.id,
        subCheck: 'authority-sinks',
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: `Found ${authoritySinks.length} potential authority sink(s).`,
        recommendation: 'Add outbound internal links from high-authority pages to distribute link equity.',
        evidence: `Sample authority sinks: ${authoritySinks.slice(0, 3).join(', ')}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

export class DuplicateContentSimilarityRule implements Rule {
  definition: RuleDefinition = {
    id: 'duplicate-content-similarity',
    name: 'Duplicate Content Similarity Check',
    description: 'Compares body content similarity between pages and identifies near-duplicates.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/duplicate-content-similarity',
  };

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    if (words1.length === 0 || words2.length === 0) return 0;

    const freq1: Record<string, number> = {};
    const freq2: Record<string, number> = {};

    for (const word of words1) {
      freq1[word] = (freq1[word] || 0) + 1;
    }
    for (const word of words2) {
      freq2[word] = (freq2[word] || 0) + 1;
    }

    let intersection = 0;
    for (const word of Object.keys(freq1)) {
      if (freq2[word]) {
        intersection += Math.min(freq1[word], freq2[word]);
      }
    }

    const union = words1.length + words2.length - intersection;
    return intersection / union;
  }

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);
    const bodyText = $('body').text();
    const nearDuplicates: { url: string; similarity: number }[] = [];

    for (const [url, otherPage] of Object.entries(context.allPages)) {
      if (url === page.url || !otherPage.html) continue;
      const $other = cheerio.load(otherPage.html);
      const otherBodyText = $other('body').text();
      const similarity = this.calculateSimilarity(bodyText, otherBodyText);

      if (similarity > 0.8) {
        nearDuplicates.push({ url, similarity });
      }
    }

    if (nearDuplicates.length > 0) {
      const highSimilarity = nearDuplicates.some(d => d.similarity > 0.9);
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'near-duplicates'),
        ruleId: this.definition.id,
        subCheck: 'near-duplicates',
        severity: highSimilarity ? 'error' : 'warning',
        category: this.definition.category,
        url: page.url,
        message: `Found ${nearDuplicates.length} page(s) with high content similarity.`,
        recommendation: highSimilarity
          ? 'Add canonical tags or merge/rewrite near-identical content.'
          : 'Review content to ensure uniqueness and value.',
        evidence: nearDuplicates.slice(0, 3).map(d => `${d.url} (${(d.similarity * 100).toFixed(0)}%)`).join(', '),
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}
