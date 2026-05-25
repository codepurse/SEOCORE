import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const FormatRule: ImageRule = {
  id: 'image-format',
  name: 'Image Format Optimization',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    for (const img of images) {
      if (img.fetchFailed || img.decodeFailed) continue;

      const format = img.decodedFormat?.toLowerCase();
      const bytes = img.bytes || 0;

      // 1. Check for animated GIFs
      if (format === 'gif' && img.isAnimated) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'warning',
          message: 'Animated GIF detected. GIFs are highly inefficient for motion/animation.',
          recommendation: 'Replace animated GIFs with modern MP4 or WebM video elements using <video autoplay muted loop playsinline> tags to reduce payload by up to 90%.',
          evidence: `Format: gif (animated). File size: ${(bytes / 1024).toFixed(1)}KB.`,
        });
        continue; // skip other format rules for animated GIF
      }

      // 2. Check for PNG-24 used for non-alpha photos
      if (format === 'png' && img.hasAlpha === false && bytes > 30 * 1024) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'warning',
          message: 'Lossless PNG used for a photo or graphic without alpha transparency.',
          recommendation: 'Convert this image to JPEG, WebP, or AVIF. PNG is a lossless format and is unnecessarily large for images that do not require transparency.',
          evidence: `Format: png. Alpha: none. File size: ${(bytes / 1024).toFixed(1)}KB.`,
        });
        continue;
      }

      // 3. Check for legacy JPEG/PNG formats above 50KB
      const isLegacy = format === 'jpeg' || format === 'png';
      if (isLegacy && bytes > 50 * 1024) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'warning',
          message: `Legacy format (${img.decodedFormat?.toUpperCase()}) used for a large image (${(bytes / 1024).toFixed(1)}KB).`,
          recommendation: 'Serve this image in modern, highly-compressed formats like WebP or AVIF. These formats typically reduce file size by 30-50% compared to JPEG/PNG at equivalent quality.',
          evidence: `Format: ${format}. File size: ${(bytes / 1024).toFixed(1)}KB.`,
        });
      }
    }

    return findings;
  }
};
