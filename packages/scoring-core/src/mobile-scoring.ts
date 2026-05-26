import type { Finding } from '@seocore/sdk';
import {
  MOBILE_INDEXING_READINESS_SUBCHECKS,
  MOBILE_PERFORMANCE_SUBCHECKS,
  MOBILE_RESPONSIVE_DESIGN_SUBCHECKS,
  MOBILE_USABILITY_SUBCHECKS,
} from '@seocore/rules-mobile';

export interface MobileSubScores {
  usability: number;
  performance: number;
  responsive: number;
  indexing: number;
}

function hasMobileSignal(findings: Finding[], ...signals: string[]): boolean {
  return findings.some((finding) => {
    const subCheck = finding.subCheck ?? '';
    return signals.some((signal) => subCheck === signal || finding.id.includes(signal));
  });
}

export function calculateMobileScore(findings: Finding[], pagesAudited: number): { score: number; subScores: MobileSubScores } {
  const mobileFindings = findings.filter(f => f.category === 'mobile_seo');
  const scale = pagesAudited > 1 ? Math.log10(pagesAudited + 9) : 1;

  let usabilityScore = 0;
  
  let viewportScore = 40;
  if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.MISSING_VIEWPORT, MOBILE_USABILITY_SUBCHECKS.UNVERIFIABLE_USABILITY)) {
    viewportScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.INVALID_VIEWPORT)) {
    viewportScore = 20 / scale;
  }
  usabilityScore += viewportScore;

  let layoutScore = 20;
  if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.NO_INLINE_STYLES, MOBILE_USABILITY_SUBCHECKS.UNVERIFIABLE_USABILITY)) {
    layoutScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.FIXED_WIDTH)) {
    layoutScore = 0;
  }
  usabilityScore += layoutScore;

  let navigationScore = 15;
  if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.NO_NAV_ELEMENT, MOBILE_USABILITY_SUBCHECKS.UNVERIFIABLE_USABILITY)) {
    navigationScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.POOR_NAVIGATION)) {
    navigationScore = 5 / scale;
  }
  usabilityScore += navigationScore;

  let tapTargetsScore = 25;
  if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.NO_TAP_TARGETS, MOBILE_USABILITY_SUBCHECKS.UNVERIFIABLE_USABILITY)) {
    tapTargetsScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.TAP_TARGET)) {
    tapTargetsScore = 10 / scale;
  }
  usabilityScore += tapTargetsScore;


  let performanceScore = 0;

  let lcpScore = 35;
  if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_LCP, 'unverifiable-performance')) {
    lcpScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.POOR_LCP)) {
    lcpScore = 5 / scale;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.NEEDS_IMPROVEMENT_LCP)) {
    lcpScore = 15 / scale;
  }
  performanceScore += lcpScore;

  let clsScore = 25;
  if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_CLS, 'unverifiable-performance')) {
    clsScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.POOR_CLS)) {
    clsScore = 5 / scale;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.NEEDS_IMPROVEMENT_CLS)) {
    clsScore = 10 / scale;
  }
  performanceScore += clsScore;

  let jsExecutionScore = 15;
  if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_JS_EXECUTION, 'unverifiable-performance')) {
    jsExecutionScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.EXCESSIVE_JS)) {
    jsExecutionScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.HEAVY_JS)) {
    jsExecutionScore = 5 / scale;
  }
  performanceScore += jsExecutionScore;

  let imageLoadScore = 15;
  if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.NO_IMAGES_FOUND, MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_IMAGE_LOAD, 'unverifiable-performance')) {
    imageLoadScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.HEAVY_IMAGES)) {
    imageLoadScore = 5 / scale;
  }
  performanceScore += imageLoadScore;

  let renderBlockingScore = 10;
  if (hasMobileSignal(mobileFindings, MOBILE_PERFORMANCE_SUBCHECKS.RENDER_BLOCKING)) {
    renderBlockingScore = 5 / scale;
  }
  performanceScore += renderBlockingScore;


  const hasUnverifiablePerf = hasMobileSignal(mobileFindings, 'unverifiable-performance', MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_LCP);
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


  let responsiveScore = 0;

  let mediaQueriesScore = 50;
  if (hasMobileSignal(mobileFindings, MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.MISSING_MEDIA_QUERIES)) {
    mediaQueriesScore = 0;
  }
  responsiveScore += mediaQueriesScore;

  let layoutContainersScore = 25;
  if (hasMobileSignal(mobileFindings, MOBILE_USABILITY_SUBCHECKS.NO_INLINE_STYLES, MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.FIXED_LAYOUT)) {
    layoutContainersScore = 0;
  }
  responsiveScore += layoutContainersScore;

  let breakpointsScore = 25;
  if (hasMobileSignal(mobileFindings, MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.MISSING_BREAKPOINTS, MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.UNVERIFIABLE_BREAKPOINTS)) {
    breakpointsScore = 0;
  }
  responsiveScore += breakpointsScore;


  let indexingScore = 0;

  let contentParityScore = 40;
  if (hasMobileSignal(mobileFindings, MOBILE_INDEXING_READINESS_SUBCHECKS.HIDDEN_CONTENT)) {
    contentParityScore = 0;
  }
  indexingScore += contentParityScore;

  let schemaScore = 40;
  if (hasMobileSignal(mobileFindings, MOBILE_INDEXING_READINESS_SUBCHECKS.MISSING_SCHEMA)) {
    schemaScore = 0;
  }
  indexingScore += schemaScore;

  let canonicalScore = 20;
  if (hasMobileSignal(mobileFindings, MOBILE_INDEXING_READINESS_SUBCHECKS.MISSING_CANONICAL)) {
    canonicalScore = 0;
  } else if (hasMobileSignal(mobileFindings, MOBILE_INDEXING_READINESS_SUBCHECKS.CANONICAL_MISMATCH)) {
    canonicalScore = 10 / scale;
  }
  indexingScore += canonicalScore;


  usabilityScore = Math.max(0, Math.min(100, Math.round(usabilityScore)));
  performanceScore = Math.max(0, Math.min(100, Math.round(performanceScore)));
  responsiveScore = Math.max(0, Math.min(100, Math.round(responsiveScore)));
  indexingScore = Math.max(0, Math.min(100, Math.round(indexingScore)));

  const totalScore = Math.round(
    (usabilityScore * 0.35) +
    (performanceScore * 0.35) +
    (responsiveScore * 0.20) +
    (indexingScore * 0.10)
  );

  return {
    score: totalScore,
    subScores: {
      usability: usabilityScore,
      performance: performanceScore,
      responsive: responsiveScore,
      indexing: indexingScore,
    },
  };
}
