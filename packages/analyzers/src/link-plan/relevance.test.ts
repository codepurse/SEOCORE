import { describe, it, expect } from 'vitest';
import { calculateRelevance } from './relevance.js';
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

describe('calculateRelevance', () => {
  it('detects title overlap', () => {
    const source = makeFacts({ title: 'Best SEO Tools for 2024' });
    const target = makeFacts({ title: 'SEO Tools Comparison Guide' });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('shared title term');
  });

  it('detects H1 overlap', () => {
    const source = makeFacts({ h1: ['Digital Marketing Strategies'] });
    const target = makeFacts({ h1: ['Marketing Strategies for Startups'] });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('shared H1 term');
  });

  it('detects URL segment overlap', () => {
    const source = makeFacts({ url: 'https://example.com/blog/seo-tips' });
    const target = makeFacts({ url: 'https://example.com/blog/content-marketing' });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('shared path segment');
  });

  it('returns low score for unrelated pages', () => {
    const source = makeFacts({ url: 'https://carshop.com/repair', title: 'Car Repair', h1: ['Auto Shop'] });
    const target = makeFacts({ url: 'https://gardenworld.com/tips', title: 'Gardening Tips', h1: ['Plants'] });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeLessThan(1);
  });
});
