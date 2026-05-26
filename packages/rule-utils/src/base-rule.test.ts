import { describe, expect, it, vi } from 'vitest';
import type { NormalizedPage, RuleEvaluationContext, SeoConfig } from '@seocore/sdk';
import { BaseRule, type PartialFinding } from './base-rule.js';

function createPage(url = 'https://example.com/'): NormalizedPage {
  return {
    url,
    statusCode: 200,
    loadTimeMs: 120,
    contentType: 'text/html',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
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

class TestRule extends BaseRule {
  definition = {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'Used for BaseRule tests.',
    category: 'seo' as const,
    module: 'core' as const,
    defaultSeverity: 'warning' as const,
    defaultWeight: 5,
  };

  constructor(
    private readonly findingsFactory: () => Promise<PartialFinding[]>,
  ) {
    super();
  }

  protected check(): Promise<PartialFinding[]> {
    return this.findingsFactory();
  }
}

describe('BaseRule', () => {
  it('returns [] for disabled rules without calling check()', async () => {
    const checkSpy = vi.fn<() => Promise<PartialFinding[]>>().mockResolvedValue([
      {
        url: 'https://example.com/',
        message: 'Should not run',
        recommendation: 'Should not run',
      },
    ]);
    const rule = new TestRule(checkSpy);

    const findings = await rule.evaluate(
      createPage(),
      createContext(
        createConfig({
          'test-rule': { enabled: false },
        }),
      ),
    );

    expect(findings).toEqual([]);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('returns [] when check() yields no findings', async () => {
    const rule = new TestRule(async () => []);

    const findings = await rule.evaluate(createPage(), createContext(createConfig()));

    expect(findings).toEqual([]);
  });

  it('resolves severity as subCheck override, then finding severity, then rule severity', async () => {
    const rule = new TestRule(async () => [
      {
        url: 'https://example.com/',
        subCheck: 'sub-check',
        severity: 'info',
        message: 'Has override',
        recommendation: 'Use override',
      },
      {
        url: 'https://example.com/finding',
        severity: 'info',
        message: 'Uses finding severity',
        recommendation: 'Use finding severity',
      },
      {
        url: 'https://example.com/rule',
        message: 'Uses rule severity',
        recommendation: 'Use rule severity',
      },
    ]);

    const findings = await rule.evaluate(
      createPage(),
      createContext(
        createConfig({
          'test-rule': {
            severity: 'error',
            findingSeverityOverrides: {
              'test-rule:sub-check': 'critical',
            },
          },
        }),
      ),
    );

    expect(findings.map((finding) => finding.severity)).toEqual(['critical', 'info', 'error']);
  });

  it('matches rule-id scoped severity overrides deterministically', async () => {
    const rule = new TestRule(async () => [
      {
        url: 'https://example.com/',
        subCheck: 'missing-viewport',
        message: 'Scoped override test',
        recommendation: 'Scoped override test',
      },
    ]);

    const findings = await rule.evaluate(
      createPage(),
      createContext(
        createConfig({
          'test-rule': {
            findingSeverityOverrides: {
              'test-rule:missing-viewport': 'error',
            },
          },
        }),
      ),
    );

    expect(findings[0].severity).toBe('error');
  });

  it('creates deterministic IDs for same ruleId, url, and subCheck', async () => {
    const rule = new TestRule(async () => [
      {
        url: 'https://example.com/',
        subCheck: 'deterministic',
        message: 'Stable id',
        recommendation: 'Stable id',
      },
    ]);
    const context = createContext(createConfig());

    const first = await rule.evaluate(createPage(), context);
    const second = await rule.evaluate(createPage(), context);

    expect(first[0].id).toBe(second[0].id);
  });

  it('always uses definition category when finalizing findings', async () => {
    const rule = new TestRule(async () => [
      {
        url: 'https://example.com/',
        message: 'Category finalization',
        recommendation: 'Category finalization',
      },
    ]);

    const findings = await rule.evaluate(createPage(), createContext(createConfig()));

    expect(findings[0].category).toBe('seo');
    expect(findings[0].documentationLink).toBeUndefined();
    expect(findings[0].subCheck).toBeUndefined();
  });
});
