import { describe, it, expect } from 'vitest';
import {
  JsImpactReportSchema,
  JsImpactDiffSchema,
  RecommendationSchema,
  type JsImpactReport,
  type JsImpactDiff,
  type JsImpactAspect,
} from './js-impact.js';

describe('JsImpact Zod schemas', () => {
  const validDiff: JsImpactDiff = {
    id: 'abc123',
    aspect: 'content.wordCount',
    severity: 'high',
    confidence: 'certain',
    title: 'Word count dropped significantly',
    description: 'Rendered page has 30% fewer words than raw HTML.',
    raw: 1200,
    rendered: 800,
    delta: -400,
    evidence: ['Raw: 1200 words', 'Rendered: 800 words'],
  };

  const validReport: JsImpactReport = {
    url: 'https://example.com',
    checkedAt: new Date().toISOString(),
    render: {
      strategy: 'csr',
      framework: 'React (CSR)',
      frameworkConfidence: 85,
      waitEvent: 'networkidle',
      waitExtraMs: 1500,
      timings: {
        rawFetchMs: 450,
        renderTotalMs: 3200,
        domContentLoadedMs: 800,
        loadEventMs: 1200,
        networkIdleMs: 3000,
      },
      bytes: { raw: 15000, rendered: 45000, deltaPct: 200 },
      consoleErrors: [],
      failedRequests: [],
    },
    diffs: [validDiff],
    blockedResources: [],
    score: {
      overall: 65,
      indexability: 100,
      contentParity: 40,
      metadataParity: 100,
      structuredDataParity: 100,
      crawlability: 100,
      reasoning: ['Content parity low due to CSR hydration'],
    },
    summary: { critical: 0, high: 1, medium: 0, low: 0 },
    recommendations: [
      {
        id: 'rec-1',
        priority: 1,
        title: 'Migrate to SSR',
        rationale: 'CSR causes content to be invisible to crawlers.',
        action: 'Use getServerSideProps or SSG.',
        relatedAspects: ['content.wordCount'],
        frameworkSpecific: 'Next.js',
      },
    ],
  };

  it('validates a complete JsImpactReport', () => {
    const result = JsImpactReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it('validates a JsImpactDiff', () => {
    const result = JsImpactDiffSchema.safeParse(validDiff);
    expect(result.success).toBe(true);
  });

  it('validates a Recommendation', () => {
    const rec = validReport.recommendations[0];
    const result = RecommendationSchema.safeParse(rec);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid severity', () => {
    const bad = { ...validDiff, severity: 'urgent' };
    const result = JsImpactDiffSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid aspect', () => {
    const bad = { ...validDiff, aspect: 'content.missing' as JsImpactAspect };
    const result = JsImpactDiffSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a negative score', () => {
    const bad = {
      ...validReport,
      score: { ...validReport.score, overall: -5 },
    };
    const result = JsImpactReportSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a score above 100', () => {
    const bad = {
      ...validReport,
      score: { ...validReport.score, overall: 105 },
    };
    const result = JsImpactReportSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts all valid aspects', () => {
    const aspects: JsImpactAspect[] = [
      'indexability.canonical',
      'indexability.metaRobots',
      'indexability.xRobotsTag',
      'content.wordCount',
      'content.mainTextMissing',
      'metadata.title',
      'metadata.metaDescription',
      'metadata.openGraph',
      'metadata.twitter',
      'headings.h1',
      'headings.set',
      'links.internal',
      'links.external',
      'links.onlyInRendered',
      'images.src',
      'images.alt',
      'structuredData.jsonLd',
      'hreflang',
      'jsErrors',
      'resourceBlocked',
    ];
    for (const aspect of aspects) {
      const diff = { ...validDiff, aspect };
      const result = JsImpactDiffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional raw/rendered fields as strings', () => {
    const diff: JsImpactDiff = {
      ...validDiff,
      raw: 'Old Title',
      rendered: 'New Title',
      delta: undefined,
    };
    const result = JsImpactDiffSchema.safeParse(diff);
    expect(result.success).toBe(true);
  });

  it('accepts optional raw/rendered fields as string arrays', () => {
    const diff: JsImpactDiff = {
      ...validDiff,
      raw: ['h1-a'],
      rendered: ['h1-a', 'h1-b'],
      delta: 1,
    };
    const result = JsImpactDiffSchema.safeParse(diff);
    expect(result.success).toBe(true);
  });
});
