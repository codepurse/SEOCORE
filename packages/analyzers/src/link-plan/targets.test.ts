import { describe, it, expect } from 'vitest';
import { findOrphanPages, findPriorityPages, calculateTargetScore } from './targets.js';
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

describe('findOrphanPages', () => {
  it('finds pages with zero in-degree', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', inDegree: 0 })],
      ['https://example.com/b', makeFacts({ url: 'https://example.com/b', inDegree: 3 })],
    ]);
    const orphans = findOrphanPages(facts);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].url).toBe('https://example.com/a');
  });

  it('finds explicitly marked orphans', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', inDegree: 1, isOrphan: true })],
    ]);
    const orphans = findOrphanPages(facts);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reason).toContain('orphan');
  });
});

describe('findPriorityPages', () => {
  it('finds commercial pages not already orphaned', () => {
    const facts = new Map([
      ['https://example.com/products', makeFacts({ url: 'https://example.com/products', isCommercial: true, inDegree: 1 })],
      ['https://example.com/about', makeFacts({ url: 'https://example.com/about', inDegree: 5 })],
    ]);
    const orphans = findOrphanPages(facts);
    const priorities = findPriorityPages(facts, orphans);
    expect(priorities.some(p => p.url.includes('products'))).toBe(true);
  });

  it('excludes pages already in orphan list', () => {
    const facts = new Map([
      ['https://example.com/products', makeFacts({ url: 'https://example.com/products', isCommercial: true, inDegree: 0 })],
    ]);
    const orphans = findOrphanPages(facts);
    const priorities = findPriorityPages(facts, orphans);
    expect(priorities).toHaveLength(0);
  });
});

describe('calculateTargetScore', () => {
  it('penalizes utility pages', () => {
    const score = calculateTargetScore(makeFacts({ isUtility: true }));
    expect(score).toBeLessThan(0);
  });

  it('boosts orphans and commercial pages', () => {
    const orphan = calculateTargetScore(makeFacts({ isOrphan: true, inDegree: 0 }));
    const commercial = calculateTargetScore(makeFacts({ isCommercial: true }));
    const plain = calculateTargetScore(makeFacts());
    expect(orphan).toBeGreaterThan(plain);
    expect(commercial).toBeGreaterThan(plain);
  });
});
