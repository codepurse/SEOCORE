import type { Finding, NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

export class MissingTitleRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-title',
    name: 'Missing Page Title',
    description: 'Verifies the page has a non-empty <title> tag.',
    category: 'metadata',
    module: 'core',
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
          subCheck: 'missing',
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
          subCheck: 'too-long',
          severity: 'warning',
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

export class DuplicateTitleRule implements Rule {
  definition: RuleDefinition = {
    id: 'duplicate-title',
    name: 'Duplicate Page Title',
    description: 'Verifies page titles are unique across the crawled website.',
    category: 'metadata',
    module: 'core',
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
          subCheck: 'duplicate',
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
