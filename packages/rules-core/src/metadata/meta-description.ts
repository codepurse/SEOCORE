import type { Finding, NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

export class MissingMetaDescriptionRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-meta-description',
    name: 'Missing Meta Description',
    description: 'Verifies the page has a meta description for SERP snippets.',
    category: 'metadata',
    module: 'core',
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
          subCheck: 'missing',
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
          subCheck: 'too-long',
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
