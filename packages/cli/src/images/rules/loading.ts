import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const LoadingRule: ImageRule = {
  id: 'image-loading',
  name: 'Loading and Decoding Strategies',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    images.forEach((img, index) => {
      // 1. Determine if image is above or below the fold
      let isAboveFold = false;
      let hasRuntimeData = false;

      if (img.inViewport !== undefined) {
        isAboveFold = img.inViewport;
        hasRuntimeData = true;
      } else {
        // Static DOM heuristic: First 3 images are assumed above fold
        isAboveFold = index < 3;
      }

      const isLoadingLazy = img.loading === 'lazy';
      const hasDecodingAsync = img.decoding === 'async';

      // Above-fold / LCP image with loading="lazy" (Hurts LCP performance)
      if (isAboveFold && isLoadingLazy) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'error',
          message: `Above-fold or critical image is configured with loading="lazy". This delays image fetch and hurts Largest Contentful Paint (LCP).`,
          recommendation: `Remove loading="lazy" from this image. For critical, above-fold images, load them eagerly and consider adding fetchpriority="high".`,
          evidence: hasRuntimeData ? 'Verified in viewport via headless browser runtime.' : 'Estimated above-fold based on static DOM order heuristic.',
        });
      }

      // Below-fold image without loading="lazy" (Useless bytes downloaded on start)
      if (!isAboveFold && !isLoadingLazy && !img.isPreload) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'warning',
          message: `Below-fold or offscreen image is missing loading="lazy".`,
          recommendation: `Add loading="lazy" attribute to defer downloading this image until the user scrolls near it, saving initial page load bandwidth.`,
          evidence: hasRuntimeData ? 'Verified offscreen via headless browser runtime.' : 'Estimated below-fold based on static DOM order heuristic.',
        });
      }

      // Missing decoding="async" on non-critical images
      if (!isAboveFold && !hasDecodingAsync && !img.isPreload) {
        findings.push({
          ruleId: 'image-decoding',
          imageSrc: img.src,
          severity: 'info',
          message: `Offscreen image is missing decoding="async".`,
          recommendation: `Add decoding="async" attribute to allow the browser to decode image content off the main thread, reducing CPU and main thread blocking.`,
          evidence: `decoding attribute is: ${img.decoding || 'not specified'}.`,
        });
      }
    });

    return findings;
  }
};
