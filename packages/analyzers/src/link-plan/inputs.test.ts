import { describe, it, expect } from 'vitest';
import { normalizePageFacts, isCommercialUrl, isUtilityPage, getOutboundInternalLinks } from './inputs.js';
import { NormalizedPage, CrawlGraph } from '@seocore/sdk';

function makePage(overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url: 'https://example.com/page',
    statusCode: 200,
    loadTimeMs: 100,
    contentType: 'text/html',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    ...overrides,
  } as NormalizedPage;
}

describe('normalizePageFacts', () => {
  it('derives facts from page alone when no crawl graph', () => {
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/a': makePage({ url: 'https://example.com/a', inDegree: 0, depth: 1, title: 'Page A' }),
    };
    const facts = normalizePageFacts(pages);
    const f = facts.get('https://example.com/a')!;
    expect(f.inDegree).toBe(0);
    expect(f.isOrphan).toBe(true);
    expect(f.depth).toBe(1);
    expect(f.title).toBe('Page A');
  });

  it('prefers crawl graph node values over page values', () => {
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/a': makePage({ url: 'https://example.com/a', inDegree: 5, depth: 2, authorityScore: 10 }),
    };
    const graph: CrawlGraph = {
      nodes: [{ url: 'https://example.com/a', depth: 1, inDegree: 10, outDegree: 3, authorityScore: 50, isOrphan: false }],
      edges: [],
      metrics: { maxDepth: 1, orphanCount: 0, hubPages: [], authorityNodes: [] },
    };
    const facts = normalizePageFacts(pages, graph);
    const f = facts.get('https://example.com/a')!;
    expect(f.inDegree).toBe(10);
    expect(f.depth).toBe(1);
    expect(f.authorityScore).toBe(50);
  });

  it('detects commercial URLs', () => {
    expect(isCommercialUrl('https://example.com/products/widget')).toBe(true);
    expect(isCommercialUrl('https://example.com/about')).toBe(false);
  });

  it('detects utility pages', () => {
    expect(isUtilityPage('https://example.com/privacy')).toBe(true);
    expect(isUtilityPage('https://example.com/privacy-policy')).toBe(false);
    expect(isUtilityPage('https://example.com/blog/post')).toBe(false);
  });

  it('extracts outbound internal links', () => {
    const facts = {
      url: 'https://example.com/a',
      links: [
        { url: 'https://example.com/b', text: 'B', isInternal: true },
        { url: 'https://external.com', text: 'Ext', isInternal: false },
      ],
    } as any;
    const targets = getOutboundInternalLinks(facts);
    expect(targets.has('https://example.com/b')).toBe(true);
    expect(targets.has('https://external.com')).toBe(false);
  });
});
