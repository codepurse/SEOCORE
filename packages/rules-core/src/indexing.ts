import type { Finding, NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

export class CanonicalIssuesRule implements Rule {
  definition: RuleDefinition = {
    id: 'canonical-issues',
    name: 'Canonical URL Issues',
    description: 'Checks if the page has a valid canonical tag matching the URL or a configured pattern.',
    category: 'indexing',
    module: 'core',
    defaultSeverity: 'error',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/canonical-issues',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!page.canonical) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'missing'),
          ruleId: this.definition.id,
          subCheck: 'missing',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is missing a canonical link element.',
          recommendation: 'Add a <link rel="canonical" href="..."> element to prevent duplicate content indexing issues.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    let pageUrlClean = page.url.replace(/\/$/, '').toLowerCase();
    let canonicalUrlClean = page.canonical.replace(/\/$/, '').toLowerCase();

    if (pageUrlClean !== canonicalUrlClean) {
      const targetPage = context.allPages[page.canonical];
      const targetNoindex = targetPage?.robotsMeta?.includes('noindex');

      if (targetNoindex) {
        return [
          {
            id: createFindingId(this.definition.id, page.url, 'canonical-to-noindex'),
            ruleId: this.definition.id,
            subCheck: 'canonical-to-noindex',
            severity: 'critical',
            category: this.definition.category,
            url: page.url,
            message: `Canonical URL points to a page marked as noindex: ${page.canonical}`,
            recommendation: 'Ensure canonical targets are indexable (never point canonical tags to noindex pages).',
            evidence: `Canonical: ${page.canonical}`,
            documentationLink: this.definition.documentationLink,
          },
        ];
      }

      return [
        {
          id: createFindingId(this.definition.id, page.url, 'mismatch'),
          ruleId: this.definition.id,
          subCheck: 'mismatch',
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Canonical URL is non-self-referential. Page points to canonical: ${page.canonical}`,
          recommendation: 'Ensure this is intentional (e.g. cross-domain content syndication or landing page deduplication). Otherwise, canonical should match page URL.',
          evidence: `URL: ${page.url} vs Canonical: ${page.canonical}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

export class NoIndexRule implements Rule {
  definition: RuleDefinition = {
    id: 'noindex-detection',
    name: 'NoIndex Directives',
    description: 'Detects if the page has a noindex directive that blocks search engines.',
    category: 'indexing',
    module: 'core',
    defaultSeverity: 'info',
    defaultWeight: 2,
    documentationLink: 'https://seocore.dev/docs/rules/noindex-detection',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (page.robotsMeta && page.robotsMeta.toLowerCase().includes('noindex')) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'noindex',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is marked with a "noindex" robots meta directive.',
          recommendation: 'Remove the "noindex" directive from the robots meta tag if you want search engines to crawl and index this page.',
          evidence: `Robots: "${page.robotsMeta}"`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

export class MissingStructuredDataRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-structured-data',
    name: 'Missing Structured Data',
    description: 'Checks if page has schema markup (JSON-LD JSON blocks) for rich snippet eligibility.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 3,
    documentationLink: 'https://seocore.dev/docs/rules/missing-structured-data',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const hasSyntaxError = page.structuredData.some(sd => sd.__error !== undefined);
    if (hasSyntaxError) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'syntax-error'),
          ruleId: this.definition.id,
          subCheck: 'syntax-error',
          severity: 'error',
          category: this.definition.category,
          url: page.url,
          message: 'Structured Data contains invalid syntax and failed to parse.',
          recommendation: 'Fix JSON-LD formatting errors. Ensure braces are closed and keys/values are quoted correctly.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    if (!page.structuredData || page.structuredData.length === 0) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'missing',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is missing Schema.org structured data (JSON-LD).',
          recommendation: 'Implement structured data (e.g. Article, Product, Organization, BreadcrumbList) in JSON-LD format to qualify for rich search results.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

export class MissingRobotsTxtRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-robots-txt',
    name: 'Missing Robots.txt File',
    description: 'Checks if the robots.txt file exists on the host.',
    category: 'indexing',
    module: 'core',
    defaultSeverity: 'error',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/missing-robots-txt',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const urlObj = new URL(page.url);
    if (urlObj.pathname !== '/' && urlObj.pathname !== '') {
      return [];
    }

    if (page.robotsTxtFound === false) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'missing-robots-txt',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Site robots.txt file was not found or unreachable.',
          recommendation: 'Create a robots.txt file at the root of your host (e.g., https://yourdomain.com/robots.txt) to direct search engine crawl behavior.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

export class MissingSitemapXmlRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-sitemap-xml',
    name: 'Missing Sitemap.xml',
    description: 'Checks if the sitemap.xml file exists and is referenceable.',
    category: 'indexing',
    module: 'core',
    defaultSeverity: 'error',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/missing-sitemap-xml',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const urlObj = new URL(page.url);
    if (urlObj.pathname !== '/' && urlObj.pathname !== '') {
      return [];
    }

    if (page.sitemapXmlFound === false) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'missing-sitemap-xml',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Site sitemap.xml file was not found or unreachable.',
          recommendation: 'Generate an XML sitemap and place it at the root of your host. Reference its URL in robots.txt so crawlers can discover your pages.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

export class OrphanPageRule implements Rule {
  definition: RuleDefinition = {
    id: 'orphan-page',
    name: 'Orphan Page Detected',
    description: 'Checks if page has 0 internal incoming links (not reachable via site crawl).',
    category: 'indexing',
    module: 'core',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/orphan-page',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (page.isOrphan) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'orphan',
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is an orphan (zero internal crawl links point here).',
          recommendation: 'Link to this page from relevant context pages or menus to let crawlers and users find it.',
          evidence: 'In-degree: 0',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}
