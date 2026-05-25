import { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage, BacklinkIntelligenceData } from '@seocore/sdk';
import { createFindingId, getRuleSettings, getPrimaryBacklinkPage } from '@seocore/rules';

export class LowAuthorityBacklinksRule implements Rule {
  definition: RuleDefinition = {
    id: 'low-authority-backlinks',
    name: 'Potential Low-Quality/Spammy Backlink Risk',
    description: 'Alerts to potential low-quality or toxic backlink risks.',
    category: 'backlink_intelligence',
    defaultSeverity: 'warning',
    defaultWeight: 4,
    documentationLink: 'https://seocore.dev/docs/rules/low-authority-backlinks',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!getPrimaryBacklinkPage(page, context)) {
      return [];
    }

    const findings: Finding[] = [];
    const backlinksDS = context.dataSources?.get('backlinks');
    const backlinkData = (backlinksDS?.data as BacklinkIntelligenceData) ?? context.backlinkData;
    const backlinkError = backlinksDS?.status === 'error' ? backlinksDS.error : context.backlinkError;

    const backlinks = backlinkData?.backlinks ?? [];
    const metricsAvailable = backlinkData?.domainMetrics.authorityMetricsAvailable ?? false;

    if (backlinks.length === 0) {
      findings.push({
        id: createFindingId(this.definition.id, page.url),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Backlink quality analysis has no loaded backlink records for this audit.',
        recommendation: 'Load Bing, GSC export, or access-log backlink data to evaluate source quality and link risk.',
        evidence: backlinkError ?? 'No backlink records loaded.',
        documentationLink: this.definition.documentationLink,
      });
      return findings;
    }

    if (!metricsAvailable) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'limited-metrics'),
        ruleId: this.definition.id,
        severity: 'info',
        category: this.definition.category,
        url: page.url,
        message: 'Backlink source quality metrics are limited for current first-party sources.',
        recommendation: 'Use anchor distribution, referring-domain diversity, and manual spot checks for quality review. Authority scoring requires source-level quality metrics.',
        evidence: `Loaded ${backlinks.length} backlinks from ${backlinkData?.sources.join(', ')} without authority or spam metrics.`,
        documentationLink: this.definition.documentationLink,
      });
      return findings;
    }

    const riskyBacklinks = backlinks.filter(backlink => {
      const domainAuthority = backlink.domainAuthority ?? 100;
      const spamScore = backlink.spamScore ?? 0;
      return domainAuthority <= 15 || spamScore >= 50;
    });

    if (riskyBacklinks.length >= 3 || riskyBacklinks.length / backlinks.length >= 0.35) {
      findings.push({
        id: createFindingId(this.definition.id, page.url, 'risky-profile'),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: `${riskyBacklinks.length} backlinks show potentially low-authority or spam-heavy signals.`,
        recommendation: 'Review suspicious referring domains, audit anchor intent, and disavow only when manual review confirms manipulative link patterns.',
        evidence: riskyBacklinks
          .slice(0, 3)
          .map(backlink => `${backlink.sourceUrl} (DA ${backlink.domainAuthority ?? 'n/a'}, Spam ${backlink.spamScore ?? 'n/a'})`)
          .join(', '),
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}
