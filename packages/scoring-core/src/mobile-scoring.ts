import type { Finding } from '@seocore/sdk';

export interface MobileSubScores {
  usability: number;
  performance: number;
  responsive: number;
  indexing: number;
}

export function calculateMobileScore(findings: Finding[], pagesAudited: number): { score: number; subScores: MobileSubScores } {
  const mobileFindings = findings.filter(f => f.category === 'mobile_seo');
  const scale = pagesAudited > 1 ? Math.log10(pagesAudited + 9) : 1;

  let usabilityScore = 0;
  
  let viewportScore = 40;
  if (mobileFindings.some(f => f.id.includes('missing-viewport') || f.id.includes('unverifiable-usability'))) {
    viewportScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('invalid-viewport'))) {
    viewportScore = 20 / scale;
  }
  usabilityScore += viewportScore;

  let layoutScore = 20;
  if (mobileFindings.some(f => f.id.includes('no-inline-styles') || f.id.includes('unverifiable-usability'))) {
    layoutScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('fixed-width'))) {
    layoutScore = 0;
  }
  usabilityScore += layoutScore;

  let navigationScore = 15;
  if (mobileFindings.some(f => f.id.includes('no-nav-element') || f.id.includes('unverifiable-usability'))) {
    navigationScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('poor-navigation'))) {
    navigationScore = 5 / scale;
  }
  usabilityScore += navigationScore;

  let tapTargetsScore = 25;
  if (mobileFindings.some(f => f.id.includes('no-tap-targets') || f.id.includes('unverifiable-usability'))) {
    tapTargetsScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('tap-target'))) {
    tapTargetsScore = 10 / scale;
  }
  usabilityScore += tapTargetsScore;


  let performanceScore = 0;

  let lcpScore = 35;
  if (mobileFindings.some(f => f.id.includes('unverifiable-lcp') || f.id.includes('unverifiable-performance'))) {
    lcpScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('poor-lcp'))) {
    lcpScore = 5 / scale;
  } else if (mobileFindings.some(f => f.id.includes('needs-improvement-lcp'))) {
    lcpScore = 15 / scale;
  }
  performanceScore += lcpScore;

  let clsScore = 25;
  if (mobileFindings.some(f => f.id.includes('unverifiable-cls') || f.id.includes('unverifiable-performance'))) {
    clsScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('poor-cls'))) {
    clsScore = 5 / scale;
  } else if (mobileFindings.some(f => f.id.includes('needs-improvement-cls'))) {
    clsScore = 10 / scale;
  }
  performanceScore += clsScore;

  let jsExecutionScore = 15;
  if (mobileFindings.some(f => f.id.includes('unverifiable-js-execution') || f.id.includes('unverifiable-performance'))) {
    jsExecutionScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('excessive-js'))) {
    jsExecutionScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('heavy-js'))) {
    jsExecutionScore = 5 / scale;
  }
  performanceScore += jsExecutionScore;

  let imageLoadScore = 15;
  if (mobileFindings.some(f => f.id.includes('no-images-found') || f.id.includes('unverifiable-image-load') || f.id.includes('unverifiable-performance'))) {
    imageLoadScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('heavy-images'))) {
    imageLoadScore = 5 / scale;
  }
  performanceScore += imageLoadScore;

  let renderBlockingScore = 10;
  if (mobileFindings.some(f => f.id.includes('render-blocking'))) {
    renderBlockingScore = 5 / scale;
  }
  performanceScore += renderBlockingScore;


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


  let responsiveScore = 0;

  let mediaQueriesScore = 50;
  if (mobileFindings.some(f => f.id.includes('missing-media-queries'))) {
    mediaQueriesScore = 0;
  }
  responsiveScore += mediaQueriesScore;

  let layoutContainersScore = 25;
  if (mobileFindings.some(f => f.id.includes('no-inline-styles') || f.id.includes('fixed-layout'))) {
    layoutContainersScore = 0;
  }
  responsiveScore += layoutContainersScore;

  let breakpointsScore = 25;
  if (mobileFindings.some(f => f.id.includes('missing-breakpoints') || f.id.includes('unverifiable-breakpoints'))) {
    breakpointsScore = 0;
  }
  responsiveScore += breakpointsScore;


  let indexingScore = 0;

  let contentParityScore = 40;
  if (mobileFindings.some(f => f.id.includes('hidden-content'))) {
    contentParityScore = 0;
  }
  indexingScore += contentParityScore;

  let schemaScore = 40;
  if (mobileFindings.some(f => f.id.includes('missing-schema'))) {
    schemaScore = 0;
  }
  indexingScore += schemaScore;

  let canonicalScore = 20;
  if (mobileFindings.some(f => f.id.includes('missing-canonical'))) {
    canonicalScore = 0;
  } else if (mobileFindings.some(f => f.id.includes('canonical-mismatch'))) {
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
