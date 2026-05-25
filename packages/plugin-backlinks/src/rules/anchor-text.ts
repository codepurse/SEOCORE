import { Rule, RuleDefinition, RuleEvaluationContext, Finding, NormalizedPage, BacklinkIntelligenceData } from '@seocore/sdk';
import { createFindingId, getRuleSettings, getPrimaryBacklinkPage } from '@seocore/rules';

export class AnchorTextOverOptimizationRule implements Rule {
  definition: RuleDefinition = {
    id: 'anchor-text-over-optimization',
    name: 'Potential Anchor Text Over-Optimization',
    description: 'Evaluates anchor text distribution and alerts on potential over-optimization patterns.',
    category: 'backlink_intelligence',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/anchor-text-over-optimization',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    if (!getPrimaryBacklinkPage(page, context)) {
      return [];
    }

    const backlinksDS = context.dataSources?.get('backlinks');
    const backlinkData = (backlinksDS?.data as BacklinkIntelligenceData) ?? context.backlinkData;

    const findings: Finding[] = [];
    const anchorTextCounts: Record<string, number> = {};

    if ((backlinkData?.backlinks.length ?? 0) > 0) {
      for (const backlink of backlinkData!.backlinks) {
        const anchor = backlink.anchorText.toLowerCase().trim();
        if (anchor.length === 0) continue;
        anchorTextCounts[anchor] = (anchorTextCounts[anchor] || 0) + 1;
      }
    } else {
      const internalLinks = page.links.filter(link => link.isInternal);
      internalLinks.forEach(link => {
        const anchor = link.text.toLowerCase().trim();
        if (anchor.length > 0) {
          anchorTextCounts[anchor] = (anchorTextCounts[anchor] || 0) + 1;
        }
      });
    }

    const totalAnchors = Object.values(anchorTextCounts).reduce((sum, count) => sum + count, 0);
    const overusedAnchors = Object.entries(anchorTextCounts)
      .filter(([_, count]) => count >= 4 || (totalAnchors > 0 && count / totalAnchors >= 0.5));

    if (overusedAnchors.length > 0) {
      const usingExternalData = (backlinkData?.backlinks.length ?? 0) > 0;
      findings.push({
        id: createFindingId(this.definition.id, page.url),
        ruleId: this.definition.id,
        severity,
        category: this.definition.category,
        url: page.url,
        message: `${usingExternalData ? 'Backlink' : 'Internal'} anchor text shows potential overuse of ${overusedAnchors.length} phrases.`,
        recommendation: 'Diversify your anchor text distribution to avoid appearing manipulative. Use natural, branded, and partial-match anchors.',
        evidence: `Overused anchors (${usingExternalData ? 'backlinks' : 'internal links'}): ${overusedAnchors.slice(0, 3).map(([text, count]) => `"${text}" (${count}x)`).join(', ')}`,
        documentationLink: this.definition.documentationLink,
      });
    }

    return findings;
  }
}
