import { NormalizedPageFacts, PlannedTarget } from './types.js';

export function findOrphanPages(facts: Map<string, NormalizedPageFacts>): PlannedTarget[] {
  const orphans: PlannedTarget[] = [];

  for (const [url, page] of facts) {
    if (page.isOrphan || page.inDegree === 0) {
      const reason = page.inDegree === 0
        ? 'No incoming links from other crawled pages'
        : 'Marked as orphan by crawler';

      orphans.push({
        url,
        title: page.title,
        depth: page.depth,
        inDegree: page.inDegree,
        isOrphan: true,
        reason,
        score: calculateTargetScore(page),
      });
    }
  }

  return orphans.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function findPriorityPages(
  facts: Map<string, NormalizedPageFacts>,
  orphanPages: PlannedTarget[]
): PlannedTarget[] {
  const orphanSet = new Set(orphanPages.map(o => o.url));
  const priorityUrls = new Set<string>();

  for (const [url, page] of facts) {
    if (page.isCommercial) {
      priorityUrls.add(url);
    }
    if (page.hasStructuredData) {
      priorityUrls.add(url);
    }
  }

  const priorities: PlannedTarget[] = [];

  for (const url of priorityUrls) {
    if (orphanSet.has(url)) continue;
    const page = facts.get(url);
    if (!page) continue;

    const score = calculateTargetScore(page);
    if (score <= 0) continue;

    priorities.push({
      url,
      title: page.title,
      depth: page.depth,
      inDegree: page.inDegree,
      isOrphan: false,
      reason: page.isCommercial
        ? 'Commercial URL pattern detected'
        : 'Contains structured data for important entity type',
      score,
    });
  }

  return priorities.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function calculateTargetScore(page: NormalizedPageFacts): number {
  if (page.isUtility) return -10;

  let score = 0;

  if (page.isOrphan) score += 25;
  if (page.isCommercial) score += 15;
  if (page.hasStructuredData) score += 8;
  score += Math.max(0, 10 - page.depth) * 2;
  score += Math.max(0, 5 - page.inDegree) * 3;

  return score;
}
