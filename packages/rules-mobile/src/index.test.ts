import { describe, expect, it } from 'vitest';
import type { NormalizedPage, RuleEvaluationContext, SeoConfig } from '@seocore/sdk';
import { createFindingId } from '@seocore/rule-utils';
import { getMobileRules, MobileUsabilityRule } from './index.js';
import { MOBILE_SUBCHECKS } from './sub-checks.js';

function createPage(overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url: 'https://example.com/',
    statusCode: 200,
    loadTimeMs: 120,
    contentType: 'text/html',
    html: '<html><head></head><body></body></html>',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    ...overrides,
  };
}

function createConfig(ruleOverrides: SeoConfig['ruleOverrides'] = {}): SeoConfig {
  return {
    preset: 'standard',
    concurrency: 3,
    maxDepth: 3,
    maxPages: 10,
    rateLimitMs: 0,
    retryCount: 0,
    playwrightEnabled: false,
    lighthouseEnabled: false,
    excludePatterns: [],
    includePatterns: [],
    ruleOverrides,
  };
}

function createContext(config: SeoConfig): RuleEvaluationContext {
  return {
    allPages: {},
    config,
    dataSources: new Map(),
  };
}

describe('@seocore/rules-mobile', () => {
  it('returns four extracted mobile rules', () => {
    expect(getMobileRules().map((rule) => rule.definition.id)).toEqual([
      'mobile-usability',
      'mobile-performance',
      'mobile-responsive',
      'mobile-indexing',
    ]);
  });

  it('emits typed sub-check values for mobile usability findings', async () => {
    const rule = new MobileUsabilityRule();
    const findings = await rule.evaluate(createPage(), createContext(createConfig()));
    const missingViewport = findings.find(
      (finding) => finding.subCheck === MOBILE_SUBCHECKS.usability.MISSING_VIEWPORT,
    );

    expect(missingViewport).toBeDefined();
    expect(missingViewport).toMatchObject({
      ruleId: 'mobile-usability',
      subCheck: MOBILE_SUBCHECKS.usability.MISSING_VIEWPORT,
      severity: 'critical',
      message: 'Viewport meta tag is missing from the page.',
    });
    expect(missingViewport?.id).toBe(
      createFindingId(
        'mobile-usability',
        'https://example.com/',
        MOBILE_SUBCHECKS.usability.MISSING_VIEWPORT,
      ),
    );
  });
});
