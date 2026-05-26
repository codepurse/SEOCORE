import type { Finding, NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

export class MissingH1Rule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-h1',
    name: 'Missing H1 Heading',
    description: 'Verifies the page has at least one H1 element acting as main heading.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/missing-h1',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!page.headings.h1 || page.headings.h1.length === 0) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'missing',
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

export class MultipleH1Rule implements Rule {
  definition: RuleDefinition = {
    id: 'multiple-h1',
    name: 'Multiple H1 Headings',
    description: 'Checks for multiple H1 elements which can dilute semantic structure.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 4,
    documentationLink: 'https://seocore.dev/docs/rules/multiple-h1',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (page.headings.h1 && page.headings.h1.length > 1) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          subCheck: 'multiple',
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

export class MissingAltTextRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-alt-text',
    name: 'Missing Image Alt Text',
    description: 'Verifies images have alt attributes for accessibility and image search.',
    category: 'accessibility',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/missing-alt-text',
    stateless: true,
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
          subCheck: 'missing-alt',
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

export class BrokenLinksRule implements Rule {
  definition: RuleDefinition = {
    id: 'broken-links',
    name: 'Broken Outbound Links',
    description: 'Detects links pointing to internal or external pages that returned broken HTTP status codes.',
    category: 'links',
    module: 'core',
    defaultSeverity: 'error',
    defaultWeight: 9,
    documentationLink: 'https://seocore.dev/docs/rules/broken-links',
    stateless: true,
  };

  private readonly externalCache = new Map<string, boolean>();

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
          if (targetPage.statusCode >= 400 || targetPage.statusCode === 0) {
            brokenLinks.push(`${link.url} (Status: ${targetPage.statusCode})`);
          }
        }
      } else {
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
          subCheck: 'broken-links',
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
