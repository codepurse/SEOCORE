import { describe, expect, it } from 'vitest';
import {
  AnchorTextOverOptimizationRule,
  LowAuthorityBacklinksRule,
  MissingBacklinkDataRule,
} from './index';
import { BacklinkIntelligenceData, NormalizedPage, SeoConfig } from '@seocore/sdk';

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

describe('Backlink intelligence rules', () => {
  it('suppresses missing-data finding when backlink sources are loaded', async () => {
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

    const findings = await rule.evaluate(homepage, {
      allPages: { [homepage.url]: homepage },
      config: {
        ...baseConfig,
        backlinks: {
          provider: 'custom',
          gsc: { exportPath: 'links.csv' },
        },
      },
      backlinkData,
    });

    expect(findings).toEqual([]);
  });

  it('flags over-optimized anchors from external backlink data', async () => {
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

    const findings = await rule.evaluate(homepage, {
      allPages: { [homepage.url]: homepage },
      config: baseConfig,
      backlinkData,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('Backlink anchor text');
  });

  it('reports limited quality metrics for first-party backlink sources', async () => {
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
      backlinkData,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].message).toContain('quality metrics are limited');
  });
});
