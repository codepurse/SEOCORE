import { describe, it, expect } from 'vitest';
import { generateLinkSuggestions } from './suggestions.js';
import { NormalizedPageFacts, PlannedTarget, HubSummary } from './types.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    title: 'Page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('generateLinkSuggestions', () => {
  it('suggests links from hubs to orphans', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({
        url: 'https://example.com/hub', title: 'Main Hub',
        authorityScore: 60, inDegree: 20, outDegree: 15,
        h1: ['SEO Guide'],
      })],
      ['https://example.com/orphan', makeFacts({
        url: 'https://example.com/orphan', title: 'SEO Tips',
        inDegree: 0, isOrphan: true,
        h1: ['SEO Tips'],
      })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', title: 'SEO Tips', depth: 2, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const priorities: PlannedTarget[] = [];
    const hubs: HubSummary[] = [{ url: 'https://example.com/hub', outDegree: 15, inDegree: 20, authorityScore: 60 }];

    const suggestions = generateLinkSuggestions(facts, orphans, priorities, hubs);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].sourceUrl).toBe('https://example.com/hub');
    expect(suggestions[0].targetUrl).toBe('https://example.com/orphan');
  });

  it('does not suggest self-links', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', inDegree: 0, isOrphan: true })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/a', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const suggestions = generateLinkSuggestions(facts, orphans, [], []);
    expect(suggestions).toHaveLength(0);
  });

  it('does not suggest duplicate source->target pairs', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({ url: 'https://example.com/hub', authorityScore: 60, inDegree: 20, outDegree: 10 })],
      ['https://example.com/orphan', makeFacts({ url: 'https://example.com/orphan', inDegree: 0, isOrphan: true })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const hubs: HubSummary[] = [{ url: 'https://example.com/hub', outDegree: 10, inDegree: 20, authorityScore: 60 }];

    const s1 = generateLinkSuggestions(facts, orphans, [], hubs);
    const s2 = generateLinkSuggestions(facts, orphans, [], hubs);
    expect(s1.length).toBe(s2.length);
  });

  it('suppresses existing links', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({
        url: 'https://example.com/hub', authorityScore: 60, inDegree: 20, outDegree: 10,
        links: [{ url: 'https://example.com/orphan', text: 'Link', isInternal: true }],
      })],
      ['https://example.com/orphan', makeFacts({ url: 'https://example.com/orphan', inDegree: 0, isOrphan: true })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const hubs: HubSummary[] = [{ url: 'https://example.com/hub', outDegree: 10, inDegree: 20, authorityScore: 60 }];

    const suggestions = generateLinkSuggestions(facts, orphans, [], hubs);
    expect(suggestions.some(s => s.sourceUrl === 'https://example.com/hub' && s.targetUrl === 'https://example.com/orphan')).toBe(false);
  });

  it('respects maxSuggestionsPerTarget', () => {
    const facts = new Map<string, NormalizedPageFacts>();
    for (let i = 0; i < 10; i++) {
      facts.set(`https://example.com/source${i}`, makeFacts({
        url: `https://example.com/source${i}`,
        title: `Source ${i}`,
        authorityScore: 50, inDegree: 10,
        h1: ['Topic'],
      }));
    }
    facts.set('https://example.com/orphan', makeFacts({
      url: 'https://example.com/orphan', title: 'Orphan',
      inDegree: 0, isOrphan: true,
      h1: ['Topic'],
    }));

    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const suggestions = generateLinkSuggestions(facts, orphans, [], [], { maxSuggestionsPerTarget: 3 });
    const forOrphan = suggestions.filter(s => s.targetUrl === 'https://example.com/orphan');
    expect(forOrphan.length).toBeLessThanOrEqual(3);
  });
});
