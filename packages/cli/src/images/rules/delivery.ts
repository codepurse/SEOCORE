import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const DeliveryRule: ImageRule = {
  id: 'image-delivery',
  name: 'Served vs Rendered Image Size',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    // This rule requires Playwright runtime data
    if (!context.playwright) return [];

    for (const img of images) {
      if (img.fetchFailed || img.decodeFailed) continue;
      if (!img.renderedWidth || !img.naturalWidth || !img.bytes) continue;

      // Skip hidden/unrendered images
      if (img.renderedWidth <= 0 || img.renderedHeight === 0) continue;

      const dpr = 1.5; // Heuristic density ratio multiplier
      const maxRecommendedWidth = Math.round(img.renderedWidth * dpr);

      // Rule: natural dimension is much larger than rendering constraint
      if (img.naturalWidth > maxRecommendedWidth * 1.2) {
        // Calculate potential wastage
        const sizeRatio = maxRecommendedWidth / img.naturalWidth;
        const potentialWastage = Math.max(0, img.bytes * (1 - sizeRatio * sizeRatio));
        const wastageKb = (potentialWastage / 1024).toFixed(1);

        const severity = potentialWastage > 100 * 1024 ? 'error' : 'warning';

        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity,
          message: `Oversized image delivery. Natural width is ${img.naturalWidth}px but it is rendered at only ${img.renderedWidth}px.`,
          recommendation: `Serve responsive resized variants using srcset. Resizing this image closer to its rendered container dimensions can save up to ${wastageKb}KB.`,
          evidence: `Rendered: ${img.renderedWidth}px. Natural: ${img.naturalWidth}px. Estimated wastage: ${wastageKb}KB.`,
        });
      }
    }

    return findings;
  }
};
