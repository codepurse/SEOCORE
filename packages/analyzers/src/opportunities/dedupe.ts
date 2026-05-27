import type { SearchOpportunity } from './types.js';

export function deduplicateOpportunities(opportunities: SearchOpportunity[]): SearchOpportunity[] {
  const grouped = new Map<string, SearchOpportunity[]>();

  for (const opp of opportunities) {
    const key = `${opp.type}::${opp.url}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(opp);
  }

  const result: SearchOpportunity[] = [];

  for (const [key, opps] of grouped) {
    if (opps.length === 1) {
      result.push(opps[0]);
      continue;
    }

    // Collapse multiple opportunities of the same type for the same page
    const [type, url] = key.split('::');
    
    // Sort opps by score descending to treat the highest-score one as primary
    opps.sort((a, b) => b.score - a.score);
    const primary = opps[0];

    // Combine actions
    const actionsSet = new Set<string>();
    for (const opp of opps) {
      for (const action of opp.recommendedActions) {
        actionsSet.add(action);
      }
    }

    // Combine signals
    const signalsSet = new Set<string>();
    for (const opp of opps) {
      for (const sig of opp.sourceSignals) {
        signalsSet.add(sig);
      }
    }

    // Combine reasons
    let reason = primary.reason;
    if (opps.length > 1) {
      // E.g., combine into a higher-level summary
      reason = `${primary.reason} (And ${opps.length - 1} other ${type} finding(s) on this page)`;
    }

    // Merge supporting metrics
    const supportingMetrics: Record<string, number | string> = {};
    for (const opp of opps) {
      Object.assign(supportingMetrics, opp.supportingMetrics);
    }

    result.push({
      id: primary.id,
      url: primary.url,
      title: primary.title,
      type: primary.type as any,
      priority: primary.priority,
      score: primary.score,
      reason,
      supportingMetrics,
      recommendedActions: Array.from(actionsSet),
      sourceSignals: Array.from(signalsSet),
    });
  }

  return result;
}
