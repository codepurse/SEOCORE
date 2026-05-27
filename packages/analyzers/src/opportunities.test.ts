import { describe, expect, it } from 'vitest';
import { OpportunitiesAnalyzer } from './opportunities.js';
import type { NormalizedPage, Finding } from '@seocore/sdk';

function makePage(url: string, overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url,
    statusCode: 200,
    loadTimeMs: 120,
    contentType: 'text/html; charset=utf-8',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    ...overrides
  };
}

describe('OpportunitiesAnalyzer', () => {
  it('analyzes opportunities with heuristics only', () => {
    const analyzer = new OpportunitiesAnalyzer();
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/': makePage('https://example.com/'),
      'https://example.com/page1': makePage('https://example.com/page1'),
    };
    const findings: Finding[] = [
      {
        id: 'missing-title:1',
        ruleId: 'missing-title',
        severity: 'error',
        category: 'metadata',
        url: 'https://example.com/page1',
        message: 'Title is missing',
        recommendation: 'Add title',
      }
    ];

    const result = analyzer.analyze(pages, findings, 'https://example.com/');
    expect(result.url).toBe('https://example.com/');
    expect(result.dataSource).toBe('heuristics');
    expect(result.opportunities).toHaveLength(3);
    expect(result.opportunities.map(o => o.type)).toContain('metadata');
  });

  it('analyzes opportunities with GSC metrics', () => {
    const analyzer = new OpportunitiesAnalyzer();
    analyzer.setGscData([
      {
        url: 'https://example.com/page1',
        gsc: { impressions: 1500, clicks: 10, ctr: 0.01, position: 5 }
      }
    ]);

    const pages: Record<string, NormalizedPage> = {
      'https://example.com/page1': makePage('https://example.com/page1'),
    };
    const findings: Finding[] = [
      {
        id: 'missing-title:1',
        ruleId: 'missing-title',
        severity: 'error',
        category: 'metadata',
        url: 'https://example.com/page1',
        message: 'Title is missing',
        recommendation: 'Add title',
      }
    ];

    const result = analyzer.analyze(pages, findings, 'https://example.com/');
    expect(result.dataSource).toBe('gsc');
    expect(result.opportunities[0].priority).toBe('high');
    expect(result.opportunities[0].supportingMetrics.impressions).toBe(1500);
  });
});
