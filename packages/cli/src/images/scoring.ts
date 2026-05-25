import { ImageRecord, ImageFinding, BudgetViolation, ImageAuditResult, ImageRuleContext } from './types.js';
import { Severity } from '@seocore/sdk';

export function calculateScoringAndBudgets(
  images: ImageRecord[],
  findings: ImageFinding[],
  context: {
    url: string;
    mode: 'single' | 'crawl';
    playwright: boolean;
    thresholdKb: number;
  }
): ImageAuditResult {
  // 1. Calculate individual image scores
  const imageScores = new Map<string, number>();
  const imageWorstOffenders = new Map<string, string>();

  const severityDeductions: Record<Severity, number> = {
    critical: 35,
    error: 20,
    warning: 10,
    info: 2,
  };

  // Group findings by image
  const imageFindingsMap = new Map<string, ImageFinding[]>();
  for (const img of images) {
    imageFindingsMap.set(img.src, []);
  }

  for (const finding of findings) {
    const list = imageFindingsMap.get(finding.imageSrc);
    if (list) {
      list.push(finding);
    }
  }

  for (const img of images) {
    const imgFindings = imageFindingsMap.get(img.src) || [];
    let score = 100;
    let worstSeverityScore = 0;
    let worstRuleId = '';

    for (const f of imgFindings) {
      const deduction = severityDeductions[f.severity] || 0;
      score -= deduction;
      if (deduction > worstSeverityScore) {
        worstSeverityScore = deduction;
        worstRuleId = f.ruleId;
      }
    }

    score = Math.max(0, score);
    imageScores.set(img.src, score);
    if (worstRuleId) {
      imageWorstOffenders.set(img.src, worstRuleId);
    }
    // Store score back in the record as temporary or metadata
    (img as any).score = score;
    (img as any).worstOffender = worstRuleId || undefined;
  }

  // 2. Aggregate overall score weighted by bytes
  let weightedScoreSum = 0;
  let totalBytes = 0;
  let totalImages = images.length;

  let modernFormatCount = 0;
  let hasAltCount = 0;
  let hasDimsCount = 0;
  let belowFoldCount = 0;
  let belowFoldLazyCount = 0;

  for (const img of images) {
    const bytes = img.bytes || 0;
    totalBytes += bytes;
    
    const score = imageScores.get(img.src) ?? 100;
    weightedScoreSum += score * bytes;

    // Stats calculations
    const format = img.decodedFormat?.toLowerCase() || '';
    if (format === 'webp' || format === 'avif' || format === 'svg') {
      modernFormatCount++;
    }

    // Check alt text (absence of image-alt findings)
    const imgFindings = imageFindingsMap.get(img.src) || [];
    const hasAltFinding = imgFindings.some(f => f.ruleId === 'image-alt');
    if (!hasAltFinding && img.alt !== undefined && img.alt.trim() !== '') {
      hasAltCount++;
    }

    // Check dimensions (absence of image-cls findings)
    const hasClsFinding = imgFindings.some(f => f.ruleId === 'image-cls');
    if (!hasClsFinding && img.width !== undefined && img.height !== undefined) {
      hasDimsCount++;
    }

    // Check loading below fold
    const isLazy = img.loading === 'lazy';
    if (img.inViewport === false) {
      belowFoldCount++;
      if (isLazy) {
        belowFoldLazyCount++;
      }
    }
  }

  // Fallback if totalBytes is 0 (all requests failed, or no image files sizes fetched)
  let overallScore = 100;
  if (totalBytes > 0) {
    overallScore = Math.round(weightedScoreSum / totalBytes);
  } else if (totalImages > 0) {
    // If no bytes but images exist, use standard average
    let sum = 0;
    for (const score of imageScores.values()) {
      sum += score;
    }
    overallScore = Math.round(sum / totalImages);
  }

  // 3. Budgets checks
  const budgetViolations: BudgetViolation[] = [];
  const mobileBudgetBytes = 1.5 * 1024 * 1024; // 1.5MB
  const mobileBudgetPassed = totalBytes <= mobileBudgetBytes;

  if (!mobileBudgetPassed) {
    budgetViolations.push({
      metric: 'total-payload-size',
      limit: '1.5MB',
      actual: `${(totalBytes / (1024 * 1024)).toFixed(2)}MB`,
      severity: 'error',
      message: `Page image payload exceeds 1.5MB mobile budget limit.`,
    });
  }

  const lcpImage = images.find(img => img.isLcp === true);
  const lcpImageWeightBytes = lcpImage?.bytes || 0;
  const lcpBudgetBytes = 100 * 1024; // 100KB target
  const lcpBudgetPassed = lcpImageWeightBytes <= lcpBudgetBytes;

  if (lcpImage && !lcpBudgetPassed) {
    budgetViolations.push({
      metric: 'lcp-image-weight',
      limit: '100KB',
      actual: `${(lcpImageWeightBytes / 1024).toFixed(1)}KB`,
      severity: 'warning',
      message: `The Largest Contentful Paint (LCP) image weight exceeds the 100KB budget limit.`,
    });
  }

  const thresholdBytes = context.thresholdKb * 1024;
  const oversizedCount = images.filter(img => (img.bytes || 0) > thresholdBytes).length;

  if (oversizedCount > 0) {
    budgetViolations.push({
      metric: 'oversized-images-count',
      limit: 0,
      actual: oversizedCount,
      severity: 'warning',
      message: `${oversizedCount} images exceed the ${context.thresholdKb}KB individual budget.`,
    });
  }

  return {
    url: context.url,
    crawledAt: new Date().toISOString(),
    mode: context.mode,
    playwright: context.playwright,
    summary: {
      totalImages,
      totalBytes,
      avgBytes: totalImages > 0 ? Math.round(totalBytes / totalImages) : 0,
      score: overallScore,
      budgets: {
        totalPayloadBytes: totalBytes,
        mobileBudgetBytes,
        mobileBudgetPassed,
        lcpImageWeightBytes,
        lcpBudgetBytes,
        lcpBudgetPassed,
        oversizedCount,
      },
    },
    images,
    findings,
    budgetViolations,
  };
}
