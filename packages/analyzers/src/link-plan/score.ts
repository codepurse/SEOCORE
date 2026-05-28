import { NormalizedPageFacts, LinkSuggestion } from './types.js';
import { RelevanceResult } from './relevance.js';

export function calculateSuggestionScore(
  source: NormalizedPageFacts,
  target: NormalizedPageFacts,
  relevance: RelevanceResult
): number {
  let score = 0;

  score += Math.min(25, source.authorityScore / 3);
  score += Math.min(15, source.inDegree / 2);

  if (target.isOrphan) score += 20;
  if (target.isCommercial) score += 10;
  score += Math.max(0, 8 - target.inDegree) * 2;
  score += Math.max(0, 5 - target.depth) * 1.5;

  score += relevance.score * 5;

  if (source.isUtility) score -= 30;
  if (target.isUtility) score -= 20;

  const saturationPenalty = Math.max(0, source.outDegree - 40) * 0.3;
  score -= saturationPenalty;

  return Math.max(0, Math.round(score * 10) / 10);
}

export function calculateConfidence(
  source: NormalizedPageFacts,
  target: NormalizedPageFacts,
  relevance: RelevanceResult
): number {
  let confidence = 40;

  if (source.authorityScore > 70) confidence += 20;
  else if (source.authorityScore > 40) confidence += 10;

  if (source.inDegree > 50) confidence += 15;
  else if (source.inDegree > 20) confidence += 10;

  if (!source.isUtility) confidence += 10;

  if (target.isOrphan) confidence += 15;
  if (target.isCommercial) confidence += 5;

  if (relevance.score > 2) confidence += 15;
  else if (relevance.score > 0.5) confidence += 8;

  if (relevance.signals.length >= 2) confidence += 5;

  return Math.min(100, Math.round(confidence));
}

export function sortSuggestions(suggestions: LinkSuggestion[]): LinkSuggestion[] {
  return [...suggestions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.confidence - a.confidence;
  });
}
