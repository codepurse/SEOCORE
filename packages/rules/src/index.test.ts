import { describe, it, expect, vi } from 'vitest';
import { MissingTitleRule, DuplicateTitleRule } from './index';
import { NormalizedPage, SeoConfig } from '@seocore/sdk';

const mockConfig: SeoConfig = {
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

describe('MissingTitleRule', () => {
  it('should generate finding if title is missing', async () => {
    const rule = new MissingTitleRule();
    const page: NormalizedPage = {
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

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('missing-title');
    expect(findings[0].severity).toBe('critical');
  });

  it('should generate finding if title is too long (> 60 chars)', async () => {
    const rule = new MissingTitleRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      title: 'This is an incredibly long title that exceeds sixty characters easily to trigger the warning finding',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toContain('too long');
  });

  it('should return no findings for valid title', async () => {
    const rule = new MissingTitleRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      title: 'Valid Title',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(0);
  });
});

describe('DuplicateTitleRule', () => {
  it('should detect duplicate titles across allPages map', async () => {
    const rule = new DuplicateTitleRule();
    const page1: NormalizedPage = {
      url: 'https://example.com/page1',
      statusCode: 200,
      loadTimeMs: 50,
      contentType: 'text/html',
      title: 'Shared Title',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };
    const page2: NormalizedPage = {
      url: 'https://example.com/page2',
      statusCode: 200,
      loadTimeMs: 50,
      contentType: 'text/html',
      title: 'Shared Title',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const allPages = {
      'https://example.com/page1': page1,
      'https://example.com/page2': page2,
    };

    const findings = await rule.evaluate(page1, { allPages, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('duplicate-title');
    expect(findings[0].message).toContain('duplicated');
  });
});

describe('BrokenLinksRule', () => {
  it('should detect broken internal and external links', async () => {
    const { BrokenLinksRule } = await import('./index');
    const rule = new BrokenLinksRule();

    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 10,
      contentType: 'text/html',
      headings: { h1: [], h2: [], h3: [] },
      links: [
        { url: 'https://example.com/broken-internal', text: 'Internal Broken', isInternal: true },
        { url: 'https://example.com/working-internal', text: 'Internal Working', isInternal: true },
        { url: 'https://broken-external.com/', text: 'External Broken', isInternal: false },
      ],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const allPages = {
      'https://example.com/': page,
      'https://example.com/broken-internal': {
        url: 'https://example.com/broken-internal',
        statusCode: 404,
        loadTimeMs: 5,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
      },
      'https://example.com/working-internal': {
        url: 'https://example.com/working-internal',
        statusCode: 200,
        loadTimeMs: 5,
        contentType: 'text/html',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        hreflang: [],
        structuredData: [],
      },
    };

    // Mock global fetch to return a 500 server error for broken-external.com
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (url === 'https://broken-external.com/') {
        return { status: 500 } as any;
      }
      return { status: 200 } as any;
    });

    try {
      const findings = await rule.evaluate(page, { allPages, config: mockConfig });
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe('broken-links');
      expect(findings[0].evidence).toContain('broken-internal');
      expect(findings[0].evidence).toContain('broken-external');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('Performance and Topology Rules', () => {
  it('should flag low performance score', async () => {
    const { LowPerformanceScoreRule } = await import('./index');
    const rule = new LowPerformanceScoreRule();
    const page: NormalizedPage = {
      url: 'https://example.com/slow',
      statusCode: 200,
      loadTimeMs: 1500,
      contentType: 'text/html',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      performanceScore: 45,
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('low-performance-score');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('critically low');
  });

  it('should flag high LCP', async () => {
    const { LcpMetricRule } = await import('./index');
    const rule = new LcpMetricRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 3000,
      contentType: 'text/html',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      coreWebVitals: { lcp: 4500, cls: 0.05, inp: 100 },
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('lcp-metric');
    expect(findings[0].severity).toBe('error');
  });

  it('should flag high CLS', async () => {
    const { ClsMetricRule } = await import('./index');
    const rule = new ClsMetricRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      coreWebVitals: { lcp: 1200, cls: 0.35, inp: 100 },
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('cls-metric');
    expect(findings[0].severity).toBe('error');
  });

  it('should flag heavy resource payloads', async () => {
    const { ResourceSizeRule } = await import('./index');
    const rule = new ResourceSizeRule();
    const page: NormalizedPage = {
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
        pageSizeBytes: 200000, // 200KB > 150KB
        jsSizeBytes: 600000,   // 600KB > 500KB
        cssSizeBytes: 5000,
        otherSizeBytes: 0,
        jsRequests: 5,
        cssRequests: 2,
        imageRequests: 10,
        totalRequests: 60,     // > 50
      },
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    // Should flag html-size, js-size, and request-count
    expect(findings.length).toBe(3);
    expect(findings.some(f => f.message.includes('HTML page weight'))).toBe(true);
    expect(findings.some(f => f.message.includes('JavaScript weight'))).toBe(true);
    expect(findings.some(f => f.message.includes('subresource request count'))).toBe(true);
  });

  it('should flag orphan pages', async () => {
    const { OrphanPageRule } = await import('./index');
    const rule = new OrphanPageRule();
    const page: NormalizedPage = {
      url: 'https://example.com/orphan',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      isOrphan: true,
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('orphan-page');
    expect(findings[0].severity).toBe('error');
  });
});

describe('AI Visibility Rules', () => {
  const mockConfig: SeoConfig = {
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

  it('AiExtractabilityRule should flag non-semantic content and high boilerplate', async () => {
    const { AiExtractabilityRule } = await import('./index');
    const rule = new AiExtractabilityRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      html: `
        <html>
          <body>
            <nav>Home About Services Contact Blog Portal Store Login FAQ Support Careers Partners Links Status API</nav>
            <div>Welcome to our page. There are no semantic containers here.</div>
          </body>
        </html>
      `,
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some(f => f.ruleId === 'ai-extractability')).toBe(true);
    expect(findings.some(f => f.message.includes('Lack of semantic'))).toBe(true);
  });

  it('AiEntityClarityRule should flag missing entities', async () => {
    const { AiEntityClarityRule } = await import('./index');
    const rule = new AiEntityClarityRule();
    const page: NormalizedPage = {
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

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('ai-entity-clarity');
    expect(findings[0].message).toContain('weakly defined');
  });

  it('AiCitationReadinessRule should flag missing FAQ schema and statistics', async () => {
    const { AiCitationReadinessRule } = await import('./index');
    const rule = new AiCitationReadinessRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      html: `
        <html>
          <body>
            <h2>What is SEO?</h2>
            <p>SEO is Search Engine Optimization. No statistics or factual references are here.</p>
          </body>
        </html>
      `,
      headings: { h1: [], h2: ['What is SEO?'], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some(f => f.message.includes('FAQ sections are missing'))).toBe(true);
    expect(findings.some(f => f.message.includes('outbound external citations'))).toBe(true);
  });

  it('AiStructuralOrganizationRule should flag broken heading hierarchy', async () => {
    const { AiStructuralOrganizationRule } = await import('./index');
    const rule = new AiStructuralOrganizationRule();
    const page: NormalizedPage = {
      url: 'https://example.com/',
      statusCode: 200,
      loadTimeMs: 100,
      contentType: 'text/html',
      html: `
        <html>
          <body>
            <h1>Main Title</h1>
            <h3>Sub Sub Title</h3>
          </body>
        </html>
      `,
      headings: { h1: ['Main Title'], h2: [], h3: ['Sub Sub Title'] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
    };

    const findings = await rule.evaluate(page, { allPages: {}, config: mockConfig });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some(f => f.message.includes('Heading hierarchy reduces'))).toBe(true);
  });
});