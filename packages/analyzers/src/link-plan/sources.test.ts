import { describe, it, expect } from 'vitest';
import { findHubs, calculateSourceScore, rankSourcesForTarget } from './sources.js';
import { NormalizedPageFacts } from './types.js';

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

describe('findHubs', () => {
  it('finds pages with high out-degree', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({ url: 'https://example.com/hub', outDegree: 10, authorityScore: 60 })],
      ['https://example.com/leaf', makeFacts({ url: 'https://example.com/leaf', outDegree: 1 })],
    ]);
    const hubs = findHubs(facts);
    expect(hubs.some(h => h.url.includes('hub'))).toBe(true);
    expect(hubs.some(h => h.url.includes('leaf'))).toBe(false);
  });

  it('excludes utility pages', () => {
    const facts = new Map([
      ['https://example.com/login', makeFacts({ url: 'https://example.com/login', outDegree: 10, isUtility: true })],
    ]);
    const hubs = findHubs(facts);
    expect(hubs).toHaveLength(0);
  });
});

describe('calculateSourceScore', () => {
  it('penalizes utility pages heavily', () => {
    const score = calculateSourceScore(makeFacts({ isUtility: true, authorityScore: 100 }));
    expect(score).toBeLessThan(0);
  });

  it('rewards authority and in-degree', () => {
    const low = calculateSourceScore(makeFacts({ authorityScore: 10, inDegree: 2 }));
    const high = calculateSourceScore(makeFacts({ authorityScore: 90, inDegree: 30 }));
    expect(high).toBeGreaterThan(low);
  });
});

describe('rankSourcesForTarget', () => {
  it('excludes self and excluded URLs', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', authorityScore: 50 })],
      ['https://example.com/b', makeFacts({ url: 'https://example.com/b', authorityScore: 30 })],
    ]);
    const target = makeFacts({ url: 'https://example.com/a' });
    const ranked = rankSourcesForTarget(target, facts, new Set());
    expect(ranked.some(r => r.url === 'https://example.com/a')).toBe(false);
    expect(ranked[0].url).toBe('https://example.com/b');
  });
});
