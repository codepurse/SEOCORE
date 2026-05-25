import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const LcpRule: ImageRule = {
  id: 'image-lcp',
  name: 'LCP Image Optimization',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    if (!context.playwright) return [];

    const lcpImage = images.find(img => img.isLcp === true);
    if (!lcpImage) return [];

    const isModern = lcpImage.decodedFormat === 'webp' || lcpImage.decodedFormat === 'avif' || lcpImage.decodedFormat === 'svg';
    const isLazy = lcpImage.loading === 'lazy';
    const hasHighPriority = lcpImage.fetchpriority === 'high';
    
    // Check if there is another preloaded variant of this image (or if this image itself is a preload)
    const isPreloaded = lcpImage.isPreload || images.some(img => img.isPreload && img.src === lcpImage.src);

    if (isLazy) {
      findings.push({
        ruleId: this.id,
        imageSrc: lcpImage.src,
        severity: 'critical',
        message: 'The Largest Contentful Paint (LCP) image is lazy loaded, which severely delays page rendering.',
        recommendation: 'Remove loading="lazy" from the LCP image. Critical resources must be loaded eagerly to reduce start time.',
        evidence: `LCP selector: ${lcpImage.lcpSelector || 'unknown'}. loading attribute: lazy.`,
      });
    }

    if (!hasHighPriority) {
      findings.push({
        ruleId: this.id,
        imageSrc: lcpImage.src,
        severity: 'warning',
        message: 'The LCP image is missing fetchpriority="high".',
        recommendation: 'Add fetchpriority="high" to the LCP <img> element to instruct the browser to prioritize fetching this asset early.',
        evidence: `LCP selector: ${lcpImage.lcpSelector || 'unknown'}. fetchpriority is: ${lcpImage.fetchpriority || 'missing'}.`,
      });
    }

    if (!isPreloaded) {
      findings.push({
        ruleId: this.id,
        imageSrc: lcpImage.src,
        severity: 'warning',
        message: 'The LCP image is not preloaded.',
        recommendation: 'Add <link rel="preload" as="image" href="..."> with fetchpriority="high" inside the HTML <head> to warm up discovery for the LCP asset.',
        evidence: `LCP selector: ${lcpImage.lcpSelector || 'unknown'}. Preload link: not found.`,
      });
    }

    if (!isModern && lcpImage.decodedFormat) {
      findings.push({
        ruleId: this.id,
        imageSrc: lcpImage.src,
        severity: 'warning',
        message: `The LCP image is served in legacy format (${lcpImage.decodedFormat.toUpperCase()}).`,
        recommendation: 'Serve the LCP image in modern high-efficiency formats like WebP or AVIF to accelerate initial loading.',
        evidence: `Format: ${lcpImage.decodedFormat}.`,
      });
    }

    return findings;
  }
};
