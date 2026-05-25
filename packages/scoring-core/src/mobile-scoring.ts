import type { CategoryScore, Finding } from '@seocore/sdk';

export interface MobileSubScores {
  usability: number;
  performance: number;
  responsive: number;
  indexing: number;
}

export function calculateMobileScore(mobileFindings: Finding[], pagesAudited: number): { score: number; subScores: MobileSubScores } {
  const scale = pagesAudited > 1 ? Math.log10(pagesAudited + 9) : 1;

  // Usability (35%)
  let usabilityScore = 100;
  for (const f of mobileFindings) {
    if (f.ruleId === 'mobile-usability') {
      if (f.id.includes('missing-viewport')) usabilityScore -= 40 / scale;
      if (f.id.includes('invalid-viewport')) usabilityScore -= 20 / scale;
      if (f.id.includes('fixed-width')) usabilityScore -= 20 / scale;
      if (f.id.includes('poor-navigation')) usabilityScore -= 15 / scale;
      if (f.id.includes('tap-target')) usabilityScore -= 15 / scale;
    }
  }

  // Performance (35%)
  let performanceScore = 100;
  for (const f of mobileFindings) {
    if (f.ruleId === 'mobile-performance') {
      if (f.id.includes('poor-lcp')) performanceScore -= 40 / scale;
      if (f.id.includes('needs-improvement-lcp')) performanceScore -= 20 / scale;
      if (f.id.includes('poor-cls')) performanceScore -= 30 / scale;
      if (f.id.includes('needs-improvement-cls')) performanceScore -= 15 / scale;
      if (f.id.includes('heavy-js')) performanceScore -= 20 / scale;
      if (f.id.includes('excessive-js')) performanceScore -= 40 / scale;
      if (f.id.includes('heavy-images')) performanceScore -= 15 / scale;
      if (f.id.includes('render-blocking')) performanceScore -= 15 / scale;
    }
  }

  // Responsive (20%)
  let responsiveScore = 100;
  for (const f of mobileFindings) {
    if (f.ruleId === 'mobile-responsive') {
      if (f.id.includes('missing-media-queries')) responsiveScore -= 50 / scale;
      if (f.id.includes('fixed-layout')) responsiveScore -= 25 / scale;
      if (f.id.includes('missing-breakpoints')) responsiveScore -= 25 / scale;
    }
  }

  // Indexing (10%)
  let indexingScore = 100;
  for (const f of mobileFindings) {
    if (f.ruleId === 'mobile-indexing') {
      if (f.id.includes('hidden-content')) indexingScore -= 40 / scale;
      if (f.id.includes('missing-schema')) indexingScore -= 45 / scale;
      if (f.id.includes('missing-canonical')) indexingScore -= 40 / scale;
      if (f.id.includes('canonical-mismatch')) indexingScore -= 20 / scale;
    }
  }

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
