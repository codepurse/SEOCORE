import { describe, expect, it } from 'vitest';
import { calculateOpportunityScore } from './score.js';

describe('Opportunity Score Calculator', () => {
  it('assigns high score to high-impressions metadata issues', () => {
    const result = calculateOpportunityScore({
      type: 'metadata',
      highestSeverity: 'error',
      depth: 1,
      url: 'https://example.com/product/xyz',
      hasGsc: true,
      impressions: 5000,
      position: 12,
      clicks: 10
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.priority).toBe('high');
    expect(result.signals).toContain('Ease of fix: metadata is simple to update (+10)');
  });

  it('assigns medium score to heuristic-only performance issues', () => {
    const result = calculateOpportunityScore({
      type: 'performance',
      highestSeverity: 'error',
      depth: 2,
      url: 'https://example.com/some-page',
      hasGsc: false
    });

    expect(result.score).toBeLessThan(70);
    expect(result.signals).toContain('Confidence: heuristics only (0.8x penalty)');
  });
});
