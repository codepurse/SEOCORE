import { describe, expect, it } from 'vitest';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { OpportunitiesAnalyzer, PageSearchData, loadGscFile, loadCruxFile } from '../opportunities.js';
import * as path from 'node:path';

describe('Search Opportunities Integration', () => {
  it('runs opportunities analysis using heuristics and loaded fixture metrics', async () => {
    // 1. Setup simulated crawl results (mocking the engine run isn't needed if we use simple test inputs,
    // but we can directly invoke the analyzer with simulated pages and findings)
    const pages = {
      'https://example.com/': {
        url: 'https://example.com/',
        statusCode: 200,
        loadTimeMs: 150,
        contentType: 'text/html',
        headings: { h1: ['Welcome'], h2: [], h3: [] },
        links: [
          { url: 'https://example.com/product/xyz', text: 'Product XYZ', isInternal: true }
        ],
        images: [],
        hreflang: [],
        structuredData: [],
        depth: 0,
      },
      'https://example.com/product/xyz': {
        url: 'https://example.com/product/xyz',
        statusCode: 200,
        loadTimeMs: 4000,
        contentType: 'text/html',
        headings: { h1: ['Product XYZ'], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
        depth: 1,
      },
      'https://example.com/blog/orphan': {
        url: 'https://example.com/blog/orphan',
        statusCode: 200,
        loadTimeMs: 200,
        contentType: 'text/html',
        headings: { h1: ['Orphan Blog'], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
        depth: 2,
        isOrphan: true,
        inDegree: 0,
      }
    };

    const findings = [
      {
        id: 'missing-meta-description:1',
        ruleId: 'missing-meta-description',
        severity: 'error' as const,
        category: 'metadata' as const,
        url: 'https://example.com/',
        message: 'Meta description is missing',
        recommendation: 'Add meta description',
      },
      {
        id: 'slow-lcp:2',
        ruleId: 'slow-lcp',
        severity: 'critical' as const,
        category: 'performance' as const,
        url: 'https://example.com/product/xyz',
        message: 'LCP exceeds 4s threshold',
        recommendation: 'Optimize hero images and preloads',
      }
    ];

    const analyzer = new OpportunitiesAnalyzer();

    // 2. Load fixtures
    const gscPath = path.join(__dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'opportunities-gsc.json');
    const cruxPath = path.join(__dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'opportunities-crux.json');

    const gscLoader = loadGscFile(gscPath);
    expect(gscLoader.error).toBeUndefined();
    expect(gscLoader.data).toHaveLength(3);

    const cruxLoader = loadCruxFile(cruxPath);
    expect(cruxLoader.error).toBeUndefined();
    expect(cruxLoader.data).toHaveLength(1);

    // 3. Populate analyzer and evaluate
    const gscPageData: PageSearchData[] = gscLoader.data.map(d => ({ url: d.url, gsc: d }));
    const cruxPageData: PageSearchData[] = cruxLoader.data.map(d => ({ url: d.url, crux: d }));

    analyzer.setGscData(gscPageData);
    analyzer.setCruxData(cruxPageData);

    const result = analyzer.analyze(pages as any, findings, 'https://example.com/');

    expect(result.dataSource).toBe('gsc+crux');
    expect(result.scannedPages).toBe(3);
    expect(result.enrichedPages).toBe(3);

    // 4. Assert ranking results are correct and deterministic
    const opps = result.opportunities;
    expect(opps.length).toBeGreaterThanOrEqual(3);

    // Verify metadata opportunity is highly ranked due to CTR boost
    const metaOpp = opps.find(o => o.type === 'metadata');
    expect(metaOpp).toBeDefined();
    expect(metaOpp!.priority).toBe('high');
    expect(metaOpp!.score).toBeGreaterThanOrEqual(70);

    // Verify performance opportunity uses CrUX and gets prioritized
    const perfOpp = opps.find(o => o.type === 'performance');
    expect(perfOpp).toBeDefined();
    expect(perfOpp!.priority).toBe('high'); // boosted as product and crux slow
    expect(perfOpp!.supportingMetrics.source).toBe('CrUX (Field)');

    // Verify orphan page link opportunity
    const linkOpp = opps.find(o => o.type === 'internal-links');
    expect(linkOpp).toBeDefined();
    expect(linkOpp!.priority).toBe('high'); // orphan with impressions
  });
});
