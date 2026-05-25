import { ImageRecord, ImageFinding, ImageRuleContext } from './types.js';
import { allImageRules } from './rules/index.js';

export function analyzeImages(
  images: ImageRecord[],
  context: ImageRuleContext
): ImageFinding[] {
  const allFindings: ImageFinding[] = [];

  for (const rule of allImageRules) {
    try {
      const findings = rule.evaluate(images, context);
      allFindings.push(...findings);
    } catch (err: any) {
      console.error(`Error running image rule "${rule.name}" (${rule.id}):`, err);
    }
  }

  return allFindings;
}
