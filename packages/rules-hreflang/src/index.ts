import type { Finding, NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

export class HreflangRule implements Rule {
  definition: RuleDefinition = {
    id: 'hreflang',
    name: 'Hreflang Validation',
    description: 'Validates hreflang tags including self-references, language codes, and alternate URLs.',
    category: 'indexing',
    module: 'hreflang',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/hreflang',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) {
      return [];
    }

    const findings: Finding[] = [];
    const hreflangs = page.hreflang;

    if (hreflangs.length === 0) {
      return findings;
    }

    const hasSelfReference = hreflangs.some((hreflang) => hreflang.url === page.url);
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

    const hasXDefault = hreflangs.some((hreflang) => hreflang.lang === 'x-default');
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

export function getHreflangRules(): Rule[] {
  return [new HreflangRule()];
}
