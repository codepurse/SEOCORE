import { NormalizedPage, Finding } from '@seocore/sdk';
import type { SearchOpportunity, NormalizedGscPageMetrics } from './types.js';
import { calculateOpportunityScore } from './score.js';

export function findContentOpportunities(
  pages: Record<string, NormalizedPage>,
  findings: Finding[],
  gscData: Map<string, NormalizedGscPageMetrics>
): SearchOpportunity[] {
  const opportunities: SearchOpportunity[] = [];

  // Identify content-related findings:
  // - thin content (word count)
  // - duplicate or low quality content
  // - missing or poor headings/H1 structure
  const contentFindings = findings.filter(f => {
    const rId = f.ruleId.toLowerCase();
    const msg = f.message.toLowerCase();
    return (
      rId.includes('thin') ||
      rId.includes('content') ||
      rId.includes('word-count') ||
      rId.includes('duplicate') ||
      rId.includes('heading') ||
      rId.includes('h1') ||
      msg.includes('content') ||
      msg.includes('word count') ||
      msg.includes('thin text')
    );
  });

  const pagesByIssue = new Map<string, Finding[]>();
  for (const f of contentFindings) {
    if (!pagesByIssue.has(f.url)) {
      pagesByIssue.set(f.url, []);
    }
    pagesByIssue.get(f.url)!.push(f);
  }

  for (const [pageUrl, pageFindings] of pagesByIssue) {
    const page = pages[pageUrl];
    const gsc = gscData.get(pageUrl);

    const impressions = gsc ? gsc.impressions : 0;
    const position = gsc ? gsc.position : undefined;
    const clicks = gsc ? gsc.clicks : 0;
    const ctr = gsc ? gsc.ctr : 0;

    // Combine low CTR + ranking visibility + weak content signals
    const isRankingWell = position !== undefined && position < 15;
    const hasLowCtr = ctr < 0.015 && impressions > 300;
    const hasContentIntentMismatch = isRankingWell && hasLowCtr;

    const isThinContent = pageFindings.some(f => f.ruleId.includes('thin') || f.ruleId.includes('word-count'));

    let highestSeverity: 'critical' | 'error' | 'warning' | 'info' = 'error';
    if (pageFindings.some(f => f.severity === 'critical')) {
      highestSeverity = 'critical';
    }

    const scoreResult = calculateOpportunityScore({
      type: 'content',
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

    if (hasContentIntentMismatch) {
      finalScore = Math.min(100, finalScore + 15);
      if (finalScore >= 70) finalPriority = 'high';
      sourceSignals.push('Intent Mismatch Boost: ranks well but low CTR suggests content/meta does not answer search query');
    }

    if (isThinContent && impressions > 500) {
      finalScore = Math.min(100, finalScore + 10);
      if (finalScore >= 70) finalPriority = 'high';
      sourceSignals.push('Thin Content Visibility Boost: high impressions but low content depth');
    }

    const metrics: Record<string, number | string> = {};
    if (gsc) {
      metrics.impressions = impressions;
      metrics.position = position !== undefined ? position.toFixed(1) : 'N/A';
      metrics.ctr = `${(ctr * 100).toFixed(1)}%`;
    }

    // Determine reason
    let reason = '';
    if (hasContentIntentMismatch) {
      reason = `Page ranks in top results (position ${position?.toFixed(1)}) but has a low CTR (${(ctr * 100).toFixed(1)}%). Content may not fully satisfy user search intent.`;
    } else if (isThinContent) {
      reason = `Page has thin content or low word count. Expanding depth and value will improve organic ranking capacity.`;
    } else {
      reason = `Content quality or heading hierarchy issues detected that limit search presence and page value.`;
    }

    const recommendedActions = generateContentActions(pageFindings);

    opportunities.push({
      id: `content-${sanitizeId(pageUrl)}`,
      url: pageUrl,
      title: page?.title,
      type: 'content',
      priority: finalPriority,
      score: finalScore,
      reason,
      supportingMetrics: metrics,
      recommendedActions,
      sourceSignals,
    });
  }

  return opportunities;
}

function generateContentActions(findings: Finding[]): string[] {
  const actions: string[] = [];
  const issueTypes = Array.from(new Set(findings.map(f => f.ruleId)));

  if (issueTypes.some(id => id.includes('thin') || id.includes('word-count'))) {
    actions.push('Expand content depth with comprehensive information, FAQs, and explanations');
  }
  if (issueTypes.some(id => id.includes('duplicate'))) {
    actions.push('Rewrite duplicate sections to ensure unique, original value on this page');
  }
  if (issueTypes.some(id => id.includes('heading') || id.includes('h1'))) {
    actions.push('Fix heading hierarchy (ensure exactly one H1 and proper nesting of H2/H3 tags)');
  }

  if (actions.length === 0) {
    actions.push('Review content depth and comprehensiveness');
    actions.push('Ensure content matches target keyword intent');
    actions.push('Add supporting media (images, videos, tables)');
  }

  return actions;
}

function sanitizeId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
}
