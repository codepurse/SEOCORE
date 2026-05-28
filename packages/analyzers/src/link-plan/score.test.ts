import { describe, it, expect } from 'vitest';
import { calculateSuggestionScore, calculateConfidence, sortSuggestions } from './score.js';
import { NormalizedPageFacts, LinkSuggestion } from './types.js';
import { RelevanceResult } from './relevance.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('calculateSuggestionScore', () => {
  it('is deterministic for same input', () => {
    const source = makeFacts({ authorityScore: 50, inDegree: 10 });
    const target = makeFacts({ isOrphan: true, inDegree: 0 });
    const rel: RelevanceResult = { score: 1, signals: ['shared title'] };
    const s1 = calculateSuggestionScore(source, target, rel);
    const s2 = calculateSuggestionScore(source, target, rel);
    expect(s1).toBe(s2);
  });

  it('higher for orphan targets', () => {
    const source = makeFacts({ authorityScore: 30 });
    const orphan = makeFacts({ isOrphan: true, inDegree: 0 });
    const normal = makeFacts({ isOrphan: false, inDegree: 5 });
    const rel: RelevanceResult = { score: 0, signals: [] };
    expect(calculateSuggestionScore(source, orphan, rel)).toBeGreaterThan(calculateSuggestionScore(source, normal, rel));
  });
});

describe('calculateConfidence', () => {
  it('caps at 100', () => {
    const source = makeFacts({ authorityScore: 100, inDegree: 100 });
    const target = makeFacts({ isOrphan: true, isCommercial: true });
    const rel: RelevanceResult = { score: 5, signals: ['a', 'b', 'c'] };
    expect(calculateConfidence(source, target, rel)).toBe(100);
  });

  it('is at least 40 for basic inputs', () => {
    const source = makeFacts();
    const target = makeFacts();
    const rel: RelevanceResult = { score: 0, signals: [] };
    expect(calculateConfidence(source, target, rel)).toBeGreaterThanOrEqual(40);
  });
});

describe('sortSuggestions', () => {
  it('sorts by score descending, then confidence', () => {
    const suggestions: LinkSuggestion[] = [
      { sourceUrl: 'a', targetUrl: 'b', anchorTheme: '', confidence: 50, score: 10, reason: '', sourceSignals: [] },
      { sourceUrl: 'c', targetUrl: 'd', anchorTheme: '', confidence: 80, score: 20, reason: '', sourceSignals: [] },
      { sourceUrl: 'e', targetUrl: 'f', anchorTheme: '', confidence: 60, score: 20, reason: '', sourceSignals: [] },
    ];
    const sorted = sortSuggestions(suggestions);
    expect(sorted[0].sourceUrl).toBe('c');
    expect(sorted[1].sourceUrl).toBe('e');
    expect(sorted[2].sourceUrl).toBe('a');
  });
});
