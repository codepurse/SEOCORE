import { describe, it, expect } from 'vitest';
import { ScoringEngine, calculateMobileScore, calculateSecurityScore } from './index.js';
import { Finding, SeoConfig, RuleDefinition, TIER_PRESETS } from '@seocore/sdk';

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
    const result = ScoringEngine.calculate({
      findings: [],
      pagesAudited: 1,
      config: mockConfig,
      tierConfig: TIER_PRESETS.standard,
      ruleDefinitions: mockRuleDefinitions,
    });
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

    const result = ScoringEngine.calculate({
      findings,
      pagesAudited: 1,
      config: mockConfig,
      tierConfig: TIER_PRESETS.standard,
      ruleDefinitions: mockRuleDefinitions,
    });
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

    const result = ScoringEngine.calculate({
      findings,
      pagesAudited: 1,
      config: mockConfig,
      tierConfig: TIER_PRESETS.standard,
      ruleDefinitions: mobileRuleDefs,
    });
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
        { id: 'mobile-usability:no-inline-styles', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-nav-element', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-tap-targets', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:no-images-found', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:missing-media-queries', ruleId: 'mobile-responsive', severity: 'error', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-indexing:missing-schema', ruleId: 'mobile-indexing', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];

      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: mockConfig,
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: mobileRuleDefs,
      });
      expect(result.categories.mobile_seo.score).toBeGreaterThanOrEqual(15);
      expect(result.categories.mobile_seo.score).toBeLessThanOrEqual(30);
    });

    it('Validation Rule 2: A static HTML page with no inline styles, no images, no schema, and no media queries should score between 5-20', () => {
      const findings: Finding[] = [
        { id: 'mobile-usability:missing-viewport', ruleId: 'mobile-usability', severity: 'critical', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-inline-styles', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-nav-element', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-usability:no-tap-targets', ruleId: 'mobile-usability', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:no-images-found', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:missing-media-queries', ruleId: 'mobile-responsive', severity: 'error', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-indexing:missing-schema', ruleId: 'mobile-indexing', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-indexing:missing-canonical', ruleId: 'mobile-indexing', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];

      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: mockConfig,
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: mobileRuleDefs,
      });
      expect(result.categories.mobile_seo.score).toBeGreaterThanOrEqual(5);
      expect(result.categories.mobile_seo.score).toBeLessThanOrEqual(20);
    });

    it('Validation Rule 3: A well-optimized page on static crawl should score between 60-78', () => {
      const findings: Finding[] = [
        { id: 'mobile-performance:unverifiable-lcp', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-cls', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-js-execution', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-performance:unverifiable-image-load', ruleId: 'mobile-performance', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' },
        { id: 'mobile-responsive:unverifiable-breakpoints', ruleId: 'mobile-responsive', severity: 'warning', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];

      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: mockConfig,
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: mobileRuleDefs,
      });
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

      const staticResult = ScoringEngine.calculate({
        findings: staticFindings,
        pagesAudited: 1,
        config: mockConfig,
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: mobileRuleDefs,
      });
      expect(staticResult.categories.mobile_seo.score).toBeLessThan(80);

      const dynamicResult = ScoringEngine.calculate({
        findings: [],
        pagesAudited: 1,
        config: { ...mockConfig, playwrightEnabled: true },
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: mobileRuleDefs,
      });
      expect(dynamicResult.categories.mobile_seo.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Sub-scorer direct verification', () => {
    it('mobile sub-scoring produces same result as engine calculation', () => {
      const findings: Finding[] = [
        { id: 'mobile-usability:xyz:missing-viewport', ruleId: 'mobile-usability', severity: 'critical', category: 'mobile_seo', url: '', message: '', recommendation: '' }
      ];
      const direct = calculateMobileScore(findings, 1);
      expect(direct.score).toBe(86);
      expect(direct.subScores.usability).toBe(60);
      expect(direct.subScores.performance).toBe(100);
    });

    it('security sub-scoring returns expected score and floor limits', () => {
      const findings: Finding[] = [
        { id: 'security:xyz:not-https', ruleId: 'not-https', severity: 'critical', category: 'security', url: 'http://example.com/', message: '', recommendation: '' }
      ];
      const scoreWithNoFloor = calculateSecurityScore(findings, 1, {});
      // httpsScore = 100 - 100 = 0
      // overall = 0 * 0.20 + 100 * 0.80 = 80
      expect(scoreWithNoFloor).toBe(80);

      const scoreWithFloor = calculateSecurityScore(findings, 1, { security: 90 });
      expect(scoreWithFloor).toBe(90);
    });

    it('total weighted score matches standard tier weighting', () => {
      const result = ScoringEngine.calculate({
        findings: [],
        pagesAudited: 1,
        config: mockConfig,
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: [],
      });
      // All categories 100 -> score 100
      expect(result.score).toBe(100);
    });
  });
});
