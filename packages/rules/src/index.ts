import { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage, SeoConfig, ExecutionTierConfig, Category, Severity, DataSource } from '@seocore/sdk';
import * as cheerio from 'cheerio';

// Helper to create a deterministic Finding ID
export function createFindingId(ruleId: string, url: string, details?: string): string {
  let suffix = '';
  if (details) {
    // Generate a simple hash suffix of details to ensure unique IDs for multiple findings of same rule on same page
    let hash = 0;
    for (let i = 0; i < details.length; i++) {
      hash = (hash << 5) - hash + details.charCodeAt(i);
      hash |= 0;
    }
    suffix = `:${Math.abs(hash).toString(36)}`;
  }
  const urlSafe = Buffer.from(url).toString('base64url').substring(0, 16);
  return `${ruleId}:${urlSafe}${suffix}`;
}

// Helper to resolve rule settings based on configuration overrides
export function getRuleSettings(def: RuleDefinition, config: SeoConfig) {
  const override = config.ruleOverrides?.[def.id];
  const enabled = override?.enabled !== false; // default to true
  const severity = override?.severity || def.defaultSeverity;
  const weight = override?.weight ?? def.defaultWeight;
  const findingSeverityOverrides = override?.findingSeverityOverrides || {};
  return { enabled, severity, weight, findingSeverityOverrides };
}

export function hasConfiguredBacklinkSources(config: SeoConfig): boolean {
  const backlinks = config.backlinks;
  if (!backlinks?.provider) return false;

  const hasBing = backlinks.bing?.enabled !== false && !!backlinks.bing?.apiKey;
  const hasGsc = backlinks.gsc?.enabled !== false && !!backlinks.gsc?.exportPath;
  const hasLogs = backlinks.logs?.enabled !== false && (backlinks.logs?.paths?.length ?? 0) > 0;

  return hasBing || hasGsc || hasLogs;
}

export function getPrimaryBacklinkPage(page: NormalizedPage, context: RuleEvaluationContext): boolean {
  const allPageUrls = Object.keys(context.allPages);
  return page.url === allPageUrls[0];
}

// ==========================================
// CORE RULES IMPLEMENTATION
// ==========================================

// 1. Missing Title
export class MissingTitleRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-title',
    name: 'Missing Page Title',
    description: 'Verifies the page has a non-empty <title> tag.',
    category: 'metadata',
    defaultSeverity: 'critical',
    defaultWeight: 10,
    documentationLink: 'https://seocore.dev/docs/rules/missing-title',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!page.title || page.title.trim() === '') {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is missing a title tag or the title is empty.',
          recommendation: 'Add a descriptive <title> tag inside the <head> element. Keep it between 50-60 characters.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    if (page.title.length > 60) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'too-long'),
          ruleId: this.definition.id,
          severity: 'warning', // specific subset warning
          category: this.definition.category,
          url: page.url,
          message: `Title is too long (${page.title.length} characters). It will likely be truncated in search results.`,
          recommendation: 'Shorten the title to be 60 characters or less.',
          evidence: `Current title: "${page.title}"`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 2. Duplicate Title
export class DuplicateTitleRule implements Rule {
  definition: RuleDefinition = {
    id: 'duplicate-title',
    name: 'Duplicate Page Title',
    description: 'Verifies page titles are unique across the crawled website.',
    category: 'metadata',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/duplicate-title',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.title) return [];

    const duplicates: string[] = [];
    for (const [url, otherPage] of Object.entries(context.allPages)) {
      if (url !== page.url && otherPage.title && otherPage.title.trim().toLowerCase() === page.title.trim().toLowerCase()) {
        duplicates.push(url);
      }
    }

    if (duplicates.length > 0) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Page title "${page.title}" is duplicated on other pages.`,
          recommendation: 'Write a unique, distinct title for every page to help search engines understand its distinct purpose.',
          evidence: `Duplicated on: ${duplicates.join(', ')}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 3. Missing Meta Description
export class MissingMetaDescriptionRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-meta-description',
    name: 'Missing Meta Description',
    description: 'Verifies the page has a meta description for SERP snippets.',
    category: 'metadata',
    defaultSeverity: 'error',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/missing-meta-description',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!page.metaDescription || page.metaDescription.trim() === '') {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is missing a meta description tag.',
          recommendation: 'Add a meta description tag <meta name="description" content="..."> to summarize page content in 150-160 characters.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    if (page.metaDescription.length > 160) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'too-long'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Meta description is too long (${page.metaDescription.length} characters). It will likely be truncated in search results.`,
          recommendation: 'Keep the meta description under 160 characters.',
          evidence: `Current description: "${page.metaDescription}"`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 4. Missing H1
export class MissingH1Rule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-h1',
    name: 'Missing H1 Heading',
    description: 'Verifies the page has at least one H1 element acting as main heading.',
    category: 'seo',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/missing-h1',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!page.headings.h1 || page.headings.h1.length === 0) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page has no H1 heading elements.',
          recommendation: 'Add exactly one H1 tag near the top of the page content as the primary heading.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 5. Multiple H1
export class MultipleH1Rule implements Rule {
  definition: RuleDefinition = {
    id: 'multiple-h1',
    name: 'Multiple H1 Headings',
    description: 'Checks for multiple H1 elements which can dilute semantic structure.',
    category: 'seo',
    defaultSeverity: 'warning',
    defaultWeight: 4,
    documentationLink: 'https://seocore.dev/docs/rules/multiple-h1',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (page.headings.h1 && page.headings.h1.length > 1) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Page contains multiple H1 headings (${page.headings.h1.length} found).`,
          recommendation: 'Restructure the document to use only one primary H1. Convert subsequent H1 tags to H2 or H3 tags.',
          evidence: `Headings found: ${page.headings.h1.map(h => `"${h}"`).join(', ')}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 6. Missing Image Alt Text
export class MissingAltTextRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-alt-text',
    name: 'Missing Image Alt Text',
    description: 'Verifies images have alt attributes for accessibility and image search.',
    category: 'accessibility',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/missing-alt-text',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.images) return [];

    const unaltImages = page.images.filter(img => img.alt === undefined || img.alt.trim() === '');
    if (unaltImages.length > 0) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `${unaltImages.length} images are missing alternative text (alt attributes).`,
          recommendation: 'Add alt attribute descriptive values to all important images. For purely decorative images, use empty alt="" so screen readers ignore them.',
          evidence: `Sample images missing alt: ${unaltImages.slice(0, 3).map(img => img.src).join(', ')}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 7. Broken Links
export class BrokenLinksRule implements Rule {
  definition: RuleDefinition = {
    id: 'broken-links',
    name: 'Broken Outbound Links',
    description: 'Detects links pointing to internal or external pages that returned broken HTTP status codes.',
    category: 'links',
    defaultSeverity: 'error',
    defaultWeight: 9,
    documentationLink: 'https://seocore.dev/docs/rules/broken-links',
  };

  private readonly externalCache = new Map<string, boolean>(); // url -> isBroken

  private async isExternalLinkBroken(url: string): Promise<boolean> {
    if (this.externalCache.has(url)) {
      return this.externalCache.get(url)!;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)',
        },
      });

      clearTimeout(timeoutId);

      if (res.status === 405 || res.status === 403) {
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), 2000);
        const getRes = await fetch(url, {
          method: 'GET',
          signal: getController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)',
          },
        });
        clearTimeout(getTimeoutId);
        const isBroken = getRes.status >= 400;
        this.externalCache.set(url, isBroken);
        return isBroken;
      }

      const isBroken = res.status >= 400;
      this.externalCache.set(url, isBroken);
      return isBroken;
    } catch {
      this.externalCache.set(url, true);
      return true;
    }
  }

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.links) return [];

    const brokenLinks: string[] = [];
    for (const link of page.links) {
      if (link.isInternal) {
        const targetPage = context.allPages[link.url];
        if (targetPage) {
          // If we crawled it and status is not 200-399, flag as broken
          if (targetPage.statusCode >= 400 || targetPage.statusCode === 0) {
            brokenLinks.push(`${link.url} (Status: ${targetPage.statusCode})`);
          }
        }
      } else {
        // Skip validation in "quick" presets
        if (context.config.preset !== 'quick') {
          const isBroken = await this.isExternalLinkBroken(link.url);
          if (isBroken) {
            brokenLinks.push(`${link.url} (External Broken)`);
          }
        }
      }
    }

    if (brokenLinks.length > 0) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Page contains ${brokenLinks.length} broken links pointing to unreachable pages.`,
          recommendation: 'Update or remove the href attributes pointing to broken pages to maintain link equity and clean UX.',
          evidence: `Broken targets: ${brokenLinks.join(', ')}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 8. Canonical Issues
export class CanonicalIssuesRule implements Rule {
  definition: RuleDefinition = {
    id: 'canonical-issues',
    name: 'Canonical URL Issues',
    description: 'Checks if the page has a valid canonical tag matching the URL or a configured pattern.',
    category: 'indexing',
    defaultSeverity: 'error',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/canonical-issues',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!page.canonical) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'missing'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page is missing a canonical link element.',
          recommendation: 'Add a <link rel="canonical" href="..."> element to prevent duplicate content indexing issues.',
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    // Check if canonical matches page URL (allowing minor protocol/trailing-slash variations)
    let pageUrlClean = page.url.replace(/\/$/, '').toLowerCase();
    let canonicalUrlClean = page.canonical.replace(/\/$/, '').toLowerCase();

    if (pageUrlClean !== canonicalUrlClean) {
      // Check if the canonical target is part of crawled page set and is marked noindex, which is a major conflict!
      const targetPage = context.allPages[page.canonical];
      const targetNoindex = targetPage?.robotsMeta?.includes('noindex');

      if (targetNoindex) {
        return [
          {
            id: createFindingId(this.definition.id, page.url, 'canonical-to-noindex'),
            ruleId: this.definition.id,
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

// 9. NoIndex Detection
export class NoIndexRule implements Rule {
  definition: RuleDefinition = {
    id: 'noindex-detection',
    name: 'NoIndex Directives',
    description: 'Detects if the page has a noindex directive that blocks search engines.',
    category: 'indexing',
    defaultSeverity: 'info', // typically info unless indexable state expected
    defaultWeight: 2,
    documentationLink: 'https://seocore.dev/docs/rules/noindex-detection',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (page.robotsMeta && (page.robotsMeta.toLowerCase().includes('noindex'))) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
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

// 10. Missing Structured Data
export class MissingStructuredDataRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-structured-data',
    name: 'Missing Structured Data',
    description: 'Checks if page has schema markup (JSON-LD JSON blocks) for rich snippet eligibility.',
    category: 'seo',
    defaultSeverity: 'warning',
    defaultWeight: 3,
    documentationLink: 'https://seocore.dev/docs/rules/missing-structured-data',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    // Verify if there are invalid json-ld objects
    const hasSyntaxError = page.structuredData.some(sd => sd.__error !== undefined);
    if (hasSyntaxError) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'syntax-error'),
          ruleId: this.definition.id,
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

// 11. Missing Robots.txt (Home Page Site-Wide Check)
export class MissingRobotsTxtRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-robots-txt',
    name: 'Missing Robots.txt File',
    description: 'Checks if the robots.txt file exists on the host.',
    category: 'indexing',
    defaultSeverity: 'error',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/missing-robots-txt',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    // Only run this on the main starting/home page URL to avoid duplicates
    const urlObj = new URL(page.url);
    if (urlObj.pathname !== '/' && urlObj.pathname !== '') {
      return [];
    }

    if (page.robotsTxtFound === false) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
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

// 12. Missing Sitemap.xml (Home Page Site-Wide Check)
export class MissingSitemapXmlRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-sitemap-xml',
    name: 'Missing Sitemap.xml',
    description: 'Checks if the sitemap.xml file exists and is referenceable.',
    category: 'indexing',
    defaultSeverity: 'error',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/missing-sitemap-xml',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    // Only run on the starting/home page
    const urlObj = new URL(page.url);
    if (urlObj.pathname !== '/' && urlObj.pathname !== '') {
      return [];
    }

    if (page.sitemapXmlFound === false) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
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

// 13. Low Performance Score Rule
export class LowPerformanceScoreRule implements Rule {
  definition: RuleDefinition = {
    id: 'low-performance-score',
    name: 'Low Performance Score',
    description: 'Checks if the simulated or real Lighthouse performance score is below 80.',
    category: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/low-performance-score',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled || page.performanceScore === undefined) return [];

    if (page.performanceScore < 50) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'critical'),
          ruleId: this.definition.id,
          severity: 'error',
          category: this.definition.category,
          url: page.url,
          message: `Page performance score is critically low (${page.performanceScore}/100).`,
          recommendation: 'Optimize resource sizes, reduce unused JavaScript, and optimize image formatting.',
          evidence: `Performance score: ${page.performanceScore}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    } else if (page.performanceScore < 80) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'warning'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Page performance score is low (${page.performanceScore}/100).`,
          recommendation: 'Look into caching, stylesheet minification, and modern web format image loading (WebP/AVIF).',
          evidence: `Performance score: ${page.performanceScore}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 14. Core Web Vitals LCP Rule
export class LcpMetricRule implements Rule {
  definition: RuleDefinition = {
    id: 'lcp-metric',
    name: 'Slow Largest Contentful Paint (LCP)',
    description: 'Verifies the Largest Contentful Paint is under 2.5 seconds.',
    category: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/lcp-metric',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.coreWebVitals) return [];

    const { lcp } = page.coreWebVitals;
    if (lcp > 4000) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'poor'),
          ruleId: this.definition.id,
          severity: 'error',
          category: this.definition.category,
          url: page.url,
          message: `Largest Contentful Paint is poor: ${(lcp / 1000).toFixed(2)}s (Threshold: < 2.5s).`,
          recommendation: 'Speed up server response time (TTFB), optimize image files, and eliminate render-blocking JS/CSS.',
          evidence: `LCP: ${lcp}ms`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    } else if (lcp > 2500) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'needs-improvement'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Largest Contentful Paint needs improvement: ${(lcp / 1000).toFixed(2)}s (Threshold: < 2.5s).`,
          recommendation: 'Optimize your critical rendering path and defer non-essential scripts.',
          evidence: `LCP: ${lcp}ms`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 15. Core Web Vitals CLS Rule
export class ClsMetricRule implements Rule {
  definition: RuleDefinition = {
    id: 'cls-metric',
    name: 'High Cumulative Layout Shift (CLS)',
    description: 'Verifies the Cumulative Layout Shift is under 0.1.',
    category: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/cls-metric',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.coreWebVitals) return [];

    const { cls } = page.coreWebVitals;
    if (cls > 0.25) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'poor'),
          ruleId: this.definition.id,
          severity: 'error',
          category: this.definition.category,
          url: page.url,
          message: `Cumulative Layout Shift is poor: ${cls} (Threshold: < 0.1).`,
          recommendation: 'Ensure all <img>, <video>, and <iframe;> elements have explicit width and height attributes set.',
          evidence: `CLS: ${cls}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    } else if (cls > 0.1) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'needs-improvement'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Cumulative Layout Shift needs improvement: ${cls} (Threshold: < 0.1).`,
          recommendation: 'Reserve static space for dynamic content like ads or sliders to avoid unexpected layout jumps.',
          evidence: `CLS: ${cls}`,
          documentationLink: this.definition.documentationLink,
        },
      ];
    }

    return [];
  }
}

// 16. Heavy Resource Size Rule
export class ResourceSizeRule implements Rule {
  definition: RuleDefinition = {
    id: 'heavy-resources',
    name: 'Heavy Page Resource Payload',
    description: 'Checks if page HTML size or total CSS/JS payload exceeds thresholds.',
    category: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 4,
    documentationLink: 'https://seocore.dev/docs/rules/heavy-resources',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.resources) return [];

    const { pageSizeBytes, jsSizeBytes, totalRequests } = page.resources;
    const findings: Finding[] = [];

    if (pageSizeBytes > 150000) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'html-size'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: `HTML page weight is heavy: ${(pageSizeBytes / 1024).toFixed(1)}KB.`,
        recommendation: 'Reduce DOM node count, eliminate inline scripts and CSS, and enable Gzip/Brotli compression.',
        evidence: `HTML size: ${pageSizeBytes} bytes`,
        documentationLink: this.definition.documentationLink,
      });
    }

    if (jsSizeBytes > 500000) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'js-size'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: `JavaScript weight is heavy: ${(jsSizeBytes / 1024).toFixed(1)}KB.`,
        recommendation: 'Audit third-party scripts, lazy-load non-critical bundles, and minify/compress production code.',
        evidence: `JS size: ${jsSizeBytes} bytes`,
        documentationLink: this.definition.documentationLink,
      });
    }

    if (totalRequests > 50) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'request-count'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `High subresource request count: ${totalRequests} files loaded.`,
        recommendation: 'Combine stylesheets/scripts, use sprite sheets, or lazy-load images to minimize roundtrips.',
        evidence: `Total requests: ${totalRequests}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 17. Orphan Page Rule
export class OrphanPageRule implements Rule {
  definition: RuleDefinition = {
    id: 'orphan-page',
    name: 'Orphan Page Detected',
    description: 'Checks if page has 0 internal incoming links (not reachable via site crawl).',
    category: 'indexing',
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

// ==========================================
// AI VISIBILITY RULES
// ==========================================

// 18. AI Extractability Rule
export class AiExtractabilityRule implements Rule {
  definition: RuleDefinition = {
    id: 'ai-extractability',
    name: 'AI Extractability & Semantic Markup',
    description: 'Evaluates DOM semantic structure and content-to-navigation ratio for AI crawlers.',
    category: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/ai-extractability',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    // Check for semantic container tags
    const semanticContainers = $('article, main, section');
    if (semanticContainers.length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-semantic-containers'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Lack of semantic content container elements reduces AI crawler extractability.',
        recommendation: 'Wrap primary page content in semantic HTML elements such as <main>, <article>, or <section> tags to help AI parsers locate main content.',
        evidence: 'No <main>, <article>, or <section> tags found.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check content-to-navigation ratio
    const bodyText = $('body').text() || '';
    const bodyTextLength = bodyText.trim().length;

    if (bodyTextLength > 0) {
      let noiseTextLength = 0;
      $('nav, header, footer, [class*="nav"], [class*="menu"], [class*="footer"], [class*="header"]').each((_, el) => {
        noiseTextLength += ($(el).text() || '').trim().length;
      });

      const noiseRatio = noiseTextLength / bodyTextLength;
      if (noiseRatio > 0.5) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'high-boilerplate-ratio'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `High boilerplate-to-content ratio detected (noise ratio: ${(noiseRatio * 100).toFixed(0)}%).`,
          recommendation: 'Reduce navigational noise, sidebar widgets, and footer links, or isolate body content using an <article> or <main> tag to lower extractability overhead.',
          evidence: `Boilerplate text represents ${(noiseRatio * 100).toFixed(0)}% of total page weight.`,
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // Check answer-first summary presence (e.g. bolded first sentences in content body)
    let hasAnswerFirst = false;
    $('p').slice(0, 3).each((_, el) => {
      const leadingStrong = $(el).find('strong, b').first();
      if (leadingStrong.length > 0 && $(el).text().indexOf(leadingStrong.text()) === 0) {
        hasAnswerFirst = true;
      }
    });

    if (!hasAnswerFirst && bodyTextLength > 500) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-answer-first'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Page lacks concise answer-first summaries or bolded key-takeaway structures.',
        recommendation: 'Incorporate summary paragraphs with bolded lead-in sentences at the top of sections to support LLM paragraph retrieval and synthesis.',
        evidence: 'No bolded summary sentence detected in lead paragraphs.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 19. AI Entity Clarity Rule
export class AiEntityClarityRule implements Rule {
  definition: RuleDefinition = {
    id: 'ai-entity-clarity',
    name: 'AI Entity Clarity',
    description: 'Checks for well-defined Schema.org metadata to establish entity identity and topic consistency.',
    category: 'ai_visibility',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/ai-entity-clarity',
  };

  private flattenSchema(schema: any): any[] {
    if (!schema) return [];
    if (Array.isArray(schema)) {
      return schema.reduce((acc, curr) => acc.concat(this.flattenSchema(curr)), []);
    }
    const result = [schema];
    if (schema['@graph'] && Array.isArray(schema['@graph'])) {
      result.push(...this.flattenSchema(schema['@graph']));
    }
    return result;
  }

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const allSchema = this.flattenSchema(page.structuredData);

    const hasEntity = allSchema.some(item => {
      const type = item?.['@type'];
      if (!type) return false;
      const t = String(type).toLowerCase();
      return t === 'organization' || t === 'person' || t === 'corporation' || t === 'localbusiness';
    });

    if (!hasEntity) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'weak-entity'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Organization or Person entity is weakly defined in Schema.org metadata.',
        recommendation: 'Implement structured metadata (JSON-LD) explicitly defining an Organization, Person, or LocalBusiness entity to help AI search engines build reliable knowledge graphs.',
        evidence: 'No primary entity of type Organization, Person, Corporation, or LocalBusiness found.',
        documentationLink: this.definition.documentationLink,
      });
    } else {
      // If we do have an entity, check for sameAs references (disambiguation)
      const hasDisambiguation = allSchema.some(item => {
        const type = item?.['@type'];
        if (!type) return false;
        const t = String(type).toLowerCase();
        const matchesType = t === 'organization' || t === 'person' || t === 'corporation' || t === 'localbusiness';
        return matchesType && item.sameAs && (Array.isArray(item.sameAs) ? item.sameAs.length > 0 : String(item.sameAs).trim().length > 0);
      });

      if (!hasDisambiguation) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-disambiguation'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: "Missing 'sameAs' references for entity disambiguation in structured data.",
          recommendation: "Add 'sameAs' fields containing authoritative URLs (Wikipedia, Wikidata, LinkedIn, official social channels) to disambiguate the identity of defined entities.",
          evidence: 'Entity defined but is missing disambiguation sameAs links.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    return findings;
  }
}

// 20. AI Citation Readiness Rule
export class AiCitationReadinessRule implements Rule {
  definition: RuleDefinition = {
    id: 'ai-citation-readiness',
    name: 'AI Citation Readiness',
    description: 'Analyzes the presence of factual assertions, statistics, citations, and FAQ schemas for LLM referenceability.',
    category: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/ai-citation-readiness',
  };

  private flattenSchema(schema: any): any[] {
    if (!schema) return [];
    if (Array.isArray(schema)) {
      return schema.reduce((acc, curr) => acc.concat(this.flattenSchema(curr)), []);
    }
    const result = [schema];
    if (schema['@graph'] && Array.isArray(schema['@graph'])) {
      result.push(...this.flattenSchema(schema['@graph']));
    }
    return result;
  }

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);
    const bodyText = $('body').text() || '';

    // A. Check for external outbound links (Citations)
    const externalLinks = page.links ? page.links.filter(l => !l.isInternal) : [];
    if (externalLinks.length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-external-citations'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page lacks outbound external citations or authoritative reference links.',
        recommendation: 'Provide outbound links to high-authority references, peer reviews, original source databases, or partner pages to build LLM confidence.',
        evidence: 'Outbound external link count: 0',
        documentationLink: this.definition.documentationLink,
      });
    }

    // B. Check for FAQ schema
    const allSchema = this.flattenSchema(page.structuredData);
    const hasFaqSchema = allSchema.some(item => {
      const type = item?.['@type'];
      return type && String(type).toLowerCase() === 'faqpage';
    });

    // Detect if page has QA/FAQ patterns in HTML but no schema
    const pageHasQuestions = (page.headings.h2 && page.headings.h2.some(h => h.endsWith('?'))) ||
                             (page.headings.h3 && page.headings.h3.some(h => h.endsWith('?')));

    if (pageHasQuestions && !hasFaqSchema) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-faq-schema'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'FAQ sections are missing structured schema markup.',
        recommendation: 'Add Schema.org FAQPage structured data to FAQ or Q&A content blocks to enable instant citation and answer extraction.',
        evidence: 'Questions detected in headers, but no FAQPage schema found.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // C. Check for facts and statistics presence
    const statRegex = /\b\d+(\.\d+)?%\b|\b(percent|percentage|statistics|statistics show|fact-checked|according to study|according to)\b/i;
    const hasStats = statRegex.test(bodyText);

    if (!hasStats && bodyText.trim().length > 500) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-statistics'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'No statistics or factual citations detected in content.',
        recommendation: 'Support claims with quantifiable data, metrics, percentage facts, or external citations to qualify as a source for factual AI queries.',
        evidence: 'No numeric percentages or sourcing phrases found in text.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 21. AI Structural Organization Rule
export class AiStructuralOrganizationRule implements Rule {
  definition: RuleDefinition = {
    id: 'ai-structural-organization',
    name: 'AI Structural Organization',
    description: 'Verifies logical heading hierarchy and chunk-friendly formats like lists and tables for parsing clarity.',
    category: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/ai-structural-organization',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    // A. Verify logical hierarchy nesting
    let hasBrokenHierarchy = false;
    let headingSequence: string[] = [];

    $(':header').each((_, el) => {
      headingSequence.push(el.name.toUpperCase());
    });

    for (let i = 0; i < headingSequence.length - 1; i++) {
      const current = parseInt(headingSequence[i].substring(1), 10);
      const next = parseInt(headingSequence[i + 1].substring(1), 10);
      if (next - current > 1) {
        hasBrokenHierarchy = true;
        break;
      }
    }

    if (hasBrokenHierarchy) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'broken-hierarchy'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Heading hierarchy reduces retrieval clarity due to non-sequential nesting (e.g., H1 followed directly by H3).',
        recommendation: 'Nest headings sequentially (H1 followed by H2, then H3) to allow AI crawlers to construct logical thematic hierarchies.',
        evidence: `Heading sequence: ${headingSequence.slice(0, 6).join(' -> ')}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    // B. Check for list or table elements
    const listsAndTablesCount = $('ul, ol, table').length;
    const wordCount = ($('body').text() || '').trim().split(/\s+/).length;

    if (listsAndTablesCount === 0 && wordCount > 200) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-lists-or-tables'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Page lacks list or table formatting, reducing chunk readability for AI scrapers.',
        recommendation: 'Use bulleted lists, numbered steps, or structured data tables to group complex points into easily digestible information blocks.',
        evidence: 'Zero lists (ul/ol) or tables found on page.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 22. AI Retrieval Friendliness & Semantic Chunking Rule
export class AiRetrievalFriendlinessRule implements Rule {
  definition: RuleDefinition = {
    id: 'ai-retrieval-friendliness',
    name: 'AI Retrieval Friendliness & Semantic Chunking',
    description: 'Evaluates paragraph length and continuity for optimal semantic chunking and embedding generation.',
    category: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/ai-retrieval-friendliness',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    // A. Check for paragraphs that are too long
    let tooLongParagraphsCount = 0;
    let longestParagraphLen = 0;

    $('p').each((_, el) => {
      const len = ($(el).text() || '').trim().length;
      if (len > longestParagraphLen) {
        longestParagraphLen = len;
      }
      if (len > 1200) { // ~200+ words in a single block without breaks
        tooLongParagraphsCount++;
      }
    });

    if (tooLongParagraphsCount > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'paragraphs-too-long'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Content sections are too long for optimal semantic chunking.',
        recommendation: 'Refactor long paragraphs into smaller text blocks (under 150-200 words) to ensure clean semantic vectors and cohesive embeddings.',
        evidence: `${tooLongParagraphsCount} paragraph(s) exceed 1200 characters. Longest: ${longestParagraphLen} characters.`,
        documentationLink: this.definition.documentationLink,
      });
    }

    // B. Check for thin content
    const bodyText = $('body').text() || '';
    const wordCount = bodyText.trim().split(/\s+/).filter(w => w.length > 0).length;

    if (wordCount > 0 && wordCount < 300) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'thin-content'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Content is too thin for high-quality semantic retrieval (under 300 words).',
        recommendation: 'Expand content with contextual depth, examples, definitions, or Q&A structures to improve thematic coverage and semantic query mapping.',
        evidence: `Word count: ${wordCount} words.`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 23. AI Authority Signals Rule
export class AiAuthoritySignalsRule implements Rule {
  definition: RuleDefinition = {
    id: 'ai-authority-signals',
    name: 'AI Authority Signals',
    description: 'Detects authority signals such as clear authorship, publication policies, and contact information.',
    category: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/ai-authority-signals',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);
    const bodyText = $('body').text() || '';

    // A. Check for author visibility
    const authorRegex = /\b(written by|by |author:|reviewed by|edited by|editor)\b/i;
    const hasAuthorEl = $('[rel="author"], [class*="author"], [id*="author"]').length > 0;
    const hasAuthorText = authorRegex.test(bodyText);

    if (!hasAuthorEl && !hasAuthorText) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-authorship'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page lacks visible author profiles or clearly indicated authorship.',
        recommendation: 'Clearly display the author or reviewer of the content, linking to their profile, bio, or credentials to satisfy Search Generative Experience quality standards.',
        evidence: 'No rel="author", author class names, or explicit authorship phrases found.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // B. Check for transparency indicators (about, contact, policies)
    const trustRegex = /\b(about us|contact us|privacy policy|terms of service|editorial policy|editorial team|who we are)\b/i;
    const linksText = page.links ? page.links.map(l => l.text).join(' ') : '';
    const hasTrustSignals = trustRegex.test(bodyText) || trustRegex.test(linksText);

    if (!hasTrustSignals) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-trust-signals'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Missing organizational trust signals (e.g., about, contact, or policy page links).',
        recommendation: 'Incorporate links to dedicated Transparency pages (About Us, Contact Us, Privacy Policy) in the navigation or footer to support site authority.',
        evidence: 'No links or clear text mentions of brand transparency pages found.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 24. Mobile SEO Usability Rule
export class MobileUsabilityRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-usability',
    name: 'Mobile Usability Evaluation',
    description: 'Evaluates the mobile usability parameters including viewport configuration, layout responsiveness, navigation usability, and interactive elements tap targets.',
    category: 'mobile_seo',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-usability',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const $ = page.html ? cheerio.load(page.html) : null;

    // A. Viewport Tag Evaluation
    if (!page.viewport) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-viewport'),
        ruleId: this.definition.id,
        severity: 'critical',
        category: this.definition.category,
        url: page.url,
        message: 'Viewport meta tag is missing from the page.',
        recommendation: 'Add a <meta name="viewport" content="width=device-width, initial-scale=1.0"> tag inside the <head> element to ensure proper layout scale on mobile devices.',
        documentationLink: this.definition.documentationLink,
      });
    } else {
      const v = page.viewport.toLowerCase();
      if (!v.includes('width=device-width') && !v.includes('initial-scale=')) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'invalid-viewport'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Viewport meta tag exists but may be invalid or restrictive: "${page.viewport}".`,
          recommendation: 'Configure viewport setting to use "width=device-width, initial-scale=1" for flexible responsiveness without restricting user zoom.',
          evidence: `Current viewport: "${page.viewport}"`,
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // B. Fixed-Width Elements Scan (responsive layout / horizontal scroll)
    if ($) {
      let largeFixedElements: string[] = [];
      let inlineStylesCount = 0;
      $('[style]').each((_, el) => {
        inlineStylesCount++;
        const style = $(el).attr('style') || '';
        const widthMatch = style.match(/width:\s*(\d+)px/);
        if (widthMatch) {
          const widthVal = parseInt(widthMatch[1], 10);
          if (widthVal > 480) {
            largeFixedElements.push(`${el.name}[style*="width: ${widthVal}px"]`);
          }
        }
      });

      if (inlineStylesCount === 0) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'no-inline-styles'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'No inline styles found — layout sub-checks score 0, mark UNVERIFIABLE',
          recommendation: 'Add inline styles or CSS elements to verify layout responsiveness.',
          documentationLink: this.definition.documentationLink,
        });
      } else if (largeFixedElements.length > 0) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'fixed-width'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Responsive layout hazard: Page contains ${largeFixedElements.length} elements with fixed pixel widths larger than typical mobile viewports (>480px).`,
          recommendation: 'Replace fixed-width styles with relative units (e.g. 100%, max-width: 100%, or vw) to avoid content overflows and horizontal scrolling on mobile viewports.',
          evidence: `Found elements: ${largeFixedElements.slice(0, 3).join(', ')}`,
          documentationLink: this.definition.documentationLink,
        });
      }

      // C. Navigation Usability
      const hasNavElement = $('nav, [class*="nav"], [id*="nav"], [class*="menu"], [id*="menu"]').length > 0;
      if (!hasNavElement) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'no-nav-element'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'No nav element found — nav sub-checks score 0',
          recommendation: 'Ensure structural navigation tags (<nav> or navigation classes) are present on mobile devices.',
          documentationLink: this.definition.documentationLink,
        });
      } else {
        const linkCount = page.links.length;
        if (linkCount > 10) {
          const navHtml = $('body').html() || '';
          const hasMobileNavKeyword = /hamburger|menu-toggle|mobile-nav|nav-toggle|btn-menu|drawer|toggle-menu/i.test(navHtml);
          if (!hasMobileNavKeyword) {
            findings.push({
              id: createFindingId(this.definition.id, page.url, 'poor-navigation'),
              ruleId: this.definition.id,
              severity: 'warning',
              category: this.definition.category,
              url: page.url,
              message: 'Navigation may be difficult to use on small viewports (no mobile-responsive navigation toggle detected).',
              recommendation: 'Implement a mobile-friendly collapsing navigation menu (hamburger menu / drawer) for viewports below 768px.',
              evidence: `Page has ${linkCount} links but lacks visible responsive menu keywords.`,
              documentationLink: this.definition.documentationLink,
            });
          }
        }
      }

      // D. Tap Target Sizing & Spacing
      let tinyTapTargets = 0;
      let totalInteractiveElements = 0;
      $('button, a').each((_, el) => {
        totalInteractiveElements++;
        const style = $(el).attr('style') || '';
        if (/padding:\s*0px|padding:\s*0(?!\d)|padding-top:\s*0|padding-bottom:\s*0/i.test(style)) {
          tinyTapTargets++;
        }
      });

      if (totalInteractiveElements === 0) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'no-tap-targets'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'No interactive tap targets found — usability sub-checks score 0, mark UNVERIFIABLE',
          recommendation: 'Ensure standard interactive components exist to verify tap spacing.',
          documentationLink: this.definition.documentationLink,
        });
      } else if (tinyTapTargets > 3) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'tap-target'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Found multiple tiny or cramped interactive tap targets (${tinyTapTargets} elements with zero padding).`,
          recommendation: 'Ensure all interactive elements (buttons, links, form inputs) are at least 48x48px in size, or have sufficient padding/spacing to prevent accidental taps.',
          evidence: `Detected ${tinyTapTargets} links/buttons with zero/minimal padding styles.`,
          documentationLink: this.definition.documentationLink,
        });
      }
    } else {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'unverifiable-usability'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Unverifiable from static crawl — scored 0',
        recommendation: 'Ensure page HTML is valid and readable.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 25. Mobile SEO Performance Rule
export class MobilePerformanceRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-performance',
    name: 'Mobile Core Web Vitals & Performance',
    description: 'Evaluates simulated Core Web Vitals (LCP, CLS) and page resources weight scaled for mobile conditions.',
    category: 'mobile_seo',
    defaultSeverity: 'warning',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-performance',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];

    // BUG 2 — UNVERIFIABLE CHECKS ASSUMED PASS
    const isVerifiable = context.config.playwrightEnabled;

    if (!isVerifiable) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'unverifiable-lcp'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'LCP/FID/INP metrics: Unverifiable from static crawl — scored 0',
        recommendation: 'Enable Playwright crawl to gather real-time performance data and Core Web Vitals.',
        documentationLink: this.definition.documentationLink,
      });
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'unverifiable-cls'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Layout shift behavior: Unverifiable from static crawl — scored 0',
        recommendation: 'Enable Playwright crawl to inspect real Cumulative Layout Shift.',
        documentationLink: this.definition.documentationLink,
      });
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'unverifiable-js-execution'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'JS execution time: Unverifiable from static crawl — scored 0',
        recommendation: 'Enable Playwright crawl to measure main thread JS execution CPU times.',
        documentationLink: this.definition.documentationLink,
      });
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'unverifiable-image-load'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Real image load performance: Unverifiable from static crawl — scored 0',
        recommendation: 'Enable Playwright crawl to check image network load performance.',
        documentationLink: this.definition.documentationLink,
      });
    } else {
      // A. Throttled Mobile LCP Evaluation
      if (page.coreWebVitals) {
        const mobileLcp = page.coreWebVitals.lcp * 1.5;
        if (mobileLcp > 4000) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'poor-lcp'),
            ruleId: this.definition.id,
            severity: 'error',
            category: this.definition.category,
            url: page.url,
            message: `Slow Largest Contentful Paint under mobile conditions: ${(mobileLcp / 1000).toFixed(2)}s (Threshold: <2.5s).`,
            recommendation: 'Optimize your mobile critical rendering path: minimize render-blocking resources, defer non-essential JS, compress and size hero images, and leverage server-side caching.',
            evidence: `Simulated Mobile LCP: ${Math.round(mobileLcp)}ms (derived from raw load time ${page.loadTimeMs}ms)`,
            documentationLink: this.definition.documentationLink,
          });
        } else if (mobileLcp > 2500) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'needs-improvement-lcp'),
            ruleId: this.definition.id,
            severity: 'warning',
            category: this.definition.category,
            url: page.url,
            message: `Largest Contentful Paint under mobile conditions needs improvement: ${(mobileLcp / 1000).toFixed(2)}s (Threshold: <2.5s).`,
            recommendation: 'Optimize hero element loading speed. Preload primary images and avoid loading heavy stylesheets before the main content is parsed.',
            evidence: `Simulated Mobile LCP: ${Math.round(mobileLcp)}ms`,
            documentationLink: this.definition.documentationLink,
          });
        }

        // B. Mobile CLS stability (mobile viewports have strict layout constraints)
        const cls = page.coreWebVitals.cls;
        if (cls > 0.25) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'poor-cls'),
            ruleId: this.definition.id,
            severity: 'error',
            category: this.definition.category,
            url: page.url,
            message: `Poor Cumulative Layout Shift (CLS) on mobile viewports: ${cls} (Threshold: <0.10).`,
            recommendation: 'Always reserve static space for images, advertisements, and interactive widgets. Specify explicit width and height attributes or use CSS aspect-ratio properties.',
            evidence: `Mobile CLS: ${cls}`,
            documentationLink: this.definition.documentationLink,
          });
        } else if (cls > 0.1) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'needs-improvement-cls'),
            ruleId: this.definition.id,
            severity: 'warning',
            category: this.definition.category,
            url: page.url,
            message: `Cumulative Layout Shift (CLS) on mobile viewports needs improvement: ${cls} (Threshold: <0.10).`,
            recommendation: 'Avoid inserting dynamic components (banners, dialogs) above existing content after page load unless triggered by user interaction.',
            evidence: `Mobile CLS: ${cls}`,
            documentationLink: this.definition.documentationLink,
          });
        }
      }
    }

    // Static analysis checks
    // BUG 4 — No images found → image sub-checks score 0, add issue "No images detected to evaluate"
    if (!page.images || page.images.length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-images-found'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'No images detected to evaluate',
        recommendation: 'Include relevant images on your mobile page to evaluate optimization.',
        documentationLink: this.definition.documentationLink,
      });
    }

    if (page.resources) {
      const { jsSizeBytes, imageSizeBytes, jsRequests, cssRequests } = page.resources;

      if (jsSizeBytes > 1000000) { // >1MB
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'excessive-js'),
          ruleId: this.definition.id,
          severity: 'error',
          category: this.definition.category,
          url: page.url,
          message: `Excessive JavaScript payload size for mobile CPUs: ${(jsSizeBytes / 1024).toFixed(1)}KB.`,
          recommendation: 'Reduce code bloat. Strip unused third-party libraries, configure code-splitting, lazy-load JS bundles, and use modern lightweight alternatives where possible.',
          evidence: `JS total payload: ${jsSizeBytes} bytes`,
          documentationLink: this.definition.documentationLink,
        });
      } else if (jsSizeBytes > 500000) { // >500KB
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'heavy-js'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Heavy JavaScript payload size for mobile viewports: ${(jsSizeBytes / 1024).toFixed(1)}KB.`,
          recommendation: 'Optimize bundle size and run performance profiling to minimize mobile main-thread CPU blockages.',
          evidence: `JS total payload: ${jsSizeBytes} bytes`,
          documentationLink: this.definition.documentationLink,
        });
      }

      // D. Image Optimization for Mobile
      if (page.images && page.images.length > 0) {
        if (imageSizeBytes > 1500000 && page.images.length > 5) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'heavy-images'),
            ruleId: this.definition.id,
            severity: 'warning',
            category: this.definition.category,
            url: page.url,
            message: `Heavy image payload size for mobile networks: ${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB.`,
            recommendation: 'Serve modern responsive images. Compress assets and use next-gen formats (WebP, AVIF), and specify srcset to deliver appropriately sized images for mobile viewports.',
            evidence: `Images total payload: ${imageSizeBytes} bytes for ${page.images.length} assets`,
            documentationLink: this.definition.documentationLink,
          });
        }
      }

      // E. Render blocking resources
      const renderBlockingCount = jsRequests + cssRequests;
      if (renderBlockingCount > 15) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'render-blocking'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `High count of critical render-blocking styles/scripts: ${renderBlockingCount} files loaded.`,
          recommendation: 'Consolidate multiple small CSS/JS files, inline critical styles, and add async/defer tags to non-essential JavaScript to unblock rendering on mobile devices.',
          evidence: `${cssRequests} stylesheet(s) and ${jsRequests} script(s) requested`,
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    return findings;
  }
}

// 26. Mobile SEO Responsive Design Rule
export class MobileResponsiveDesignRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-responsive',
    name: 'Responsive Design Quality',
    description: 'Evaluates responsive styles, media queries, fluid layouts, and mobile breakpoints.',
    category: 'mobile_seo',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-responsive',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    // BUG 2 — UNVERIFIABLE CHECKS ASSUMED PASS
    const isVerifiable = context.config.playwrightEnabled;
    if (!isVerifiable) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'unverifiable-breakpoints'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Actual breakpoint rendering: Unverifiable from static crawl — scored 0',
        recommendation: 'Enable Playwright crawl to perform actual mobile viewport breakpoint rendering validation.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Scan for media queries in style tags and stylesheet links
    let styleBlockContent = '';
    $('style').each((_, el) => {
      styleBlockContent += $(el).html() || '';
    });

    const hasMediaQueries = /@media/i.test(styleBlockContent);
    let hasResponsiveLink = false;
    $('link[rel="stylesheet"]').each((_, el) => {
      const media = $(el).attr('media');
      if (media && /screen|width/i.test(media)) {
        hasResponsiveLink = true;
      }
    });

    // A. Viewport and media queries check
    if (!hasMediaQueries && !hasResponsiveLink) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-media-queries'),
        ruleId: this.definition.id,
        severity: 'error',
        category: this.definition.category,
        url: page.url,
        message: 'No CSS media queries detected on the page structure.',
        recommendation: 'Implement CSS media queries (e.g. @media (max-width: 768px)) to adjust layout styles dynamically depending on device screen sizes.',
        evidence: 'Zero @media queries or responsive link media tags found in page HTML.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // B. Fixed Layout containers check
    const hasFixedContainers = /body\s*\{\s*width:\s*\d{3,}px|#container\s*\{\s*width:\s*\d{3,}px|\.wrapper\s*\{\s*width:\s*\d{3,}px/i.test(styleBlockContent);
    if (hasFixedContainers) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'fixed-layout'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Detected fixed-width declarations for primary body/container wrappers in style blocks.',
        recommendation: 'Migrate layout containers to fluid dimensions (e.g. width: 100%, max-width: 1200px) instead of fixed widths.',
        evidence: 'Detected pixel-based fixed layout container patterns in style blocks.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // C. Standard breakpoints coverage
    if (hasMediaQueries) {
      const hasStandardBreakpoints = /768|480|320|600/i.test(styleBlockContent);
      if (!hasStandardBreakpoints) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-breakpoints'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'Media queries exist but lack common mobile-responsive breakpoints (e.g., 320px, 480px, 768px).',
          recommendation: 'Ensure media queries cover common mobile target device widths (320px for small mobile, 480px for landscape mobile, 768px for tablet).',
          evidence: 'Custom breakpoints do not align with standard mobile viewport targets.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    return findings;
  }
}

// 27. Mobile SEO Indexing Readiness Rule
export class MobileIndexingReadinessRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-indexing',
    name: 'Mobile-First Indexing Readiness',
    description: 'Ensures structured data, canonical settings, and critical page content are indexable and consistent on mobile.',
    category: 'mobile_seo',
    defaultSeverity: 'warning',
    defaultWeight: 3,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-indexing',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const $ = page.html ? cheerio.load(page.html) : null;

    // A. Content Parity check (detect large hidden blocks on mobile)
    if ($) {
      let hiddenCriticalContent = 0;
      $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        if (/display:\s*none/i.test(style)) {
          const textLength = $(el).text().trim().length;
          if (textLength > 200) {
            hiddenCriticalContent++;
          }
        }
      });

      if (hiddenCriticalContent > 0) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'hidden-content'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'Large blocks of content are hidden via "display: none" inline styles.',
          recommendation: 'Ensure critical content is consistent across mobile and desktop. Avoid hiding important information on mobile, as search engines index pages based on mobile-first rendering.',
          evidence: `Found ${hiddenCriticalContent} element(s) with display:none containing >200 characters.`,
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // B. Structured Data parity (crucial for mobile index)
    const hasSyntaxError = page.structuredData.some(sd => sd.__error !== undefined);
    if (!page.structuredData || page.structuredData.length === 0 || hasSyntaxError) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-schema'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Structured schema markup is missing or invalid on mobile.',
        recommendation: 'Google indexing is entirely mobile-first. Schema.org structured data (JSON-LD) must be present and syntactically valid on the mobile rendering to appear in mobile search results.',
        evidence: page.structuredData.length === 0 ? 'No structured data' : 'Syntax error in structured data',
        documentationLink: this.definition.documentationLink,
      });
    }

    // C. Canonical URL checks
    if (!page.canonical) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-canonical'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: 'Missing canonical URL link element.',
        recommendation: 'Add a self-referential <link rel="canonical" href="..."> to prevent duplicate indexing across desktop and mobile URL versions.',
        documentationLink: this.definition.documentationLink,
      });
    } else {
      let pageUrlClean = page.url.replace(/\/$/, '').toLowerCase();
      let canonicalUrlClean = page.canonical.replace(/\/$/, '').toLowerCase();
      if (pageUrlClean !== canonicalUrlClean) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'canonical-mismatch'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: `Non-self-referential canonical detected: canonical points to "${page.canonical}".`,
          recommendation: 'Ensure the mobile and desktop URLs are correctly canonicalized. For responsive design, the canonical URL should point to itself.',
          evidence: `URL: ${page.url} vs Canonical: ${page.canonical}`,
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    return findings;
  }
}

// 32. OpenGraph/Twitter Card Validation Rule
export class SocialMetaRule implements Rule {
  definition: RuleDefinition = {
    id: 'social-meta',
    name: 'Missing or Incomplete Social Meta Tags',
    description: 'Validates OpenGraph and Twitter Card meta tags for social sharing and AI crawler visibility.',
    category: 'metadata',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/social-meta',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];

    // Check OpenGraph
    const og = page.openGraph;
    if (!og || Object.keys(og).length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-og'),
        ruleId: this.definition.id,
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
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'OpenGraph is missing og:url tag.',
          recommendation: 'Add an og:url meta tag to your page with the canonical URL.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // Check Twitter Card
    const twitter = page.twitterCard;
    if (!twitter || Object.keys(twitter).length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-twitter'),
        ruleId: this.definition.id,
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

// 33. Hreflang Validation Rule
export class HreflangRule implements Rule {
  definition: RuleDefinition = {
    id: 'hreflang',
    name: 'Hreflang Validation',
    description: 'Validates hreflang tags including self-references, language codes, and alternate URLs.',
    category: 'indexing',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/hreflang',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const hreflangs = page.hreflang;

    if (hreflangs.length === 0) {
      return findings;
    }

    // Check for self-referential hreflang
    const hasSelfReference = hreflangs.some(h => h.url === page.url);
    if (!hasSelfReference) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-self-reference'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing a self-referential hreflang tag.',
        recommendation: 'Add a hreflang tag that references the current page URL with the appropriate language code.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for x-default
    const hasXDefault = hreflangs.some(h => h.lang === 'x-default');
    if (!hasXDefault && hreflangs.length > 1) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-x-default'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing an x-default hreflang tag.',
        recommendation: 'Consider adding an x-default hreflang tag for users with unspecified languages.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Validate language codes (basic check: should be 2 letters or 2-2 format)
    const langCodeRegex = /^[a-z]{2}(-[A-Z]{2})?$|^x-default$/;
    for (const hreflang of hreflangs) {
      if (!langCodeRegex.test(hreflang.lang)) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, `invalid-lang-${hreflang.lang}`),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Invalid language code: "${hreflang.lang}".`,
          recommendation: 'Use valid ISO 639-1 language codes (optionally with ISO 3166-1 region codes, e.g., en-US).',
          evidence: `Invalid code: ${hreflang.lang}`,
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    return findings;
  }
}

// 34. Security/HTTPS Rule
export class SecurityRule implements Rule {
  definition: RuleDefinition = {
    id: 'security',
    name: 'Security & HTTPS Validation',
    description: 'Checks for HTTPS, mixed content, HSTS, and insecure forms.',
    category: 'security',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/security',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];

    // Check HTTPS
    if (page.url.startsWith('http:')) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'not-https'),
        ruleId: this.definition.id,
        severity: 'critical',
        category: this.definition.category,
        url: page.url,
        message: 'Page is not served over HTTPS.',
        recommendation: 'Enable HTTPS on your website and redirect all HTTP traffic to HTTPS.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for mixed content if page is HTML and we have the HTML
    if (page.html) {
      const $ = cheerio.load(page.html);
      const mixedContent: string[] = [];

      // Check for http:// resources
      $('img[src^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('src') || '');
      });
      $('script[src^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('src') || '');
      });
      $('link[rel="stylesheet"][href^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('href') || '');
      });
      $('iframe[src^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('src') || '');
      });

      if (mixedContent.length > 0) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'mixed-content'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: `Page contains ${mixedContent.length} mixed content resources.`,
          recommendation: 'Update all resources to use HTTPS URLs.',
          evidence: `Sample resources: ${mixedContent.slice(0, 3).join(', ')}`,
          documentationLink: this.definition.documentationLink,
        });
      }

      // Mixed content check finished

      // Check Subresource Integrity (SRI) (Phase 6.3)
      let pageOrigin = '';
      try {
        pageOrigin = new URL(page.url).origin;
      } catch {
        // fallback
      }

      const checkSri = (selector: string, attr: string) => {
        $(selector).each((_, el) => {
          const src = $(el).attr(attr);
          if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
            try {
              const srcOrigin = new URL(src).origin;
              if (srcOrigin !== pageOrigin) {
                const integrity = $(el).attr('integrity');
                if (!integrity) {
                  findings.push({
                    id: createFindingId(this.definition.id, page.url, 'missing-sri'),
                    ruleId: this.definition.id,
                    severity: 'warning',
                    category: this.definition.category,
                    url: page.url,
                    message: `Cross-origin resource "${src}" is missing Subresource Integrity (SRI) attribute.`,
                    recommendation: 'Add the "integrity" attribute with a cryptographic hash (SHA-256/384/512) to verify cross-origin scripts or stylesheets.',
                    documentationLink: this.definition.documentationLink,
                  });
                }
              }
            } catch {
              // ignore invalid url
            }
          }
        });
      };

      checkSri('script[src]', 'src');
      checkSri('link[rel="stylesheet"][href]', 'href');

      // Check for insecure forms
      $('form[action^="http:"]').each((_, el) => {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'insecure-form'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Page contains a form that submits to an insecure HTTP URL.',
          recommendation: 'Update the form action to use HTTPS.',
          evidence: `Form action: ${$(el).attr('action')}`,
          documentationLink: this.definition.documentationLink,
        });
      });
    }

    return findings;
  }
}

// 35. Content Quality Rule
export class ContentQualityRule implements Rule {
  definition: RuleDefinition = {
    id: 'content-quality',
    name: 'Content Quality Assessment',
    description: 'Checks for thin content and duplicate content across pages.',
    category: 'seo',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/content-quality',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    // Calculate word count
    const bodyText = $('body').text().trim();
    const wordCount = bodyText.split(/\s+/).filter(word => word.length > 0).length;

    // Check for thin content
    if (wordCount < 300) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'thin-content'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page has thin content.',
        recommendation: 'Add more unique, valuable content to the page to improve its quality and relevance.',
        evidence: `Word count: ${wordCount}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for duplicate content (simple check: compare title and meta description with other pages)
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

// 36. Internal Linking Optimization Rule
export class InternalLinkingRule implements Rule {
  definition: RuleDefinition = {
    id: 'internal-linking',
    name: 'Internal Linking Optimization',
    description: 'Checks for pages with no outbound links, excessive links, and link depth.',
    category: 'links',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/internal-linking',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const internalLinks = page.links.filter(link => link.isInternal);

    // Check for no outbound internal links
    if (internalLinks.length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-outbound-links'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page has no outbound internal links.',
        recommendation: 'Add relevant internal links to other pages on your site to improve navigation and crawlability.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for excessive links
    if (page.links.length > 100) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'excessive-links'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `Page has ${page.links.length} links, which is quite high.`,
        recommendation: 'Consider reducing the number of links on the page to focus on the most important ones.',
        evidence: `Link count: ${page.links.length}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check link depth
    if (page.depth && page.depth > 3) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'deep-link'),
        ruleId: this.definition.id,
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

// 37. Security Headers Rule
export class SecurityHeadersRule implements Rule {
  definition: RuleDefinition = {
    id: 'security-headers',
    name: 'Security Headers Assessment',
    description: 'Checks for essential security headers like CSP, X-Frame-Options, Referrer-Policy, HSTS, and Permissions-Policy.',
    category: 'security',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/security-headers',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity, findingSeverityOverrides } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const headers = page.headers || {};
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = val;
    }
    const headerKeys = Object.keys(normalizedHeaders);

    const getSeverity = (suffix: string, checkDefaultSev: Severity): Severity => {
      const key1 = `${this.definition.id}:${suffix}`;
      const key2 = suffix;
      if (findingSeverityOverrides[key1]) return findingSeverityOverrides[key1];
      if (findingSeverityOverrides[key2]) return findingSeverityOverrides[key2];
      
      const override = context.config.ruleOverrides?.[this.definition.id];
      if (override?.severity) {
        return override.severity;
      }
      return checkDefaultSev;
    };

    // CSP Parser helper
    const parseCsp = (cspValue: string): Record<string, string[]> => {
      const directives: Record<string, string[]> = {};
      const parts = cspValue.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const tokens = trimmed.split(/\s+/);
        const name = tokens[0].toLowerCase();
        const values = tokens.slice(1);
        directives[name] = values;
      }
      return directives;
    };

    // Check for Content-Security-Policy / Report-Only
    const cspValue = normalizedHeaders['content-security-policy'];
    const cspReportOnlyValue = normalizedHeaders['content-security-policy-report-only'];
    const activeCspValue = cspValue || cspReportOnlyValue;

    if (!cspValue && !cspReportOnlyValue) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-csp'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-csp', 'warning'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Content-Security-Policy (CSP) header.',
        recommendation: 'Add a CSP header to mitigate XSS and other code injection attacks.',
        documentationLink: this.definition.documentationLink,
      });
    } else if (!cspValue && cspReportOnlyValue) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'csp-report-only'),
        ruleId: this.definition.id,
        severity: getSeverity('csp-report-only', 'info'),
        category: this.definition.category,
        url: page.url,
        message: 'CSP is in report-only mode; enforce when ready.',
        recommendation: 'Review your Content-Security-Policy-Report-Only violations and migrate to an enforced Content-Security-Policy header.',
        documentationLink: this.definition.documentationLink,
      });
    }

    let hasFrameAncestors = false;

    if (activeCspValue) {
      const cspDirectives = parseCsp(activeCspValue);

      const hasToken = (directive: string, token: string) => {
        const vals = cspDirectives[directive];
        return vals ? vals.map(v => v.replace(/['"]/g, '').toLowerCase()).includes(token) : false;
      };

      const hasWildcard = (directive: string) => {
        const vals = cspDirectives[directive];
        return vals ? vals.includes('*') : false;
      };

      // script-src checks
      if (cspDirectives['script-src']) {
        if (hasToken('script-src', 'unsafe-inline')) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'csp-unsafe-inline-script'),
            ruleId: this.definition.id,
            severity: getSeverity('csp-unsafe-inline-script', 'error'),
            category: this.definition.category,
            url: page.url,
            message: 'Content-Security-Policy allows "unsafe-inline" in script-src.',
            recommendation: 'Remove "unsafe-inline" from script-src and use nonces or hashes to authorize inline scripts.',
            documentationLink: this.definition.documentationLink,
          });
        }
        if (hasToken('script-src', 'unsafe-eval')) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'csp-unsafe-eval-script'),
            ruleId: this.definition.id,
            severity: getSeverity('csp-unsafe-eval-script', 'error'),
            category: this.definition.category,
            url: page.url,
            message: 'Content-Security-Policy allows "unsafe-eval" in script-src.',
            recommendation: 'Remove "unsafe-eval" from script-src to prevent dynamic code execution.',
            documentationLink: this.definition.documentationLink,
          });
        }
        if (hasWildcard('script-src')) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'csp-script-src-wildcard'),
            ruleId: this.definition.id,
            severity: getSeverity('csp-script-src-wildcard', 'error'),
            category: this.definition.category,
            url: page.url,
            message: 'Content-Security-Policy script-src allows wildcard source (*).',
            recommendation: 'Specify exact allowed domains in script-src instead of wildcard (*).',
            documentationLink: this.definition.documentationLink,
          });
        }
      }

      // object-src checks
      if (cspDirectives['object-src']) {
        if (hasWildcard('object-src')) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'csp-object-src-wildcard'),
            ruleId: this.definition.id,
            severity: getSeverity('csp-object-src-wildcard', 'error'),
            category: this.definition.category,
            url: page.url,
            message: 'Content-Security-Policy object-src allows wildcard source (*).',
            recommendation: 'Set object-src to "none" to disable plugins like Flash and Java.',
            documentationLink: this.definition.documentationLink,
          });
        }
      } else {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'csp-missing-object-src'),
          ruleId: this.definition.id,
          severity: getSeverity('csp-missing-object-src', 'warning'),
          category: this.definition.category,
          url: page.url,
          message: 'Content-Security-Policy is missing object-src directive.',
          recommendation: 'Add `object-src \'none\'` to disable obsolete and insecure browser plugins.',
          documentationLink: this.definition.documentationLink,
        });
      }

      // check missing default-src
      if (!cspDirectives['default-src']) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'csp-missing-default-src'),
          ruleId: this.definition.id,
          severity: getSeverity('csp-missing-default-src', 'warning'),
          category: this.definition.category,
          url: page.url,
          message: 'Content-Security-Policy is missing default-src directive.',
          recommendation: 'Add `default-src \'self\'` as a fallback directive for all resource types.',
          documentationLink: this.definition.documentationLink,
        });
      }

      // check frame-ancestors
      if (cspDirectives['frame-ancestors']) {
        hasFrameAncestors = true;
      } else {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'csp-missing-frame-ancestors'),
          ruleId: this.definition.id,
          severity: getSeverity('csp-missing-frame-ancestors', 'info'),
          category: this.definition.category,
          url: page.url,
          message: 'Content-Security-Policy is missing frame-ancestors directive.',
          recommendation: 'Add `frame-ancestors` directive as a modern way to control where your site can be embedded.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // Check for X-Frame-Options
    const hasXFrameOptions = normalizedHeaders['x-frame-options'];
    if (!hasXFrameOptions && !hasFrameAncestors) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-x-frame-options'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-x-frame-options', 'warning'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing X-Frame-Options header.',
        recommendation: 'Add an X-Frame-Options header to prevent clickjacking attacks.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for Referrer-Policy
    if (!headerKeys.includes('referrer-policy')) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-referrer-policy'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-referrer-policy', 'info'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Referrer-Policy header.',
        recommendation: 'Add a Referrer-Policy header to control what referrer information is sent with requests.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for HTTP Strict Transport Security (HSTS)
    const isHttps = page.url.startsWith('https:');
    const hstsHeader = normalizedHeaders['strict-transport-security'];

    if (isHttps) {
      if (!hstsHeader) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-hsts'),
          ruleId: this.definition.id,
          severity: getSeverity('missing-hsts', 'error'),
          category: this.definition.category,
          url: page.url,
          message: 'Page is missing HTTP Strict Transport Security (HSTS) header.',
          recommendation: 'Add the Strict-Transport-Security header to force clients to use HTTPS.',
          documentationLink: this.definition.documentationLink,
        });
      } else {
        const directives = hstsHeader.split(';').map(d => d.trim().toLowerCase());
        let maxAge: number | null = null;
        const maxAgeDir = directives.find(d => d.startsWith('max-age='));
        if (maxAgeDir) {
          const match = maxAgeDir.match(/max-age=(\d+)/);
          if (match) {
            maxAge = parseInt(match[1], 10);
          }
        }

        if (maxAge === null) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'hsts-invalid'),
            ruleId: this.definition.id,
            severity: getSeverity('hsts-invalid', 'warning'),
            category: this.definition.category,
            url: page.url,
            message: 'HSTS header is missing a valid max-age directive.',
            recommendation: 'Configure Strict-Transport-Security with a valid max-age directive (e.g., max-age=31536000).',
            documentationLink: this.definition.documentationLink,
          });
        } else if (maxAge < 31536000) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'hsts-short-max-age'),
            ruleId: this.definition.id,
            severity: getSeverity('hsts-short-max-age', 'warning'),
            category: this.definition.category,
            url: page.url,
            message: `HSTS max-age is less than 1 year (${maxAge} seconds).`,
            recommendation: 'Increase Strict-Transport-Security max-age to at least 1 year (31536000 seconds).',
            documentationLink: this.definition.documentationLink,
          });
        }

        const hasSubdomains = directives.some(d => d === 'includesubdomains');
        if (!hasSubdomains) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'hsts-missing-subdomains'),
            ruleId: this.definition.id,
            severity: getSeverity('hsts-missing-subdomains', 'warning'),
            category: this.definition.category,
            url: page.url,
            message: 'HSTS header is missing the includeSubDomains directive.',
            recommendation: 'Add includeSubDomains to your Strict-Transport-Security header to protect all subdomains.',
            documentationLink: this.definition.documentationLink,
          });
        }

        const hasPreload = directives.some(d => d === 'preload');
        if (!hasPreload) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, 'hsts-missing-preload'),
            ruleId: this.definition.id,
            severity: getSeverity('hsts-missing-preload', 'info'),
            category: this.definition.category,
            url: page.url,
            message: 'HSTS header is missing the preload directive.',
            recommendation: 'Add preload to your Strict-Transport-Security header to allow preloading in modern browsers.',
            documentationLink: this.definition.documentationLink,
          });
        }
      }
    }

    // Check for X-Content-Type-Options
    const xctoHeader = normalizedHeaders['x-content-type-options'];
    if (!xctoHeader) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-x-content-type-options'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-x-content-type-options', 'warning'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing X-Content-Type-Options header.',
        recommendation: 'Add `X-Content-Type-Options: nosniff` to prevent MIME sniffing attacks.',
        documentationLink: this.definition.documentationLink,
      });
    } else if (xctoHeader.trim().toLowerCase() !== 'nosniff') {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'invalid-x-content-type-options'),
        ruleId: this.definition.id,
        severity: getSeverity('invalid-x-content-type-options', 'warning'),
        category: this.definition.category,
        url: page.url,
        message: `X-Content-Type-Options has invalid value: "${xctoHeader}".`,
        recommendation: 'Set `X-Content-Type-Options: nosniff` to prevent MIME sniffing attacks.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for Permissions-Policy
    const permPolicyHeader = normalizedHeaders['permissions-policy'];
    if (!permPolicyHeader) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-permissions-policy'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-permissions-policy', 'info'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Permissions-Policy header.',
        recommendation: 'Add `Permissions-Policy` header to control browser feature access (camera, microphone, geolocation, etc.).',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for COOP/COEP/CORP
    const coopHeader = normalizedHeaders['cross-origin-opener-policy'];
    if (!coopHeader) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-coop'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-coop', 'info'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Cross-Origin-Opener-Policy (COOP) header.',
        recommendation: 'Add `Cross-Origin-Opener-Policy: same-origin` to isolate your execution context.',
        documentationLink: this.definition.documentationLink,
      });
    }

    const coepHeader = normalizedHeaders['cross-origin-embedder-policy'];
    if (!coepHeader) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-coep'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-coep', 'info'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Cross-Origin-Embedder-Policy (COEP) header.',
        recommendation: 'Add `Cross-Origin-Embedder-Policy: require-corp` to prevent loading resources without explicit permission.',
        documentationLink: this.definition.documentationLink,
      });
    }

    const corpHeader = normalizedHeaders['cross-origin-resource-policy'];
    if (!corpHeader) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-corp'),
        ruleId: this.definition.id,
        severity: getSeverity('missing-corp', 'info'),
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Cross-Origin-Resource-Policy (CORP) header.',
        recommendation: 'Add `Cross-Origin-Resource-Policy: same-origin` or `same-site` to control which origins can load your resources.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for Server header version disclosure (Phase 6.1)
    const serverHeader = normalizedHeaders['server'];
    if (serverHeader) {
      if (/\d/.test(serverHeader)) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'server-version-disclosure'),
          ruleId: this.definition.id,
          severity: getSeverity('server-version-disclosure', 'info'),
          category: this.definition.category,
          url: page.url,
          message: `Server header exposes software version: "${serverHeader}".`,
          recommendation: 'Configure your web server to hide specific software versions from the Server header.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // Check for X-Powered-By (Phase 6.1)
    const xPoweredByHeader = normalizedHeaders['x-powered-by'];
    if (xPoweredByHeader) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'x-powered-by-disclosure'),
        ruleId: this.definition.id,
        severity: getSeverity('x-powered-by-disclosure', 'info'),
        category: this.definition.category,
        url: page.url,
        message: `X-Powered-By header is present: "${xPoweredByHeader}".`,
        recommendation: 'Remove the X-Powered-By header to prevent technology stack disclosure.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for Cookie security flags (Phase 6.2)
    const setCookieHeader = headers['set-cookie'];
    if (setCookieHeader) {
      const cookieStrings = Array.isArray(setCookieHeader) 
        ? setCookieHeader 
        : (typeof setCookieHeader === 'string' ? [setCookieHeader] : []);

      for (const cookieStr of cookieStrings) {
        const parts = cookieStr.split(';').map((p: string) => p.trim());
        const namePart = parts[0] || '';
        const cookieName = namePart.split('=')[0] || 'Unknown';

        const isCookieSecure = parts.some((p: string) => p.toLowerCase() === 'secure');
        const isCookieHttpOnly = parts.some((p: string) => p.toLowerCase() === 'httponly');
        const hasSameSite = parts.some((p: string) => p.toLowerCase().startsWith('samesite='));

        if (isHttps && !isCookieSecure) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, `cookie-missing-secure:${cookieName}`),
            ruleId: this.definition.id,
            severity: getSeverity('cookie-missing-secure', 'warning'),
            category: this.definition.category,
            url: page.url,
            message: `Cookie "${cookieName}" is missing the Secure flag.`,
            recommendation: `Add the "Secure" attribute to cookie "${cookieName}" to ensure it is only transmitted over HTTPS.`,
            documentationLink: this.definition.documentationLink,
          });
        }

        if (!isCookieHttpOnly) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, `cookie-missing-httponly:${cookieName}`),
            ruleId: this.definition.id,
            severity: getSeverity('cookie-missing-httponly', 'warning'),
            category: this.definition.category,
            url: page.url,
            message: `Cookie "${cookieName}" is missing the HttpOnly flag.`,
            recommendation: `Add the "HttpOnly" attribute to cookie "${cookieName}" to prevent client-side script access.`,
            documentationLink: this.definition.documentationLink,
          });
        }

        if (!hasSameSite) {
          findings.push({
            id: createFindingId(this.definition.id, page.url, `cookie-missing-samesite:${cookieName}`),
            ruleId: this.definition.id,
            severity: getSeverity('cookie-missing-samesite', 'info'),
            category: this.definition.category,
            url: page.url,
            message: `Cookie "${cookieName}" is missing the SameSite attribute.`,
            recommendation: `Add "SameSite=Lax" or "SameSite=Strict" to cookie "${cookieName}" to mitigate CSRF attacks.`,
            documentationLink: this.definition.documentationLink,
          });
        }
      }
    }

    return findings;
  }
}

// 37b. Caching Headers Rule
export class CachingHeadersRule implements Rule {
  definition: RuleDefinition = {
    id: 'caching-headers',
    name: 'Caching Headers Assessment',
    description: 'Checks for caching headers like Cache-Control and ETag to optimize performance.',
    category: 'performance',
    defaultSeverity: 'info',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/caching-headers',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const headers = page.headers || {};
    const headerKeys = Object.keys(headers).map(k => k.toLowerCase());

    // Check for Cache-Control
    if (!headerKeys.includes('cache-control')) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-cache-control'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing Cache-Control header.',
        recommendation: 'Add a Cache-Control header to optimize caching strategy.',
        documentationLink: this.definition.documentationLink,
      });
    }

    // Check for ETag
    if (!headerKeys.includes('etag')) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-etag'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing ETag header.',
        recommendation: 'Add an ETag header to enable efficient bandwidth usage with conditional requests.',
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 38. Image Optimization Rule
export class ImageOptimizationRule implements Rule {
  definition: RuleDefinition = {
    id: 'image-optimization',
    name: 'Image Optimization Assessment',
    description: 'Checks images for missing dimensions, lazy loading, modern formats, srcset, and display size mismatch.',
    category: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/image-optimization',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);
    const images = $('img');

    if (images.length === 0) return findings;

    let missingDimensionsCount = 0;
    let noLazyLoadingCount = 0;
    let noModernFormatCount = 0;
    let missingSrcsetCount = 0;

    images.each((_, el) => {
      const src = $(el).attr('src') || '';
      const width = $(el).attr('width');
      const height = $(el).attr('height');
      const loading = $(el).attr('loading');
      const srcset = $(el).attr('srcset');

      // Check for missing width/height
      if (!width || !height) {
        missingDimensionsCount++;
      }

      // Check for lazy loading
      if (!loading || loading.toLowerCase() !== 'lazy') {
        noLazyLoadingCount++;
      }

      // Check for modern image format
      if (!/\.(webp|avif)$/i.test(src)) {
        noModernFormatCount++;
      }

      // Check for srcset
      if (!srcset) {
        missingSrcsetCount++;
      }
    });

    if (missingDimensionsCount > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-dimensions'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: `${missingDimensionsCount} image(s) missing width/height attributes.`,
        recommendation: 'Add explicit width and height attributes to all images to prevent CLS.',
        evidence: `${missingDimensionsCount} images without dimensions`,
        documentationLink: this.definition.documentationLink,
      });
    }

    if (noLazyLoadingCount > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-lazy-loading'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `${noLazyLoadingCount} image(s) missing loading="lazy" attribute.`,
        recommendation: 'Add loading="lazy" to offscreen images to improve page load times.',
        evidence: `${noLazyLoadingCount} images without lazy loading`,
        documentationLink: this.definition.documentationLink,
      });
    }

    if (noModernFormatCount > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'no-modern-format'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `${noModernFormatCount} image(s) not using WebP or AVIF format.`,
        recommendation: 'Serve images in modern formats like WebP or AVIF for smaller file sizes.',
        evidence: `${noModernFormatCount} images in legacy formats`,
        documentationLink: this.definition.documentationLink,
      });
    }

    if (missingSrcsetCount > 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'missing-srcset'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: `${missingSrcsetCount} image(s) missing srcset attribute.`,
        recommendation: 'Add srcset to serve appropriately sized images for different viewports.',
        evidence: `${missingSrcsetCount} images without srcset`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}

// 39. Pagination Health Rule
export class PaginationHealthRule implements Rule {
  definition: RuleDefinition = {
    id: 'pagination-health',
    name: 'Pagination Health Check',
    description: 'Checks for rel=next/prev, infinite scroll implementation, and view-all page canonicalization.',
    category: 'seo',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/pagination-health',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);

    // Check for rel=next/prev
    const hasRelNext = $('link[rel="next"]').length > 0;
    const hasRelPrev = $('link[rel="prev"]').length > 0;
    if (!hasRelNext && !hasRelPrev) {
      // Check if page looks like it has pagination
      const hasPaginationPattern = $('.pagination, .pager, [class*="page-nav"], nav[class*="pagination"]').length > 0;
      if (hasPaginationPattern) {
        findings.push({
          id: createFindingId(this.definition.id, page.url, 'missing-rel-next-prev'),
          ruleId: this.definition.id,
          severity: 'warning',
          category: this.definition.category,
          url: page.url,
          message: 'Pagination detected but missing rel=next/prev link tags.',
          recommendation: 'Add rel=next and rel=prev link tags to help search engines understand paginated content.',
          documentationLink: this.definition.documentationLink,
        });
      }
    }

    // Check for infinite scroll indicators
    const hasInfiniteScroll = /infinite[-_]scroll|load[-_]more|autoload/i.test($('body').html() || '');
    if (hasInfiniteScroll) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'infinite-scroll'),
        ruleId: this.definition.id,
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

// 40. Internal Link Distribution Rule
export class InternalLinkDistributionRule implements Rule {
  definition: RuleDefinition = {
    id: 'internal-link-distribution',
    name: 'Internal Link Distribution Analysis',
    description: 'Checks for authority sinks, orphan pages, and calculates internal link distribution.',
    category: 'links',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/internal-link-distribution',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];

    // Only run on the primary page (first crawled) to avoid duplicate findings
    const pageUrls = Object.keys(context.allPages);
    if (page.url !== pageUrls[0]) return [];

    // Check for authority sinks (high in-degree, low out-degree)
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

// 41. Duplicate Content Similarity Rule
export class DuplicateContentSimilarityRule implements Rule {
  definition: RuleDefinition = {
    id: 'duplicate-content-similarity',
    name: 'Duplicate Content Similarity Check',
    description: 'Compares body content similarity between pages and identifies near-duplicates.',
    category: 'seo',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/duplicate-content-similarity',
  };

  // Simple similarity check using word frequency
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
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
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

// ==========================================
// RULE ENGINE EXECUTOR
// ==========================================

export class RuleEngine {
  private readonly defaultRules: Rule[] = [
    new MissingTitleRule(),
    new DuplicateTitleRule(),
    new MissingMetaDescriptionRule(),
    new MissingH1Rule(),
    new MultipleH1Rule(),
    new MissingAltTextRule(),
    new BrokenLinksRule(),
    new CanonicalIssuesRule(),
    new NoIndexRule(),
    new MissingStructuredDataRule(),
    new MissingRobotsTxtRule(),
    new MissingSitemapXmlRule(),
    new LowPerformanceScoreRule(),
    new LcpMetricRule(),
    new ClsMetricRule(),
    new ResourceSizeRule(),
    new OrphanPageRule(),
    new AiExtractabilityRule(),
    new AiEntityClarityRule(),
    new AiCitationReadinessRule(),
    new AiStructuralOrganizationRule(),
    new AiRetrievalFriendlinessRule(),
    new AiAuthoritySignalsRule(),
    new MobileUsabilityRule(),
    new MobilePerformanceRule(),
    new MobileResponsiveDesignRule(),
    new MobileIndexingReadinessRule(),
    new SocialMetaRule(),
    new HreflangRule(),
    new SecurityRule(),
    new ContentQualityRule(),
    new InternalLinkingRule(),
    new SecurityHeadersRule(),
    new CachingHeadersRule(),
    new ImageOptimizationRule(),
    new PaginationHealthRule(),
    new InternalLinkDistributionRule(),
    new DuplicateContentSimilarityRule(),
  ];

  private readonly customRules: Rule[] = [];

  registerRule(rule: Rule): void {
    this.customRules.push(rule);
  }

  getRules(config: SeoConfig, tierConfig?: ExecutionTierConfig): Rule[] {
    const allRules = [...this.defaultRules, ...this.customRules];
    return allRules.filter(rule => {
      const { enabled } = getRuleSettings(rule.definition, config);
      if (!enabled) return false;
      
      // Apply tier rule filter if available
      if (tierConfig) {
        const { categories, minSeverity, maxRulesPerCategory } = tierConfig.ruleFilter;
        if (!categories.includes(rule.definition.category)) return false;
        
        // Severity check
        const severityOrder: Severity[] = ['info', 'warning', 'error', 'critical'];
        const ruleSeverityIndex = severityOrder.indexOf(rule.definition.defaultSeverity);
        const minSeverityIndex = severityOrder.indexOf(minSeverity);
        if (ruleSeverityIndex < minSeverityIndex) return false;
      }
      
      return true;
    });
  }

  async run(
    pages: Record<string, NormalizedPage>,
    config: SeoConfig,
    dataSources: Map<string, DataSource>,
    tierConfig?: ExecutionTierConfig,
    backlinkData?: RuleEvaluationContext['backlinkData'],
    backlinkError?: string
  ): Promise<Finding[]> {
    const activeRules = this.getRules(config, tierConfig);
    const allFindings: Finding[] = [];

    const context: RuleEvaluationContext = {
      allPages: pages,
      config,
      dataSources,
      backlinkData,
      backlinkError,
    };

    // Run rules on all pages
    for (const page of Object.values(pages)) {
      for (const rule of activeRules) {
        try {
          const findings = await rule.evaluate(page, context);
          allFindings.push(...findings);
        } catch (err: any) {
          console.error(`[RuleEngine] Error evaluating rule "${rule.definition.id}" on URL ${page.url}:`, err.message);
        }
      }
    }

    return allFindings;
  }
}
