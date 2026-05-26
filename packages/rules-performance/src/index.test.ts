import type { RuleEvaluationContext } from '@seocore/sdk';
import { describe, expect, it } from 'vitest';

import { ResourceSizeRule, getPerformanceRules } from './index.js';

describe('getPerformanceRules', () => {
  it('returns six performance-module rules', () => {
    const rules = getPerformanceRules();

    expect(rules).toHaveLength(6);
    expect(rules.map((rule) => rule.definition.id)).toEqual([
      'low-performance-score',
      'lcp-metric',
      'cls-metric',
      'heavy-resources',
      'caching-headers',
      'image-optimization',
    ]);
    expect(rules.every((rule) => rule.definition.module === 'performance')).toBe(true);
  });

  it('preserves resource-size branch subChecks', async () => {
    const rule = new ResourceSizeRule();
    const page = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      resources: {
        pageSizeBytes: 160000,
        jsSizeBytes: 600000,
        cssSizeBytes: 0,
        imageSizeBytes: 0,
        otherSizeBytes: 0,
        jsRequests: 0,
        cssRequests: 0,
        imageRequests: 0,
        totalRequests: 60,
      },
    };
    const context = {
      allPages: { [page.url]: page },
      config: { ruleOverrides: {} },
      dataSources: new Map(),
    } as RuleEvaluationContext;

    const findings = await rule.evaluate(page, context);

    expect(findings.map((finding) => [finding.subCheck, finding.severity])).toEqual([
      ['html-size', 'warning'],
      ['js-size', 'warning'],
      ['request-count', 'info'],
    ]);
  });
});
