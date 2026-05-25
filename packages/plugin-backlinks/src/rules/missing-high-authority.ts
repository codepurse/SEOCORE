import { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage, BacklinkIntelligenceData } from '@seocore/sdk';
import { createFindingId, getRuleSettings, getPrimaryBacklinkPage } from '@seocore/rules';

export class MissingHighAuthorityBacklinksRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-high-authority-backlinks',
    name: 'Missing High-Authority Backlinks',
    description: 'Alerts when the site has very few or no backlinks from high-authority domains.',
    category: 'backlink_intelligence',
    defaultSeverity: 'warning',
    defaultWeight: 4,
    documentationLink: 'https://seocore.dev/docs/rules/missing-high-authority-backlinks',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!getPrimaryBacklinkPage(page, context)) {
      return [];
    }

    const backlinksDS = context.dataSources?.get('backlinks');
    const backlinkData = (backlinksDS?.data as BacklinkIntelligenceData) ?? context.backlinkData;

    if (!backlinkData || backlinkData.backlinks.length === 0) {
      return [];
    }

    if (!backlinkData.domainMetrics.authorityMetricsAvailable) {
      return [];
    }

    const highAuthorityCount = backlinkData.backlinks.filter(backlink => (backlink.domainAuthority ?? 0) >= 60).length;
    if (highAuthorityCount >= 3) {
      return [];
    }

    return [
      {
        id: createFindingId(this.definition.id, page.url),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: 'Very few backlinks come from high-authority referring domains.',
        recommendation: 'Prioritize digital PR, expert citations, and partnerships that attract links from trusted industry publications and institutions.',
        evidence: `High-authority backlinks detected: ${highAuthorityCount}.`,
        documentationLink: this.definition.documentationLink,
      }
    ];
  }
}
