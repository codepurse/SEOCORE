import { NormalizedPage, Finding } from '@seocore/sdk';
import type { SearchOpportunity, NormalizedGscPageMetrics } from './types.js';
import { calculateOpportunityScore } from './score.js';

export function findMetadataOpportunities(
  pages: Record<string, NormalizedPage>,
  findings: Finding[],
  gscData: Map<string, NormalizedGscPageMetrics>
): SearchOpportunity[] {
  const opportunities: SearchOpportunity[] = [];

  const metadataFindings = findings.filter(f =>
    f.category === 'metadata' &&
    (f.severity === 'error' || f.severity === 'critical')
  );

  const pagesByIssue = new Map<string, Finding[]>();
  for (const f of metadataFindings) {
    if (!pagesByIssue.has(f.url)) {
      pagesByIssue.set(f.url, []);
    }
    pagesByIssue.get(f.url)!.push(f);
  }

  for (const [pageUrl, pageFindings] of pagesByIssue) {
    const page = pages[pageUrl];
    const gsc = gscData.get(pageUrl);

    // CTR-based opportunity logic
    const impressions = gsc ? gsc.impressions : 0;
    const ctr = gsc ? gsc.ctr : 0;
    const clicks = gsc ? gsc.clicks : 0;
    const position = gsc ? gsc.position : undefined;

    const hasHighImpressions = impressions > 1000;
    const hasLowCtr = ctr < 0.02 && impressions > 200; // Low CTR (< 2%) on visible page

    // High priority trigger
    const isCTRBoosted = hasHighImpressions && hasLowCtr;
    
    // Determine highest severity in metadata findings
    let highestSeverity: 'critical' | 'error' | 'warning' | 'info' = 'error';
    if (pageFindings.some(f => f.severity === 'critical')) {
      highestSeverity = 'critical';
    }

    const scoreResult = calculateOpportunityScore({
      type: 'metadata',
      highestSeverity,
      depth: page?.depth,
      url: pageUrl,
      hasGsc: !!gsc,
      impressions,
      position,
      clicks,
    });

    let finalScore = scoreResult.score;
    let finalPriority = scoreResult.priority;
    const sourceSignals = [...scoreResult.signals];

    if (isCTRBoosted) {
      // Boost score and priority due to high impressions and low CTR
      finalScore = Math.min(100, finalScore + 15);
      if (finalScore >= 70) finalPriority = 'high';
      sourceSignals.push('CTR Boost: high impressions with sub-2% CTR indicates title/meta could improve CTR');
    }

    const metrics: Record<string, number | string> = {};
    if (gsc) {
      metrics.impressions = impressions;
      metrics.clicks = clicks;
      metrics.ctr = `${(ctr * 100).toFixed(1)}%`;
      metrics.position = position !== undefined ? position.toFixed(1) : 'N/A';
    }

    // Determine reason
    let reason = '';
    if (isCTRBoosted) {
      reason = `High visibility page (${impressions} impressions) has very low CTR (${(ctr * 100).toFixed(1)}%). Optimizing title/description is highly likely to boost clicks.`;
    } else if (hasHighImpressions) {
      reason = `Page has ${impressions} impressions but has metadata issues affecting click-through rate.`;
    } else {
      reason = `Page has metadata issue(s) (${pageFindings.length}) that may hurt search visibility or click-through rates.`;
    }

    opportunities.push({
      id: `metadata-${sanitizeId(pageUrl)}`,
      url: pageUrl,
      title: page?.title,
      type: 'metadata',
      priority: finalPriority,
      score: finalScore,
      reason,
      supportingMetrics: metrics,
      recommendedActions: generateMetadataActions(pageFindings),
      sourceSignals,
    });
  }

  return opportunities;
}

function generateMetadataActions(findings: Finding[]): string[] {
  const actions: string[] = [];
  const issueTypes = new Set(findings.map(f => f.ruleId));

  if (issueTypes.has('missing-title') || issueTypes.has('empty-title')) {
    actions.push('Add unique, descriptive title tag (50-60 characters)');
  }
  if (issueTypes.has('missing-meta-description') || issueTypes.has('empty-meta-description')) {
    actions.push('Add compelling meta description (120-160 characters)');
  }
  if (issueTypes.has('title-length')) {
    actions.push('Adjust title length to 50-60 characters for full display');
  }
  if (issueTypes.has('meta-description-length')) {
    actions.push('Adjust meta description to 120-160 characters');
  }

  if (actions.length === 0) {
    actions.push('Review and fix metadata issues per findings');
  }

  return actions;
}

function sanitizeId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
}
