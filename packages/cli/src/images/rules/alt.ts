import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const AltRule: ImageRule = {
  id: 'image-alt',
  name: 'Alternative Text Accessibility',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    for (const img of images) {
      const alt = img.alt;
      const isMissingAlt = alt === undefined || alt.trim() === '';

      if (isMissingAlt) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'warning',
          message: 'Image is missing alternative text (alt attribute).',
          recommendation: 'Add a descriptive alt attribute. Alternative text is critical for accessibility (screen readers) and helps search engine crawlers understand image contents for image search ranking.',
          evidence: `alt attribute is: ${alt === undefined ? 'missing' : 'empty ("")'}.`,
        });
      }
    }

    return findings;
  }
};
