import { NormalizedPage } from '@seocore/sdk';
import type { SearchOpportunity, NormalizedGscPageMetrics } from './types.js';
import { calculateOpportunityScore } from './score.js';

export function findInternalLinkOpportunities(
  pages: Record<string, NormalizedPage>,
  gscData: Map<string, NormalizedGscPageMetrics>
): SearchOpportunity[] {
  const opportunities: SearchOpportunity[] = [];

  const orphanPages = Object.entries(pages)
    .filter(([, page]) => page.isOrphan || (page.inDegree || 0) === 0)
    .map(([url, page]) => ({ url, page }));

  for (const { url, page } of orphanPages) {
    // Avoid over-prioritizing clearly low-value utility pages
    const lowercaseUrl = url.toLowerCase();
    const isUtilityPage = lowercaseUrl.includes('/login') ||
                          lowercaseUrl.includes('/logout') ||
                          lowercaseUrl.includes('/register') ||
                          lowercaseUrl.includes('/admin') ||
                          lowercaseUrl.includes('/api/') ||
                          lowercaseUrl.includes('/search?') ||
                          lowercaseUrl.includes('/cdn-cgi/');

    if (isUtilityPage) {
      continue; // Skip utility pages to avoid noise
    }

    const gsc = gscData.get(url);
    const impressions = gsc ? gsc.impressions : 0;
    const position = gsc ? gsc.position : undefined;
    const clicks = gsc ? gsc.clicks : 0;

    // Promote orphan pages with impressions / traffic signals
    const isHighValueOrphan = gsc && impressions > 100;

    const scoreResult = calculateOpportunityScore({
      type: 'internal-links',
      highestSeverity: undefined, // orphan is heuristic severity
      depth: page.depth,
      url,
      hasGsc: !!gsc,
      impressions,
      position,
      clicks,
    });

    let finalScore = scoreResult.score;
    let finalPriority = scoreResult.priority;
    const sourceSignals = [...scoreResult.signals];

    if (isHighValueOrphan) {
      finalScore = Math.min(100, finalScore + 20);
      if (finalScore >= 70) finalPriority = 'high';
      sourceSignals.push('High-Value Orphan Boost: orphan page has search visibility, linking it will boost performance');
    }

    const metrics: Record<string, number | string> = {
      isOrphan: 'true',
      inDegree: page.inDegree || 0,
      depth: page.depth !== undefined ? page.depth : 'N/A',
    };

    if (page.authorityScore !== undefined) {
      metrics.authorityScore = page.authorityScore;
    }

    if (gsc) {
      metrics.impressions = impressions;
      metrics.position = position !== undefined ? position.toFixed(1) : 'N/A';
    }

    const reason = isHighValueOrphan
      ? `High-value orphan page has search visibility (${impressions} impressions) but has zero internal crawler-accessible links pointing to it.`
      : `Orphan page has no internal incoming links, making it hard for crawlers and users to discover.`;

    opportunities.push({
      id: `links-${sanitizeId(url)}`,
      url,
      title: page.title,
      type: 'internal-links',
      priority: finalPriority,
      score: finalScore,
      reason,
      supportingMetrics: metrics,
      recommendedActions: [
        'Add links from relevant high-authority pages',
        'Include in sitemap.xml with adequate priority',
        'Consider adding to navigation if commercially important',
      ],
      sourceSignals,
    });
  }

  return opportunities;
}

function sanitizeId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
}
