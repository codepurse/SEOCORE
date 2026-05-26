import type { NormalizedPage, SeoConfig } from '@seocore/sdk';
import { describe, expect, it } from 'vitest';
import { MissingMetaDescriptionRule } from './metadata/meta-description.js';
import { MissingTitleRule } from './metadata/title.js';
import { getCoreRules, shouldRun } from './rule-engine.js';

const baseConfig: SeoConfig = {
  preset: 'standard',
  concurrency: 1,
  maxDepth: 1,
  maxPages: 1,
  rateLimitMs: 0,
  retryCount: 0,
  playwrightEnabled: false,
  lighthouseEnabled: false,
  excludePatterns: [],
  includePatterns: [],
  ruleOverrides: {},
};

function createPage(overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url: 'https://example.com/',
    statusCode: 200,
    loadTimeMs: 100,
    contentType: 'text/html',
    title: 'Example title',
    metaDescription: 'Example meta description',
    canonical: 'https://example.com/',
    robotsMeta: 'index,follow',
    headings: {
      h1: ['Heading'],
      h2: [],
      h3: [],
    },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    ...overrides,
  };
}

describe('rules-core extraction', () => {
  it('returns only core-tagged rule instances', () => {
    const rules = getCoreRules();

    expect(rules).toHaveLength(20);
    expect(rules.map(rule => rule.definition.id)).toEqual([
      'missing-title',
      'duplicate-title',
      'missing-meta-description',
      'missing-h1',
      'multiple-h1',
      'missing-alt-text',
      'broken-links',
      'canonical-issues',
      'noindex-detection',
      'missing-structured-data',
      'missing-robots-txt',
      'missing-sitemap-xml',
      'orphan-page',
      'social-meta',
      'content-quality',
      'eeat-score',
      'internal-linking',
      'pagination-health',
      'internal-link-distribution',
      'duplicate-content-similarity',
    ]);
    expect(rules.every(rule => rule.definition.module === 'core')).toBe(true);
  });

  it('matches monolith title and meta-description behavior', async () => {
    const page = createPage({
      title: 'Short',
      metaDescription: 'Too short',
    });
    const context = {
      allPages: { [page.url]: page },
      config: baseConfig,
      dataSources: new Map(),
    };

    await expect(new MissingTitleRule().evaluate(page, context)).resolves.toEqual([]);
    await expect(new MissingMetaDescriptionRule().evaluate(page, context)).resolves.toEqual([]);
  });

  it('applies module, category, severity gating', () => {
    const titleRule = getCoreRules().find(rule => rule.definition.id === 'missing-title');
    const socialRule = getCoreRules().find(rule => rule.definition.id === 'social-meta');

    expect(titleRule).toBeDefined();
    expect(socialRule).toBeDefined();
    if (!titleRule || !socialRule) {
      throw new Error('Expected core rules to exist');
    }

    expect(
      shouldRun(titleRule, baseConfig, {
        modules: ['core'],
        categories: ['metadata'],
        minSeverity: 'critical',
      })
    ).toBe(true);

    expect(
      shouldRun(socialRule, baseConfig, {
        modules: ['core'],
        categories: ['metadata'],
        minSeverity: 'critical',
      })
    ).toBe(false);

    expect(
      shouldRun(titleRule, baseConfig, {
        modules: ['performance'],
      })
    ).toBe(false);
  });

  it('keeps eeat bridge dormant without eeat data source', async () => {
    const eeatRule = getCoreRules().find(rule => rule.definition.id === 'eeat-score');
    const page = createPage();
    const context = {
      allPages: { [page.url]: page },
      config: baseConfig,
      dataSources: new Map(),
    };

    await expect(eeatRule!.evaluate(page, context)).resolves.toEqual([]);
  });
});
