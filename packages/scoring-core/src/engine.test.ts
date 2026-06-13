import { describe, it, expect } from 'vitest';
import { ScoringEngine, calculateMobileScore, calculateSecurityScore, calculateSecurityScoreDetails } from './index.js';
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

    it('security sub-scoring caps critical transport failures even when floors are configured', () => {
      const findings: Finding[] = [
        { id: 'security:xyz:not-https', ruleId: 'not-https', severity: 'critical', category: 'security', url: 'http://example.com/', message: '', recommendation: '' }
      ];
      const detailsWithNoFloor = calculateSecurityScoreDetails(findings, 1, {});
      expect(detailsWithNoFloor.calculatedScore).toBe(80);
      expect(detailsWithNoFloor.appliedCap).toBe(40);
      expect(detailsWithNoFloor.score).toBe(40);

      const scoreWithFloor = calculateSecurityScore(findings, 1, { security: 90 });
      expect(scoreWithFloor).toBe(40);
    });

    it('security sub-scoring matches hashed subchecks and counts non-header findings', () => {
      const findings: Finding[] = [
        {
          id: 'security-headers:a1b2c3:d4e5f6',
          ruleId: 'security-headers',
          subCheck: 'missing-hsts',
          severity: 'error',
          category: 'security',
          url: 'https://example.com/',
          message: 'HSTS missing.',
          recommendation: 'Add HSTS.',
        },
        {
          id: 'security-headers:a1b2c3:g7h8i9',
          ruleId: 'security-headers',
          subCheck: 'cookie-missing-httponly',
          severity: 'warning',
          category: 'security',
          url: 'https://example.com/',
          message: 'Cookie missing HttpOnly.',
          recommendation: 'Add HttpOnly.',
        }
      ];

      const details = calculateSecurityScoreDetails(findings, 1, {});
      const hstsBucket = details.buckets.find(bucket => bucket.key === 'hsts');
      const cookieBucket = details.buckets.find(bucket => bucket.key === 'cookie-security');

      expect(hstsBucket?.score).toBeLessThan(100);
      expect(cookieBucket?.score).toBeLessThan(100);
      expect(details.score).toBeLessThan(100);
    });

    it('security sub-scoring drops when issues repeat across audited pages', () => {
      const findings: Finding[] = Array.from({ length: 5 }, (_, index) => {
        const url = `https://example.com/page-${index + 1}`;
        return [
          {
            id: `security-headers:${index}:missing-hsts`,
            ruleId: 'security-headers',
            subCheck: 'missing-hsts',
            severity: 'error' as const,
            category: 'security' as const,
            url,
            message: 'HSTS missing.',
            recommendation: 'Add HSTS.',
          },
          {
            id: `security-headers:${index}:missing-csp`,
            ruleId: 'security-headers',
            subCheck: 'missing-csp',
            severity: 'error' as const,
            category: 'security' as const,
            url,
            message: 'CSP missing.',
            recommendation: 'Add CSP.',
          },
          {
            id: `security-headers:${index}:cookie-missing-secure`,
            ruleId: 'security-headers',
            subCheck: 'cookie-missing-secure',
            severity: 'warning' as const,
            category: 'security' as const,
            url,
            message: 'Cookie missing Secure.',
            recommendation: 'Add Secure.',
          }
        ];
      }).flat();

      const score = calculateSecurityScore(findings, 5, {});
      expect(score).toBeLessThan(70);
    });

    it('security sub-scoring no longer dilutes localized issues across clean pages', () => {
      // Same single missing-csp issue, audited against a small vs. large site.
      const makeFinding = (page: number): Finding => ({
        id: `security-headers:${page}:missing-csp`,
        ruleId: 'security-headers',
        subCheck: 'missing-csp',
        severity: 'error',
        category: 'security',
        url: `https://example.com/page-${page}`,
        message: 'CSP missing.',
        recommendation: 'Add CSP.',
      });

      const onePageDetails = calculateSecurityScoreDetails([makeFinding(1)], 1, {});
      const largeSiteDetails = calculateSecurityScoreDetails([makeFinding(1)], 200, {});

      const onePageCsp = onePageDetails.buckets.find(b => b.key === 'csp');
      const largeSiteCsp = largeSiteDetails.buckets.find(b => b.key === 'csp');

      // Both register a real, non-trivial penalty (old model diluted the 200-page case to ~0).
      expect(onePageCsp?.score).toBeLessThan(40);
      expect(largeSiteCsp?.score).toBeLessThanOrEqual(75);
      expect(largeSiteCsp?.score).toBeLessThan(100);
      expect(largeSiteCsp?.affectedPages).toBe(1);
      // Widespread is still strictly worse than isolated.
      expect(onePageCsp!.score).toBeLessThan(largeSiteCsp!.score);
    });

    it('security sub-scoring caps missing CSP or HSTS below an A grade', () => {
      const findings: Finding[] = [
        {
          id: 'security-headers:1:missing-csp',
          ruleId: 'security-headers',
          subCheck: 'missing-csp',
          severity: 'error',
          category: 'security',
          url: 'https://example.com/page-1',
          message: 'CSP missing.',
          recommendation: 'Add CSP.',
        }
      ];

      const details = calculateSecurityScoreDetails(findings, 200, {});
      expect(details.calculatedScore).toBeGreaterThan(79);
      expect(details.appliedCap).toBe(79);
      expect(details.score).toBe(79);
      expect(details.gateReason).toContain('CSP');
    });

    it('security sub-scoring caps remaining security errors below 90', () => {
      const findings: Finding[] = [
        {
          id: 'security-headers:1:csp-unsafe-eval-script',
          ruleId: 'security-headers',
          subCheck: 'csp-unsafe-eval-script',
          severity: 'error',
          category: 'security',
          url: 'https://example.com/page-1',
          message: 'CSP allows unsafe-eval.',
          recommendation: 'Remove unsafe-eval.',
        }
      ];

      const details = calculateSecurityScoreDetails(findings, 200, {});
      expect(details.calculatedScore).toBeGreaterThan(89);
      expect(details.appliedCap).toBe(89);
      expect(details.score).toBe(89);
      expect(details.gateReason).toContain('errors');
    });

    it('security sub-scoring reaches full per-page deduction when issue is site-wide', () => {
      const findings: Finding[] = Array.from({ length: 50 }, (_, index) => ({
        id: `security-headers:${index}:missing-csp`,
        ruleId: 'security-headers',
        subCheck: 'missing-csp' as const,
        severity: 'error' as const,
        category: 'security' as const,
        url: `https://example.com/page-${index + 1}`,
        message: 'CSP missing.',
        recommendation: 'Add CSP.',
      }));

      const details = calculateSecurityScoreDetails(findings, 50, {});
      const csp = details.buckets.find(b => b.key === 'csp');
      // missing-csp deduction 70 * error factor 1.0, coverage 1.0 -> score 30.
      expect(csp?.coverage).toBe(1);
      expect(csp?.score).toBe(30);
      expect(details.appliedCap).toBe(79);
      expect(details.score).toBe(79);
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

  describe('Score renormalization (un-audited categories)', () => {
    it('excludes categories with no rules so they do not inflate the overall score', () => {
      const findings: Finding[] = [
        {
          id: 'missing-title:xyz',
          ruleId: 'missing-title',
          severity: 'critical',
          category: 'metadata',
          url: 'https://example.com/',
          message: 'Missing title.',
          recommendation: 'Add title.',
        },
      ];

      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: mockConfig,
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: mockRuleDefinitions, // metadata-only rules
      });

      // Only metadata was audited, so the overall score equals the metadata score —
      // not diluted upward by free 100s from ai_visibility / backlinks / mobile / etc.
      expect(result.categories.metadata.audited).toBe(true);
      expect(result.categories.ai_visibility.audited).toBe(false);
      expect(result.categories.backlink_intelligence.audited).toBe(false);
      expect(result.score).toBe(result.categories.metadata.score);
      expect(result.score).toBe(85);
    });
  });

  describe('Performance verifiability cap', () => {
    const perfRuleDefs: RuleDefinition[] = [
      { id: 'perf', name: 'Performance', description: '', category: 'performance', defaultSeverity: 'warning', defaultWeight: 8 },
    ];

    it('caps an unverified (non-Lighthouse) performance score at 50', () => {
      const findings: Finding[] = []; // engine pushes the cap notice into this array
      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: mockConfig, // lighthouseEnabled undefined -> estimated metrics
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: perfRuleDefs,
      });

      expect(result.categories.performance.score).toBe(50);
      expect(findings.some(f => f.id === 'performance:performance-capped')).toBe(true);
    });

    it('does not cap when Lighthouse provides real lab metrics', () => {
      const findings: Finding[] = [];
      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: { ...mockConfig, lighthouseEnabled: true },
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: perfRuleDefs,
      });

      expect(result.categories.performance.score).toBe(100);
      expect(findings.some(f => f.id === 'performance:performance-capped')).toBe(false);
    });

    it('does not cap when real field data (CrUX) verifies performance', () => {
      const findings: Finding[] = [];
      const result = ScoringEngine.calculate({
        findings,
        pagesAudited: 1,
        config: mockConfig, // no Lighthouse
        tierConfig: TIER_PRESETS.standard,
        ruleDefinitions: perfRuleDefs,
        performanceVerified: true, // engine sets this when CrUX field data was applied
      });

      expect(result.categories.performance.score).toBe(100);
      expect(findings.some(f => f.id === 'performance:performance-capped')).toBe(false);
    });
  });
});
