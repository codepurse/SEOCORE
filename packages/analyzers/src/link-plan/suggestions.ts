import { NormalizedPageFacts, PlannedTarget, LinkSuggestion, SuggestionOptions, HubSummary } from './types.js';
import { calculateRelevance } from './relevance.js';
import { inferAnchorTheme, inferAnchorText } from './anchors.js';
import { calculateSuggestionScore, calculateConfidence, sortSuggestions } from './score.js';
import { rankSourcesForTarget } from './sources.js';

export function generateLinkSuggestions(
  facts: Map<string, NormalizedPageFacts>,
  orphanPages: PlannedTarget[],
  priorityPages: PlannedTarget[],
  hubs: HubSummary[],
  options: SuggestionOptions = {}
): LinkSuggestion[] {
  const {
    maxSuggestions = 50,
    maxSuggestionsPerTarget = 5,
    maxSuggestionsPerSource = 10,
    minConfidence = 0,
  } = options;

  const suggestions: LinkSuggestion[] = [];
  const seenPairs = new Set<string>();
  const sourceSuggestionCount = new Map<string, number>();

  const hubSet = new Set(hubs.map(h => h.url));

  for (const orphan of orphanPages.slice(0, 20)) {
    const orphanFacts = facts.get(orphan.url);
    if (!orphanFacts) continue;

    const existingLinks = getOutboundInternalLinks(orphanFacts);
    const sources = rankSourcesForTarget(orphanFacts, facts, existingLinks);

    let targetCount = 0;
    for (const { url: sourceUrl } of sources) {
      if (targetCount >= maxSuggestionsPerTarget) break;

      const pairKey = `${sourceUrl}|${orphan.url}`;
      if (seenPairs.has(pairKey)) continue;

      const sourceFacts = facts.get(sourceUrl);
      if (!sourceFacts) continue;

      if (sourceAlreadyLinksToTarget(sourceFacts, orphan.url)) continue;

      const relevance = calculateRelevance(sourceFacts, orphanFacts);
      if (relevance.score < 0.1 && !hubSet.has(sourceUrl)) continue;

      const score = calculateSuggestionScore(sourceFacts, orphanFacts, relevance);
      const confidence = calculateConfidence(sourceFacts, orphanFacts, relevance);

      if (confidence < minConfidence) continue;
      if ((sourceSuggestionCount.get(sourceUrl) || 0) >= maxSuggestionsPerSource) continue;

      seenPairs.add(pairKey);
      targetCount++;
      sourceSuggestionCount.set(sourceUrl, (sourceSuggestionCount.get(sourceUrl) || 0) + 1);

      suggestions.push({
        sourceUrl,
        sourceTitle: sourceFacts.title,
        targetUrl: orphan.url,
        targetTitle: orphan.title,
        anchorText: inferAnchorText(orphan.url, orphan.title),
        anchorTheme: inferAnchorTheme(orphan.url, orphan.title),
        confidence,
        score,
        reason: buildReason(sourceFacts, orphanFacts),
        sourceSignals: relevance.signals,
      });
    }
  }

  for (const priority of priorityPages.slice(0, 15)) {
    const priorityFacts = facts.get(priority.url);
    if (!priorityFacts) continue;
    if (priority.inDegree >= 3) continue;

    const existingLinks = getOutboundInternalLinks(priorityFacts);
    const sources = rankSourcesForTarget(priorityFacts, facts, existingLinks);

    let targetCount = 0;
    for (const { url: sourceUrl } of sources) {
      if (targetCount >= maxSuggestionsPerTarget) break;

      const pairKey = `${sourceUrl}|${priority.url}`;
      if (seenPairs.has(pairKey)) continue;

      const sourceFacts = facts.get(sourceUrl);
      if (!sourceFacts) continue;

      if (sourceAlreadyLinksToTarget(sourceFacts, priority.url)) continue;

      const relevance = calculateRelevance(sourceFacts, priorityFacts);
      if (relevance.score < 0.1) continue;

      const score = calculateSuggestionScore(sourceFacts, priorityFacts, relevance);
      const confidence = calculateConfidence(sourceFacts, priorityFacts, relevance);

      if (confidence < minConfidence) continue;
      if ((sourceSuggestionCount.get(sourceUrl) || 0) >= maxSuggestionsPerSource) continue;

      seenPairs.add(pairKey);
      targetCount++;
      sourceSuggestionCount.set(sourceUrl, (sourceSuggestionCount.get(sourceUrl) || 0) + 1);

      suggestions.push({
        sourceUrl,
        sourceTitle: sourceFacts.title,
        targetUrl: priority.url,
        targetTitle: priority.title,
        anchorText: inferAnchorText(priority.url, priority.title),
        anchorTheme: inferAnchorTheme(priority.url, priority.title),
        confidence,
        score,
        reason: buildReason(sourceFacts, priorityFacts),
        sourceSignals: relevance.signals,
      });
    }
  }

  return sortSuggestions(suggestions).slice(0, maxSuggestions);
}

function getOutboundInternalLinks(facts: NormalizedPageFacts): Set<string> {
  const targets = new Set<string>();
  for (const link of facts.links) {
    if (link.isInternal) {
      targets.add(link.url);
    }
  }
  return targets;
}

function sourceAlreadyLinksToTarget(source: NormalizedPageFacts, targetUrl: string): boolean {
  for (const link of source.links) {
    if (link.isInternal && link.url === targetUrl) {
      return true;
    }
  }
  return false;
}

function buildReason(source: NormalizedPageFacts, target: NormalizedPageFacts): string {
  const parts: string[] = [];

  if (source.authorityScore > 50) parts.push('High authority');
  else if (source.authorityScore > 20) parts.push('Good authority');

  parts.push(`page (${source.inDegree} in-links)`);

  if (target.isOrphan) parts.push('linking to orphan page');
  else if (target.isCommercial) parts.push('linking to underlinked commercial page');
  else parts.push('linking to priority page');

  return parts.join(' ');
}
