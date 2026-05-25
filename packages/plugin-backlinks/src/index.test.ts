import { describe, expect, it } from 'vitest';
import { createBacklinkPlugin, MissingBacklinkDataRule, AnchorTextOverOptimizationRule, LowAuthorityBacklinksRule } from './index.js';
import { BacklinkIntelligenceData, NormalizedPage, SeoConfig, RuleEvaluationContext, DataSource } from '@seocore/sdk';

const baseConfig: SeoConfig = {
  preset: 'standard',
  concurrency: 3,
  maxDepth: 3,
  maxPages: 10,
  rateLimitMs: 0,
  retryCount: 0,
  playwrightEnabled: false,
  excludePatterns: [],
  includePatterns: [],
  ruleOverrides: {},
};

const homepage: NormalizedPage = {
  url: 'https://example.com/',
  statusCode: 200,
  loadTimeMs: 100,
  contentType: 'text/html',
  headings: { h1: [], h2: [], h3: [] },
  links: [],
  images: [],
  hreflang: [],
  structuredData: [],
};

describe('Backlink intelligence rules with dataSources Map', () => {
  it('suppresses missing-data finding when backlinks DataSource status is ok', async () => {
    const rule = new MissingBacklinkDataRule();
    const backlinkData: BacklinkIntelligenceData = {
      backlinks: [],
      domainMetrics: {
        totalBacklinks: 0,
        sourceCount: 1,
        authorityMetricsAvailable: false,
      },
      sources: ['gsc'],
    };

    const dataSources = new Map<string, DataSource>();
    dataSources.set('backlinks', { status: 'ok', data: backlinkData });

    const findings = await rule.evaluate(homepage, {
      allPages: { [homepage.url]: homepage },
      config: {
        ...baseConfig,
        backlinks: {
          provider: 'custom',
          gsc: { exportPath: 'links.csv' },
        },
      },
      dataSources,
    });

    expect(findings).toEqual([]);
  });

  it('flags over-optimized anchors from backlinks DataSource', async () => {
    const rule = new AnchorTextOverOptimizationRule();
    const backlinkData: BacklinkIntelligenceData = {
      backlinks: [
        { sourceUrl: 'https://a.example.com/', targetUrl: homepage.url, anchorText: 'best seo agency' },
        { sourceUrl: 'https://b.example.com/', targetUrl: homepage.url, anchorText: 'best seo agency' },
        { sourceUrl: 'https://c.example.com/', targetUrl: homepage.url, anchorText: 'best seo agency' },
        { sourceUrl: 'https://d.example.com/', targetUrl: homepage.url, anchorText: 'best seo agency' },
      ],
      domainMetrics: {
        totalBacklinks: 4,
        sourceCount: 1,
        authorityMetricsAvailable: false,
      },
      sources: ['gsc'],
    };

    const dataSources = new Map<string, DataSource>();
    dataSources.set('backlinks', { status: 'ok', data: backlinkData });

    const findings = await rule.evaluate(homepage, {
      allPages: { [homepage.url]: homepage },
      config: baseConfig,
      dataSources,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('Backlink anchor text');
  });

  it('reports limited quality metrics for first-party backlink sources from backlinks DataSource', async () => {
    const rule = new LowAuthorityBacklinksRule();
    const backlinkData: BacklinkIntelligenceData = {
      backlinks: [
        { sourceUrl: 'https://news.example.com/post', targetUrl: homepage.url, anchorText: 'brand mention' },
      ],
      domainMetrics: {
        totalBacklinks: 1,
        sourceCount: 2,
        authorityMetricsAvailable: false,
      },
      sources: ['gsc', 'logs'],
    };

    const dataSources = new Map<string, DataSource>();
    dataSources.set('backlinks', { status: 'ok', data: backlinkData });

    const findings = await rule.evaluate(homepage, {
      allPages: { [homepage.url]: homepage },
      config: {
        ...baseConfig,
        backlinks: {
          provider: 'custom',
          gsc: { exportPath: 'links.csv' },
          logs: { paths: ['access.log'] },
        },
      },
      dataSources,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].message).toContain('quality metrics are limited');
  });

  it('emits not-configured finding without crash when backlinks config is missing', async () => {
    const rule = new MissingBacklinkDataRule();
    const dataSources = new Map<string, DataSource>();
    dataSources.set('backlinks', { status: 'not-configured' });

    const findings = await rule.evaluate(homepage, {
      allPages: { [homepage.url]: homepage },
      config: baseConfig,
      dataSources,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('running without configured');
  });
});

describe('BacklinkPlugin', () => {
  it('populates dataSources map during onBeforeAnalysis', async () => {
    const plugin = createBacklinkPlugin();
    const dataSources = new Map<string, DataSource>();
    
    // Test not configured
    if (plugin.lifecycle?.onBeforeAnalysis) {
      const ctx = {
        startUrl: 'https://example.com/',
        config: baseConfig,
        dataSources,
      };
      await plugin.lifecycle.onBeforeAnalysis({ [homepage.url]: homepage }, ctx as any);
      expect(dataSources.get('backlinks')!.status).toBe('not-configured');
    }
  });
});
