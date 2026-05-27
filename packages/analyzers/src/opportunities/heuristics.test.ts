import { describe, expect, it } from 'vitest';
import { findMetadataOpportunities } from './metadata.js';
import { findPerformanceOpportunities } from './performance.js';
import { findIndexingOpportunities } from './indexing.js';
import { findInternalLinkOpportunities } from './internal-links.js';
import { findSchemaOpportunities } from './schema.js';
import { findContentOpportunities } from './content.js';
import { NormalizedPage, Finding } from '@seocore/sdk';
import { NormalizedGscPageMetrics, NormalizedCruxPageMetrics } from './types.js';

function makePage(url: string, overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url,
    statusCode: 200,
    loadTimeMs: 120,
    contentType: 'text/html; charset=utf-8',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    depth: 1,
    ...overrides
  };
}

describe('Opportunity Heuristics By Type', () => {
  describe('Metadata', () => {
    it('boosts priority and score when page has high impressions but low CTR', () => {
      const pages = { 'https://example.com/page1': makePage('https://example.com/page1') };
      const findings: Finding[] = [{
        id: 'missing-title:1',
        ruleId: 'missing-title',
        severity: 'error',
        category: 'metadata',
        url: 'https://example.com/page1',
        message: 'Title tag missing',
        recommendation: 'Add title',
      }];
      const gsc = new Map<string, NormalizedGscPageMetrics>([
        ['https://example.com/page1', { url: 'https://example.com/page1', impressions: 2000, clicks: 2, ctr: 0.001, position: 5 }]
      ]);

      const opportunities = findMetadataOpportunities(pages, findings, gsc);
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].priority).toBe('high');
      expect(opportunities[0].sourceSignals.some(s => s.includes('CTR Boost'))).toBe(true);
      expect(opportunities[0].recommendedActions).toContain('Add unique, descriptive title tag (50-60 characters)');
    });
  });

  describe('Performance', () => {
    it('uses CrUX field data over heuristics and restricts priority for low-visibility pages', () => {
      const pages = { 'https://example.com/page1': makePage('https://example.com/page1') };
      const findings: Finding[] = [{
        id: 'perf-slow:1',
        ruleId: 'slow-lcp',
        severity: 'critical',
        category: 'performance',
        url: 'https://example.com/page1',
        message: 'LCP is too slow',
        recommendation: 'Optimize images',
      }];
      const gsc = new Map<string, NormalizedGscPageMetrics>(); // no GSC = low visibility
      const crux = new Map<string, NormalizedCruxPageMetrics>([
        ['https://example.com/page1', { url: 'https://example.com/page1', lcp: 4500 }]
      ]);

      const opportunities = findPerformanceOpportunities(pages, findings, gsc, crux);
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].priority).not.toBe('high'); // restricted because low visibility
      expect(opportunities[0].supportingMetrics.source).toBe('CrUX (Field)');
    });
  });

  describe('Indexing', () => {
    it('suppresses utility pages and boosts visible pages with indexing issues', () => {
      const pages = {
        'https://example.com/admin': makePage('https://example.com/admin'),
        'https://example.com/blog/pos': makePage('https://example.com/blog/pos')
      };
      const findings: Finding[] = [
        {
          id: 'noindex:1',
          ruleId: 'noindex',
          severity: 'error',
          category: 'indexing',
          url: 'https://example.com/admin',
          message: 'noindex set',
          recommendation: 'Remove noindex',
        },
        {
          id: 'noindex:2',
          ruleId: 'noindex',
          severity: 'error',
          category: 'indexing',
          url: 'https://example.com/blog/pos',
          message: 'noindex set',
          recommendation: 'Remove noindex',
        }
      ];
      const gsc = new Map<string, NormalizedGscPageMetrics>([
        ['https://example.com/blog/pos', { url: 'https://example.com/blog/pos', impressions: 500, clicks: 20, ctr: 0.04, position: 8 }]
      ]);

      const opportunities = findIndexingOpportunities(pages, findings, gsc);
      // admin should be suppressed
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].url).toBe('https://example.com/blog/pos');
      expect(opportunities[0].priority).toBe('high');
    });
  });

  describe('Internal Links', () => {
    it('promotes orphan pages with impressions', () => {
      const pages = {
        'https://example.com/orphan': makePage('https://example.com/orphan', { isOrphan: true, inDegree: 0 })
      };
      const gsc = new Map<string, NormalizedGscPageMetrics>([
        ['https://example.com/orphan', { url: 'https://example.com/orphan', impressions: 300, clicks: 5, ctr: 0.017, position: 15 }]
      ]);

      const opportunities = findInternalLinkOpportunities(pages, gsc);
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].priority).toBe('high');
      expect(opportunities[0].supportingMetrics.isOrphan).toBe('true');
    });
  });

  describe('Schema', () => {
    it('infers schema need from URL patterns', () => {
      const pages = {
        'https://example.com/product/iphone': makePage('https://example.com/product/iphone', { structuredData: [] })
      };
      const gsc = new Map<string, NormalizedGscPageMetrics>();

      const opportunities = findSchemaOpportunities(pages, gsc);
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].recommendedActions[0]).toContain('Product schema');
    });
  });

  describe('Content', () => {
    it('combines low CTR and high ranking position for intent-mismatch boost', () => {
      const pages = { 'https://example.com/page1': makePage('https://example.com/page1') };
      const findings: Finding[] = [{
        id: 'thin:1',
        ruleId: 'thin-content',
        severity: 'error',
        category: 'seo',
        url: 'https://example.com/page1',
        message: 'Word count too low',
        recommendation: 'Expand content',
      }];
      const gsc = new Map<string, NormalizedGscPageMetrics>([
        ['https://example.com/page1', { url: 'https://example.com/page1', impressions: 1000, clicks: 1, ctr: 0.001, position: 4 }]
      ]);

      const opportunities = findContentOpportunities(pages, findings, gsc);
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].priority).toBe('high');
      expect(opportunities[0].sourceSignals.some(s => s.includes('Intent Mismatch'))).toBe(true);
    });
  });
});
