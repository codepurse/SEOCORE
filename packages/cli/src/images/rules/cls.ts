import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const ClsRule: ImageRule = {
  id: 'image-cls',
  name: 'Layout Shift (CLS) Risk',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    for (const img of images) {
      const hasWidth = img.width !== undefined && img.width > 0;
      const hasHeight = img.height !== undefined && img.height > 0;
      const hasDims = hasWidth && hasHeight;
      const hasAspect = img.hasAspectRatio === true;

      if (!hasDims && !hasAspect) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'error',
          message: 'Image is missing intrinsic width and height dimensions or aspect-ratio styling.',
          recommendation: 'Specify width and height attributes directly on the <img> tag, or set aspect-ratio in CSS. This reserves correct vertical space before image loads, preventing Cumulative Layout Shift (CLS) issues.',
          evidence: `width: ${img.width ?? 'missing'}, height: ${img.height ?? 'missing'}. inline aspect-ratio: ${img.hasAspectRatio ? 'yes' : 'no'}.`,
        });
      }
    }

    return findings;
  }
};
