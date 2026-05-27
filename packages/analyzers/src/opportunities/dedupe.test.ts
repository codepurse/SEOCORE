import { describe, expect, it } from 'vitest';
import { deduplicateOpportunities } from './dedupe.js';
import { SearchOpportunity } from './types.js';

describe('Opportunities Deduplication', () => {
  it('collapses multiple opportunities of same type and page', () => {
    const raw: SearchOpportunity[] = [
      {
        id: 'metadata-page1-title',
        url: 'https://example.com/page1',
        title: 'Page 1',
        type: 'metadata',
        priority: 'medium',
        score: 55,
        reason: 'Title issue',
        supportingMetrics: { impressions: 100 },
        recommendedActions: ['Fix title'],
        sourceSignals: ['Signal A']
      },
      {
        id: 'metadata-page1-desc',
        url: 'https://example.com/page1',
        title: 'Page 1',
        type: 'metadata',
        priority: 'high',
        score: 75,
        reason: 'Desc issue',
        supportingMetrics: { clicks: 5 },
        recommendedActions: ['Fix description', 'Fix title'],
        sourceSignals: ['Signal B']
      }
    ];

    const collapsed = deduplicateOpportunities(raw);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].priority).toBe('high');
    expect(collapsed[0].score).toBe(75);
    expect(collapsed[0].recommendedActions).toContain('Fix title');
    expect(collapsed[0].recommendedActions).toContain('Fix description');
    expect(collapsed[0].sourceSignals).toContain('Signal A');
    expect(collapsed[0].sourceSignals).toContain('Signal B');
    expect(collapsed[0].supportingMetrics).toEqual({ impressions: 100, clicks: 5 });
  });
});
