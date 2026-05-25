import type { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

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

    const findings: Finding[] = [];

    if (!page.title || page.title.trim() === '') {
      findings.push({
        id: createFindingId(this.definition.id, page.url),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Page is missing a title tag or the title is empty.',
        recommendation: 'Add a descriptive <title> tag inside the <head> element. Keep it between 50-60 characters.',
        documentationLink: this.definition.documentationLink,
      });
    } else if (page.title.length > 60) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'too-long'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: `Title is too long (${page.title.length} characters). It will likely be truncated in search results.`,
        recommendation: 'Shorten the title to be 60 characters or less.',
        evidence: `Current title: "${page.title}"`,
        documentationLink: this.definition.documentationLink,
      });
    } else if (page.title.length < 15) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'too-short'),
        ruleId: this.definition.id,
        severity: 'warning',
        category: this.definition.category,
        url: page.url,
        message: `Title is too short (${page.title.length} characters). It may not provide enough context to search engines.`,
        recommendation: 'Make the title at least 15 characters long.',
        evidence: `Current title: "${page.title}"`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}
