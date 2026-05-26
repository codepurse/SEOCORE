import type { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage } from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';

interface EeatAnalysisLike {
  pillars?: {
    experience?: number;
    expertise?: number;
    authoritativeness?: number;
    trustworthiness?: number;
  };
}

export class EeatScoreRule implements Rule {
  definition: RuleDefinition = {
    id: 'eeat-score',
    name: 'E-E-A-T Score Bridge',
    description: 'Emits findings from E-E-A-T analyzer results when eeat data source is available.',
    category: 'seo',
    module: 'core',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/eeat-score',
    stateless: true,
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) {
      return [];
    }

    const eeatDataSource = context.dataSources.get('eeat');
    if (eeatDataSource?.status !== 'ok') {
      return [];
    }

    const analysis = eeatDataSource.data as EeatAnalysisLike | undefined;
    const pillars = analysis?.pillars;
    if (!pillars) {
      return [];
    }

    const findings: Finding[] = [];
    const pillarEntries = [
      ['experience', pillars.experience],
      ['expertise', pillars.expertise],
      ['authority', pillars.authoritativeness],
      ['trust', pillars.trustworthiness],
    ] as const;

    for (const [subCheck, score] of pillarEntries) {
      if (typeof score !== 'number' || score >= 60) {
        continue;
      }

      findings.push({
        id: createFindingId(this.definition.id, page.url, subCheck),
        ruleId: this.definition.id,
        subCheck,
        severity,
        category: this.definition.category,
        url: page.url,
        message: `E-E-A-T ${subCheck} score is below target (${score}/100).`,
        recommendation: `Improve ${subCheck} signals in page content and supporting site structure.`,
        evidence: `Analyzer score: ${score}/100`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}
