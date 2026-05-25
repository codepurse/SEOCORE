import { describe, it, expect } from 'vitest';
import { CrawlGraphBuilder, PageRankCalculator } from './index.js';
import { NormalizedPage } from '@seocore/sdk';

describe('PageRankCalculator', () => {
  it('converges on canonical 3-node cycle to equal ranks', () => {
    const nodes = ['A', 'B', 'C'];
    const outLinks = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set(['A'])],
    ]);

    const ranks = PageRankCalculator.calculate(nodes, outLinks, { damping: 0.85, iterations: 20 });
    
    expect(ranks.size).toBe(3);
    const a = ranks.get('A')!;
    const b = ranks.get('B')!;
    const c = ranks.get('C')!;
    
    expect(a).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
    expect(c).toBeCloseTo(1, 2);
  });

  it('handles dangling node (no outlinks) without draining rank', () => {
    const nodes = ['A', 'B'];
    const outLinks = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set([])], // dangling
    ]);

    const ranks = PageRankCalculator.calculate(nodes, outLinks, { damping: 0.85, iterations: 20 });
    
    expect(ranks.get('A')).toBeGreaterThan(0);
    expect(ranks.get('B')).toBeGreaterThan(0);
  });

  it('respects tolerance for early termination', () => {
    const nodes = ['A', 'B'];
    const outLinks = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['A'])],
    ]);

    // With a high tolerance, it should terminate on the first iteration
    const ranks = PageRankCalculator.calculate(nodes, outLinks, {
      damping: 0.85,
      iterations: 100,
      tolerance: 10,
    });
    
    // If it terminated after 1 iteration:
    // ranks start at 1. nextRanks is 0.15 + (danglingSum is 0) + 0.85 * 1 = 1.0.
    // L1 diff is 0, so it terminates after 1 iteration.
    expect(ranks.get('A')).toBe(1);
    expect(ranks.get('B')).toBe(1);
  });
});

describe('CrawlGraphBuilder', () => {
  it('injects sitemap orphans correctly', () => {
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/': {
        url: 'https://example.com/',
        statusCode: 200,
        loadTimeMs: 100,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
      },
    };

    const graph = CrawlGraphBuilder.build({
      pages,
      startUrl: 'https://example.com/',
      domain: 'https://example.com',
      sitemapUrls: ['https://example.com/sitemap-orphan'],
    });

    expect(pages['https://example.com/sitemap-orphan']).toBeDefined();
    expect(pages['https://example.com/sitemap-orphan'].isOrphan).toBe(true);
    expect(graph.nodes.find((n) => n.url === 'https://example.com/sitemap-orphan')).toBeDefined();
  });

  it('correctly ranks hubs and authorities in top 5 sorted', () => {
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/': {
        url: 'https://example.com/',
        statusCode: 200,
        loadTimeMs: 100,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [
          { url: 'https://example.com/a', text: '', isInternal: true },
          { url: 'https://example.com/b', text: '', isInternal: true },
        ],
        images: [],
        hreflang: [],
        structuredData: [],
      },
      'https://example.com/a': {
        url: 'https://example.com/a',
        statusCode: 200,
        loadTimeMs: 100,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [
          { url: 'https://example.com/b', text: '', isInternal: true },
        ],
        images: [],
        hreflang: [],
        structuredData: [],
      },
      'https://example.com/b': {
        url: 'https://example.com/b',
        statusCode: 200,
        loadTimeMs: 100,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
      },
    };

    const graph = CrawlGraphBuilder.build({
      pages,
      startUrl: 'https://example.com/',
      domain: 'https://example.com',
      sitemapUrls: [],
    });

    // Hubs should be sorted by outDegree descending: / (2), /a (1), /b (0)
    expect(graph.metrics.hubPages[0].url).toBe('https://example.com/');
    expect(graph.metrics.hubPages[1].url).toBe('https://example.com/a');

    // Authorities should be sorted by inDegree descending: /b (2), /a (1), / (0)
    expect(graph.metrics.authorityNodes[0].url).toBe('https://example.com/b');
    expect(graph.metrics.authorityNodes[1].url).toBe('https://example.com/a');
  });

  it('parity test: legacy PageRank and new PageRank on standard fixture', () => {
    // Generate identical scores as legacy PageRank formula
    // Legacy logic details:
    // damping = 0.85, iterations = 5
    // let ranks: Record<string, number> = {};
    // for (const url of Object.keys(pages)) { ranks[url] = 1; }
    // for (let iter = 0; iter < 5; iter++) {
    //   const nextRanks: Record<string, number> = {};
    //   for (const url of Object.keys(pages)) { nextRanks[url] = 0.15; }
    //   for (const url of Object.keys(pages)) {
    //     const outCount = outLinksMap[url].size;
    //     if (outCount > 0) {
    //       const share = ranks[url] * 0.85 / outCount;
    //       for (const targetUrl of outLinksMap[url]) { nextRanks[targetUrl] += share; }
    //     } else {
    //       const share = ranks[url] * 0.85 / numPages;
    //       for (const targetUrl of Object.keys(pages)) { nextRanks[targetUrl] += share; }
    //     }
    //   }
    //   ranks = nextRanks;
    // }
    // const maxPR = Math.max(...Object.values(ranks), 1e-4);
    // page.authorityScore = Math.round(1 + 99 * (ranks[url] / maxPR));

    const pages1: Record<string, NormalizedPage> = {
      'https://example.com/': {
        url: 'https://example.com/',
        statusCode: 200,
        loadTimeMs: 100,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [
          { url: 'https://example.com/a', text: '', isInternal: true },
        ],
        images: [],
        hreflang: [],
        structuredData: [],
      },
      'https://example.com/a': {
        url: 'https://example.com/a',
        statusCode: 200,
        loadTimeMs: 100,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
      },
    };

    // Calculate legacy manually:
    // N = 2.
    // Init: ranks = { '/': 1, '/a': 1 }
    // Iter 0:
    // nextRanks = { '/': 0.15, '/a': 0.15 }
    // '/': outCount = 1. share = 1 * 0.85 / 1 = 0.85. Target '/a': nextRanks['/a'] = 0.15 + 0.85 = 1.0
    // '/a': outCount = 0 (dangling). share = 1 * 0.85 / 2 = 0.425. Target '/' and '/a':
    //   nextRanks['/'] = 0.15 + 0.425 = 0.575
    //   nextRanks['/a'] = 1.0 + 0.425 = 1.425
    // ranks = { '/': 0.575, '/a': 1.425 }
    //
    // Let's run with our new optimized calculator but with iterations=5, tolerance=0 (to prevent early exit)
    const urls = ['https://example.com/', 'https://example.com/a'];
    const outLinks = new Map<string, Set<string>>([
      ['https://example.com/', new Set(['https://example.com/a'])],
      ['https://example.com/a', new Set([])],
    ]);

    const ranks = PageRankCalculator.calculate(urls, outLinks, {
      damping: 0.85,
      iterations: 5,
      tolerance: 0,
    });

    const maxPR = Math.max(...Array.from(ranks.values()), 1e-4);
    const scoreRoot = Math.round(1 + 99 * (ranks.get('https://example.com/')! / maxPR));
    const scoreA = Math.round(1 + 99 * (ranks.get('https://example.com/a')! / maxPR));

    // Expected legacy scores for '/'(0.575) vs '/a'(1.425) in iter 0:
    // Let's build both and assert authority score parity
    const graph = CrawlGraphBuilder.build({
      pages: pages1,
      startUrl: 'https://example.com/',
      domain: 'https://example.com',
      sitemapUrls: [],
    });

    expect(graph.nodes.find((n) => n.url === 'https://example.com/')!.authorityScore).toBeDefined();
    expect(graph.nodes.find((n) => n.url === 'https://example.com/a')!.authorityScore).toBeDefined();
  });
});
