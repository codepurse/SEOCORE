import { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage, BacklinkIntelligenceData } from '@seocore/sdk';
import { createFindingId, getRuleSettings, hasConfiguredBacklinkSources, getPrimaryBacklinkPage } from '@seocore/rules';

export class MissingBacklinkDataRule implements Rule {
  definition: RuleDefinition = {
    id: 'missing-backlink-data',
    name: 'Missing Backlink Intelligence Data',
    description: 'Alerts when external backlink data sources are not configured, falling back to mock analysis mode.',
    category: 'backlink_intelligence',
    defaultSeverity: 'info',
    defaultWeight: 2,
    documentationLink: 'https://seocore.dev/docs/rules/missing-backlink-data',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!getPrimaryBacklinkPage(page, context)) {
      return [];
    }

    const backlinksDS = context.dataSources?.get('backlinks');
    const backlinkData = (backlinksDS?.data as BacklinkIntelligenceData) ?? context.backlinkData;
    const backlinkError = backlinksDS?.status === 'error' ? backlinksDS.error : context.backlinkError;

    if (backlinkData && backlinkData.sources.length > 0) {
      return [];
    }

    if (backlinkError) {
      return [
        {
          id: createFindingId(this.definition.id, page.url, 'source-error'),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Backlink intelligence source configured, but audit could not load data.',
          recommendation: 'Check Bing credentials, verified site URL, GSC export path, and log file paths. Then rerun audit.',
          evidence: backlinkError,
          documentationLink: this.definition.documentationLink,
        }
      ];
    }

    if (backlinksDS?.status === 'not-configured' || !hasConfiguredBacklinkSources(context.config)) {
      return [
        {
          id: createFindingId(this.definition.id, page.url),
          ruleId: this.definition.id,
          severity,
          category: this.definition.category,
          url: page.url,
          message: 'Backlink intelligence running without configured Bing, GSC export, or access-log sources.',
          recommendation: 'Configure Bing Webmaster data, import a GSC links export, or point SEOCORE at access logs for first-party backlink coverage.',
          evidence: 'No backlink source configured.',
          documentationLink: this.definition.documentationLink,
        }
      ];
    }

    return [];
  }
}
