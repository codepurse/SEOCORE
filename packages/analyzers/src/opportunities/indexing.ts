import { NormalizedPage, Finding } from '@seocore/sdk';
import type { SearchOpportunity, NormalizedGscPageMetrics } from './types.js';
import { calculateOpportunityScore } from './score.js';

export function findIndexingOpportunities(
  pages: Record<string, NormalizedPage>,
  findings: Finding[],
  gscData: Map<string, NormalizedGscPageMetrics>
): SearchOpportunity[] {
  const opportunities: SearchOpportunity[] = [];

  const indexingFindings = findings.filter(f =>
    f.category === 'indexing' &&
    (f.severity === 'error' || f.severity === 'critical')
  );

  const pagesByIssue = new Map<string, Finding[]>();
  for (const f of indexingFindings) {
    if (!pagesByIssue.has(f.url)) {
      pagesByIssue.set(f.url, []);
    }
    pagesByIssue.get(f.url)!.push(f);
  }

  for (const [pageUrl, pageFindings] of pagesByIssue) {
    const page = pages[pageUrl];
    const gsc = gscData.get(pageUrl);

    // Suppress low-value utility pages when appropriate
    const lowercaseUrl = pageUrl.toLowerCase();
    const isUtilityPage = lowercaseUrl.includes('/login') ||
                          lowercaseUrl.includes('/logout') ||
                          lowercaseUrl.includes('/register') ||
                          lowercaseUrl.includes('/admin') ||
                          lowercaseUrl.includes('/api/') ||
                          lowercaseUrl.includes('/search?') ||
                          lowercaseUrl.includes('/cdn-cgi/') ||
                          (page && page.depth !== undefined && page.depth >= 4);

    if (isUtilityPage) {
      continue; // Skip utility pages to avoid noise
    }

    const impressions = gsc ? gsc.impressions : 0;
    const position = gsc ? gsc.position : undefined;
    const clicks = gsc ? gsc.clicks : 0;

    const hasStrongVisibility = gsc && (impressions > 100 || (position !== undefined && position < 20));
    const hasStrategicDepth = page && page.depth !== undefined && page.depth <= 1;

    let highestSeverity: 'critical' | 'error' | 'warning' | 'info' = 'error';
    if (pageFindings.some(f => f.severity === 'critical')) {
      highestSeverity = 'critical';
    }

    const scoreResult = calculateOpportunityScore({
      type: 'indexing',
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

    if (hasStrongVisibility) {
      finalScore = Math.min(100, finalScore + 15);
      sourceSignals.push('Strong Visibility Boost: page ranks on search results but has indexing blockages');
      if (finalScore >= 70) finalPriority = 'high';
    } else if (hasStrategicDepth) {
      finalScore = Math.min(100, finalScore + 5);
      sourceSignals.push('Strategic Depth Boost: page is close to home page and should be crawl-efficient');
      if (finalScore >= 70) finalPriority = 'high';
    }

    const metrics: Record<string, number | string> = {};
    if (gsc) {
      metrics.impressions = impressions;
      metrics.position = position !== undefined ? position.toFixed(1) : 'N/A';
    }

    const reason = hasStrongVisibility
      ? `Page has strong visibility on search results (position ${position?.toFixed(1)}) but has indexing/crawling blocker findings.`
      : `Indexing findings detected which could prevent or limit search engines from crawling or indexing this page properly.`;

    opportunities.push({
      id: `indexing-${sanitizeId(pageUrl)}`,
      url: pageUrl,
      title: page?.title,
      type: 'indexing',
      priority: finalPriority,
      score: finalScore,
      reason,
      supportingMetrics: metrics,
      recommendedActions: generateIndexingActions(pageFindings),
      sourceSignals,
    });
  }

  return opportunities;
}

function generateIndexingActions(findings: Finding[]): string[] {
  const actions: string[] = [];
  const issueTypes = new Set(findings.map(f => f.ruleId));

  if (issueTypes.has('missing-canonical') || issueTypes.has('canonical-mismatch')) {
    actions.push('Add or fix canonical tag to point to preferred URL');
  }
  if (issueTypes.has('noindex')) {
    actions.push('Remove noindex directive if page should be indexed');
  }
  if (issueTypes.has('blocked-robots')) {
    actions.push('Check robots.txt and remove disallow if blocking needed pages');
  }

  if (actions.length === 0) {
    actions.push('Review indexing directives (canonical, robots meta, hreflang)');
  }

  return actions;
}

function sanitizeId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
}
