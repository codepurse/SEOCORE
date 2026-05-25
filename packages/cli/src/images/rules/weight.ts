import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const WeightRule: ImageRule = {
  id: 'image-weight',
  name: 'Image Payload Weight',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];
    const thresholdBytes = context.thresholdKb * 1024;
    let totalPayloadBytes = 0;

    for (const img of images) {
      if (!img.bytes) continue;
      
      totalPayloadBytes += img.bytes;

      // Rule: individual image size exceeds threshold
      if (img.bytes > thresholdBytes) {
        const severity = img.bytes > 500 * 1024 ? 'critical' : 'warning';
        const sizeKb = (img.bytes / 1024).toFixed(1);
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity,
          message: `Image is extremely large (${sizeKb}KB), exceeding the ${context.thresholdKb}KB budget.`,
          recommendation: `Compress this image, resize its intrinsic dimensions, or convert it to modern high-efficiency formats like WebP or AVIF to reduce weight.`,
          evidence: `File size: ${sizeKb}KB. Threshold: ${context.thresholdKb}KB.`,
        });
      }
    }

    // Rule: total page payload (we check pages individually by summarizing images on each page)
    const pageWeights = new Map<string, number>();
    for (const img of images) {
      if (!img.bytes) continue;
      for (const page of img.pages) {
        pageWeights.set(page, (pageWeights.get(page) || 0) + img.bytes);
      }
    }

    for (const [page, weight] of pageWeights.entries()) {
      const budgetBytes = 1.5 * 1024 * 1024; // 1.5MB Mobile budget
      if (weight > budgetBytes) {
        const weightMb = (weight / (1024 * 1024)).toFixed(2);
        findings.push({
          ruleId: 'page-total-image-weight',
          imageSrc: page, // Page URL acts as the subject
          severity: 'error',
          message: `Total image payload on this page is ${weightMb}MB, exceeding the 1.5MB mobile budget.`,
          recommendation: `Optimize all images on this page. Implement lazy loading for offscreen images to avoid loading all assets on initial page load.`,
          evidence: `Total weight: ${weightMb}MB. Budget: 1.50MB.`,
        });
      }
    }

    return findings;
  }
};
