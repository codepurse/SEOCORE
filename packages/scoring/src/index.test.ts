import { describe, it, expect } from 'vitest';
import { ScoringEngine } from './index';
import { Finding, SeoConfig, RuleDefinition } from '@seocore/sdk';

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

const mockRuleDefinitions: RuleDefinition[] = [
  {
    id: 'missing-title',
    name: 'Missing Page Title',
    description: 'Title validation.',
    category: 'metadata',
    defaultSeverity: 'critical',
    defaultWeight: 10,
  },
  {
    id: 'missing-meta-description',
    name: 'Missing Meta Description',
    description: 'Meta description validation.',
    category: 'metadata',
    defaultSeverity: 'error',
    defaultWeight: 7,
  }
];

describe('ScoringEngine', () => {
  it('should calculate perfect score of 100 with 0 findings', () => {
    const result = ScoringEngine.calculate([], 1, mockConfig, mockRuleDefinitions);
    expect(result.score).toBe(100);
    expect(result.categories.metadata.score).toBe(100);
  });

  it('should deduct scores correctly based on weighted severity findings', () => {
    const findings: Finding[] = [
      {
        id: 'missing-title:xyz',
        ruleId: 'missing-title',
        severity: 'critical',
        category: 'metadata',
        url: 'https://example.com/',
        message: 'Page is missing a title tag.',
        recommendation: 'Add title.',
      }
    ];

    const result = ScoringEngine.calculate(findings, 1, mockConfig, mockRuleDefinitions);
    // deduction = weight(10) * critical_multiplier(1.5) = 15 points deduction.
    // score = 100 - 15 = 85.
    expect(result.categories.metadata.score).toBe(85);
  });

  it('should calculate Mobile SEO score using the precise sub-metric weight formula', () => {
    const mobileRuleDefs: RuleDefinition[] = [
      {
        id: 'mobile-usability',
        name: 'Mobile Usability Evaluation',
        description: 'Usability evaluation.',
        category: 'mobile_seo',
        defaultSeverity: 'error',
        defaultWeight: 8,
      }
    ];

    const findings: Finding[] = [
      {
        id: 'mobile-usability:xyz:missing-viewport',
        ruleId: 'mobile-usability',
        severity: 'critical',
        category: 'mobile_seo',
        url: 'https://example.com/',
        message: 'Viewport meta tag is missing.',
        recommendation: 'Add viewport.',
      }
    ];

    const result = ScoringEngine.calculate(findings, 1, mockConfig, mobileRuleDefs);
    // usabilityScore = 100 - 40 = 60
    // performanceScore = 100
    // responsiveScore = 100
    // indexingScore = 100
    // mobileSeoScore = (60 * 0.35) + (100 * 0.35) + (100 * 0.20) + (100 * 0.10)
    //                 = 21 + 35 + 20 + 10 = 86
    expect(result.categories.mobile_seo.score).toBe(86);
  });

  describe('Mobile SEO Validation Rules', () => {
    const mobileRuleDefs: RuleDefinition[] = [
      { id: 'mobile-usability', name: 'Usability', description: '', category: 'mobile_seo', defaultSeverity: 'error', defaultWeight: 8 },
      { id: 'mobile-performance', name: 'Performance', description: '', category: 'mobile_seo', defaultSeverity: 'warning', defaultWeight: 8 },
      { id: 'mobile-responsive', name: 'Responsive', description: '', category: 'mobile_seo', defaultSeverity: 'warning', defaultWeight: 5 },
      { id: 'mobile-indexing', name: 'Indexing', description: '', category: 'mobile_seo', defaultSeverity: 'warning', defaultWeight: 3 }
    ];

    it('Validation Rule 1: A page with only a valid viewport meta tag and a canonical tag should score between 15-30', () => {
      const findings: Finding[] = [
        // Usability empty states (except viewport)
        { id: 'mobile-usability:no-inline-styles', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-nav-element', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-tap-targets', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Performance unverifiable/empty states
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:no-images-found', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Responsive missing media queries / breakpoints
        { id: 'mobile-responsive:missing-media-queries', ruleId: 'mobile-responsive', severity: 'error', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Indexing schema missing (viewport and canonical are present/valid)
        { id: 'mobile-indexing:missing-schema', ruleId: 'mobile-indexing', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];

      const result = ScoringEngine.calculate(findings, 1, mockConfig, mobileRuleDefs);
      expect(result.categories.mobile_seo.score).toBeGreaterThanOrEqual(15);
      expect(result.categories.mobile_seo.score).toBeLessThanOrEqual(30);
    });

    it('Validation Rule 2: A static HTML page with no inline styles, no images, no schema, and no media queries should score between 5-20', () => {
      const findings: Finding[] = [
        // Usability missing viewport / empty states
        { id: 'mobile-usability:missing-viewport', ruleId: 'mobile-usability', severity: 'critical', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-inline-styles', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-nav-element', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-tap-targets', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Performance unverifiable/empty states
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:no-images-found', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Responsive missing media queries / breakpoints
        { id: 'mobile-responsive:missing-media-queries', ruleId: 'mobile-responsive', severity: 'error', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Indexing schema missing / canonical missing
        { id: 'mobile-indexing:missing-schema', ruleId: 'mobile-indexing', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-indexing:missing-canonical', ruleId: 'mobile-indexing', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];

      const result = ScoringEngine.calculate(findings, 1, mockConfig, mobileRuleDefs);
      expect(result.categories.mobile_seo.score).toBeGreaterThanOrEqual(5);
      expect(result.categories.mobile_seo.score).toBeLessThanOrEqual(20);
    });

    it('Validation Rule 3: A well-optimized page on static crawl should score between 60-78', () => {
      const findings: Finding[] = [
        // Usability is perfectly valid
        // Performance has unverifiable core metrics (unverifiable-lcp, unverifiable-cls, unverifiable-js, unverifiable-image-load)
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        // Responsive breakpoints unverifiable
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
        // Indexing perfectly valid
      ];

      const result = ScoringEngine.calculate(findings, 1, mockConfig, mobileRuleDefs);
      expect(result.categories.mobile_seo.score).toBeGreaterThanOrEqual(60);
      expect(result.categories.mobile_seo.score).toBeLessThanOrEqual(78);
    });

    it('Validation Rule 4 & 5: A score above 80 should only be possible with real performance metrics, and 100 should be practically unreachable', () => {
      const staticFindings: Finding[] = [
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];

      const staticResult = ScoringEngine.calculate(staticFindings, 1, mockConfig, mobileRuleDefs);
      // Under static crawl, score cannot exceed 80
      expect(staticResult.categories.mobile_seo.score).toBeLessThan(80);

      // Under dynamic crawl with real performance metrics (0 findings)
      const dynamicResult = ScoringEngine.calculate([], 1, { ...mockConfig, playwrightEnabled: true }, mobileRuleDefs);
      expect(dynamicResult.categories.mobile_seo.score).toBeGreaterThanOrEqual(80);
    });
  });
});