import { Category, CategoryScore, Finding, SeoConfig, Severity, RuleDefinition, ExecutionTierConfig } from '@seocore/sdk';

const DEFAULT_CATEGORY_WEIGHTS: Record<Category, number> = {
  indexing: 0.15,
  metadata: 0.15,
  links: 0.10,
  seo: 0.10,
  ai_visibility: 0.15,
  accessibility: 0.10,
  performance: 0.10,
  mobile_seo: 0.15,
  backlink_intelligence: 0.10,
};

const DEFAULT_FLOOR_SCORES: Record<Category, number> = {
  indexing: 20,
  metadata: 20,
  links: 20,
  seo: 20,
  ai_visibility: 20,
  accessibility: 20,
  performance: 20,
  mobile_seo: 20,
  backlink_intelligence: 20,
};

const SEVERITY_MULTIPLIERS: Record<Severity, number> = {
  critical: 1.5,
  error: 1.0,
  warning: 0.4,
  info: 0.05,
};

export class ScoringEngine {
  static calculate(
    findings: Finding[],
    pagesAudited: number,
    config: SeoConfig,
    ruleDefinitions: RuleDefinition[],
    tierConfig?: ExecutionTierConfig
  ): { score: number; categories: Record<Category, CategoryScore> } {
    // 1. Get scoring settings from tier config or use defaults
    const categoryWeights = tierConfig?.scoring.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS;
    const floorScores = tierConfig?.scoring.floorScores ?? DEFAULT_FLOOR_SCORES;

    // 2. Initialize category scores
    const categories: Record<Category, CategoryScore> = {
      indexing: this.initCategoryScore('indexing'),
      metadata: this.initCategoryScore('metadata'),
      links: this.initCategoryScore('links'),
      seo: this.initCategoryScore('seo'),
      ai_visibility: this.initCategoryScore('ai_visibility'),
      accessibility: this.initCategoryScore('accessibility'),
      performance: this.initCategoryScore('performance'),
      mobile_seo: this.initCategoryScore('mobile_seo'),
      backlink_intelligence: this.initCategoryScore('backlink_intelligence'),
    };

    // 3. Count findings by severity per category
    for (const finding of findings) {
      const catScore = categories[finding.category];
      if (catScore) {
        catScore.findingsCount[finding.severity]++;
      }
    }

    // 4. Map rule definitions for fast weight lookup
    const ruleWeights = new Map<string, number>();
    const ruleSeverities = new Map<string, Severity>();
    for (const rDef of ruleDefinitions) {
      const override = config.ruleOverrides?.[rDef.id];
      ruleWeights.set(rDef.id, override?.weight ?? rDef.defaultWeight);
      ruleSeverities.set(rDef.id, override?.severity ?? rDef.defaultSeverity);
    }

    // 5. Calculate deductions per category
    const categoryDeductions: Record<Category, number> = {
      indexing: 0,
      metadata: 0,
      links: 0,
      seo: 0,
      ai_visibility: 0,
      accessibility: 0,
      performance: 0,
      mobile_seo: 0,
      backlink_intelligence: 0,
    };

    for (const finding of findings) {
      const ruleWeight = ruleWeights.get(finding.ruleId) ?? 5; // default to medium if not found
      const sev = finding.severity;
      const multiplier = SEVERITY_MULTIPLIERS[sev];

      // Deduction factor is amplified if we have very few pages to make single-page audits meaningful,
      // or normalized across page volume to avoid massive sites bottoming out at 0 immediately.
      // We scale the deduction by page volume: deduction = (weight * multiplier) / Math.log10(pagesAudited + 9)
      const rawDeduction = ruleWeight * multiplier;
      const normalizedDeduction = pagesAudited > 1 ? rawDeduction / Math.log10(pagesAudited + 9) : rawDeduction;

      categoryDeductions[finding.category] += normalizedDeduction;
    }

    // 6. Finalize category scores with floor limits
    for (const cat of Object.keys(categories) as Category[]) {
      const rawScore = 100 - categoryDeductions[cat];
      categories[cat].totalDeductions = Math.round(categoryDeductions[cat] * 10) / 10;
      // Apply floor score from tier config
      categories[cat].score = Math.max(floorScores[cat] ?? 0, Math.min(100, Math.round(rawScore)));
    }

    // Special handling for Mobile SEO Category to ensure precise deterministic weighting of sub-metrics:
    if (categories.mobile_seo) {
      const hasMobileRules = ruleDefinitions.some(r => r.category === 'mobile_seo');
      if (!hasMobileRules) {
        categories.mobile_seo.score = 100;
        categories.mobile_seo.totalDeductions = 0;
      } else {
        // Find mobile findings
        const mobileFindings = findings.filter(f => f.category === 'mobile_seo');
        
        const scale = pagesAudited > 1 ? Math.log10(pagesAudited + 9) : 1;

        // Usability sub-checks (35%)
        let usabilityScore = 0;
        
        // Viewport Sub-Check (40 points)
        let viewportScore = 40;
        if (mobileFindings.some(f => f.id.includes('missing-viewport') || f.id.includes('unverifiable-usability'))) {
          viewportScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('invalid-viewport'))) {
          viewportScore = 20 / scale;
        }
        usabilityScore += viewportScore;

        // Layout Sub-Check (20 points)
        let layoutScore = 20;
        if (mobileFindings.some(f => f.id.includes('no-inline-styles') || f.id.includes('unverifiable-usability'))) {
          layoutScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('fixed-width'))) {
          layoutScore = 0;
        }
        usabilityScore += layoutScore;

        // Navigation Sub-Check (15 points)
        let navigationScore = 15;
        if (mobileFindings.some(f => f.id.includes('no-nav-element') || f.id.includes('unverifiable-usability'))) {
          navigationScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('poor-navigation'))) {
          navigationScore = 5 / scale;
        }
        usabilityScore += navigationScore;

        // Tap Targets Sub-Check (25 points)
        let tapTargetsScore = 25;
        if (mobileFindings.some(f => f.id.includes('no-tap-targets') || f.id.includes('unverifiable-usability'))) {
          tapTargetsScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('tap-target'))) {
          tapTargetsScore = 10 / scale;
        }
        usabilityScore += tapTargetsScore;


        // Performance sub-checks (35%)
        let performanceScore = 0;

        // LCP Sub-Check (35 points)
        let lcpScore = 35;
        if (mobileFindings.some(f => f.id.includes('unverifiable-lcp') || f.id.includes('unverifiable-performance'))) {
          lcpScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('poor-lcp'))) {
          lcpScore = 5 / scale;
        } else if (mobileFindings.some(f => f.id.includes('needs-improvement-lcp'))) {
          lcpScore = 15 / scale;
        }
        performanceScore += lcpScore;

        // CLS Sub-Check (25 points)
        let clsScore = 25;
        if (mobileFindings.some(f => f.id.includes('unverifiable-cls') || f.id.includes('unverifiable-performance'))) {
          clsScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('poor-cls'))) {
          clsScore = 5 / scale;
        } else if (mobileFindings.some(f => f.id.includes('needs-improvement-cls'))) {
          clsScore = 10 / scale;
        }
        performanceScore += clsScore;

        // JS Heaviness Sub-Check (15 points)
        let jsExecutionScore = 15;
        if (mobileFindings.some(f => f.id.includes('unverifiable-js-execution') || f.id.includes('unverifiable-performance'))) {
          jsExecutionScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('excessive-js'))) {
          jsExecutionScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('heavy-js'))) {
          jsExecutionScore = 5 / scale;
        }
        performanceScore += jsExecutionScore;

        // Image Optimization Sub-Check (15 points)
        let imageLoadScore = 15;
        if (mobileFindings.some(f => f.id.includes('no-images-found') || f.id.includes('unverifiable-image-load') || f.id.includes('unverifiable-performance'))) {
          imageLoadScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('heavy-images'))) {
          imageLoadScore = 5 / scale;
        }
        performanceScore += imageLoadScore;

        // Render Blocking Sub-Check (10 points)
        let renderBlockingScore = 10;
        if (mobileFindings.some(f => f.id.includes('render-blocking'))) {
          renderBlockingScore = 5 / scale;
        }
        performanceScore += renderBlockingScore;


        // Apply cap for static Performance proxy
        const hasUnverifiablePerf = mobileFindings.some(f => f.id.includes('unverifiable-performance') || f.id.includes('unverifiable-lcp'));
        const hasRealPerfData = !hasUnverifiablePerf;
        
        const rawPerfScore = performanceScore;
        if (!hasRealPerfData) {
          performanceScore = Math.min(rawPerfScore, 50);
          if (!findings.some(f => f.id === 'mobile-performance:performance-capped')) {
            findings.push({
              id: 'mobile-performance:performance-capped',
              ruleId: 'mobile-performance',
              severity: 'info',
              category: 'mobile_seo',
              url: findings[0]?.url || '',
              message: 'Performance capped at 50 — real metrics unavailable',
              recommendation: 'Enable Playwright crawl to unlock full performance scores.'
            });
          }
        }


        // Responsive sub-checks (20%)
        let responsiveScore = 0;

        // Media Queries Sub-Check (50 points)
        let mediaQueriesScore = 50;
        if (mobileFindings.some(f => f.id.includes('missing-media-queries'))) {
          mediaQueriesScore = 0;
        }
        responsiveScore += mediaQueriesScore;

        // Layout Containers Sub-Check (25 points)
        let layoutContainersScore = 25;
        if (mobileFindings.some(f => f.id.includes('no-inline-styles') || f.id.includes('fixed-layout'))) {
          layoutContainersScore = 0;
        }
        responsiveScore += layoutContainersScore;

        // Breakpoints Sub-Check (25 points)
        let breakpointsScore = 25;
        if (mobileFindings.some(f => f.id.includes('missing-breakpoints') || f.id.includes('unverifiable-breakpoints'))) {
          breakpointsScore = 0;
        }
        responsiveScore += breakpointsScore;


        // Indexing sub-checks (10%)
        let indexingScore = 0;

        // Content Parity Sub-Check (40 points)
        let contentParityScore = 40;
        if (mobileFindings.some(f => f.id.includes('hidden-content'))) {
          contentParityScore = 0;
        }
        indexingScore += contentParityScore;

        // Schema/Structured Data Sub-Check (40 points)
        let schemaScore = 40;
        if (mobileFindings.some(f => f.id.includes('missing-schema'))) {
          schemaScore = 0;
        }
        indexingScore += schemaScore;

        // Canonical URL Sub-Check (20 points)
        let canonicalScore = 20;
        if (mobileFindings.some(f => f.id.includes('missing-canonical'))) {
          canonicalScore = 0;
        } else if (mobileFindings.some(f => f.id.includes('canonical-mismatch'))) {
          canonicalScore = 10 / scale;
        }
        indexingScore += canonicalScore;


        // Clean and scale
        usabilityScore = Math.max(0, Math.min(100, Math.round(usabilityScore)));
        performanceScore = Math.max(0, Math.min(100, Math.round(performanceScore)));
        responsiveScore = Math.max(0, Math.min(100, Math.round(responsiveScore)));
        indexingScore = Math.max(0, Math.min(100, Math.round(indexingScore)));

        const calculatedMobileScore = Math.round(
          (usabilityScore * 0.35) +
          (performanceScore * 0.35) +
          (responsiveScore * 0.20) +
          (indexingScore * 0.10)
        );

        categories.mobile_seo.score = calculatedMobileScore;
        categories.mobile_seo.totalDeductions = Math.round((100 - calculatedMobileScore) * 10) / 10;
      }
    }

    // 7. Calculate total weighted SEO score using tier config weights
    let weightedSum = 0;
    let weightTotal = 0;

    for (const cat of Object.keys(categories) as Category[]) {
      const catWeight = categoryWeights[cat];
      if (catWeight !== undefined) {
        weightedSum += categories[cat].score * catWeight;
        weightTotal += catWeight;
      }
    }

    const totalScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 100;

    return {
      score: totalScore,
      categories,
    };
  }

  private static initCategoryScore(category: Category): CategoryScore {
    return {
      category,
      score: 100,
      totalDeductions: 0,
      findingsCount: {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0,
      },
    };
  }
}
