import { NormalizedPage, Finding } from '@seocore/sdk';
import type { SearchOpportunity, NormalizedGscPageMetrics, NormalizedCruxPageMetrics } from './types.js';
import { calculateOpportunityScore } from './score.js';

export function findPerformanceOpportunities(
  pages: Record<string, NormalizedPage>,
  findings: Finding[],
  gscData: Map<string, NormalizedGscPageMetrics>,
  cruxData: Map<string, NormalizedCruxPageMetrics>
): SearchOpportunity[] {
  const opportunities: SearchOpportunity[] = [];

  const performanceFindings = findings.filter(f =>
    f.category === 'performance' &&
    (f.severity === 'error' || f.severity === 'critical')
  );

  // Group by page URL
  const pagesByIssue = new Map<string, Finding[]>();
  for (const f of performanceFindings) {
    if (!pagesByIssue.has(f.url)) {
      pagesByIssue.set(f.url, []);
    }
    pagesByIssue.get(f.url)!.push(f);
  }

  for (const [pageUrl, pageFindings] of pagesByIssue) {
    const page = pages[pageUrl];
    const crux = cruxData.get(pageUrl);
    const gsc = gscData.get(pageUrl);

    const impressions = gsc ? gsc.impressions : 0;
    const position = gsc ? gsc.position : undefined;
    const clicks = gsc ? gsc.clicks : 0;

    // High-prioritize performance issues ONLY on visible / important pages
    const isVisibleOrImportant = (gsc && (impressions > 500 || (position !== undefined && position < 20))) ||
                                  (pageUrl.includes('/product') || pageUrl.includes('/service') || pageUrl.includes('/pricing'));

    let highestSeverity: 'critical' | 'error' | 'warning' | 'info' = 'error';
    if (pageFindings.some(f => f.severity === 'critical')) {
      highestSeverity = 'critical';
    }

    const scoreResult = calculateOpportunityScore({
      type: 'performance',
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

    if (crux) {
      sourceSignals.push('Field Data: using CrUX metrics from actual user experience');
    } else if (page?.coreWebVitals) {
      sourceSignals.push('Lab Data: using synthetic Lighthouse/heuristic metrics');
    }

    if (isVisibleOrImportant) {
      sourceSignals.push('Visibility Boost: performance issues prioritized due to high traffic or page importance');
      // If score is too low, we elevate it
      if (finalScore < 60) {
        finalScore = Math.min(100, finalScore + 15);
      }
      if (finalScore >= 70) {
        finalPriority = 'high';
      }
    } else {
      // Degrade priority for non-important/low-visibility pages
      if (finalPriority === 'high') {
        finalPriority = 'medium';
      }
      sourceSignals.push('Performance priority restricted: page lacks search visibility / commercial indicators');
    }

    const metrics: Record<string, number | string> = {};
    if (crux) {
      metrics.source = 'CrUX (Field)';
      if (crux.lcp !== undefined) metrics.lcp = `${(crux.lcp / 1000).toFixed(2)}s`;
      if (crux.cls !== undefined) metrics.cls = crux.cls.toFixed(3);
      if (crux.inp !== undefined) metrics.inp = `${crux.inp}ms`;
    } else if (page?.coreWebVitals) {
      metrics.source = 'Lab Heuristic';
      if (page.coreWebVitals.lcp !== undefined) metrics.lcp = `${(page.coreWebVitals.lcp / 1000).toFixed(2)}s`;
      if (page.coreWebVitals.cls !== undefined) metrics.cls = page.coreWebVitals.cls.toFixed(3);
      if (page.coreWebVitals.inp !== undefined) metrics.inp = `${page.coreWebVitals.inp}ms`;
    }

    if (gsc) {
      metrics.impressions = impressions;
      metrics.position = position !== undefined ? position.toFixed(1) : 'N/A';
    }

    const reason = crux
      ? `Real users are experiencing slow load times (LCP: ${metrics.lcp || 'N/A'}, CLS: ${metrics.cls || 'N/A'}) on this page.`
      : `Slow page load times or heavy resource payloads detected on this page.`;

    const recommendedActions = pageFindings.map(f => f.recommendation);

    opportunities.push({
      id: `perf-${sanitizeId(pageUrl)}`,
      url: pageUrl,
      title: page?.title,
      type: 'performance',
      priority: finalPriority,
      score: finalScore,
      reason,
      supportingMetrics: metrics,
      recommendedActions: recommendedActions.length > 0 ? recommendedActions : ['Optimize images and reduce Javascript bundle sizes'],
      sourceSignals,
    });
  }

  return opportunities;
}

function sanitizeId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
}
