import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkMainText(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  if (rendered.wordCount > 100 && raw.wordCount < 30) {
    diffs.push({
      id: createDiffId('content.mainTextMissing', ctx.url, { raw: raw.wordCount, rendered: rendered.wordCount }),
      aspect: 'content.mainTextMissing',
      severity: 'critical',
      confidence: 'certain',
      title: 'Main content hydrated client-side',
      description: 'Rendered DOM contains substantial text, but raw HTML has almost none. Search engines may not see the primary content.',
      raw: raw.wordCount,
      rendered: rendered.wordCount,
      delta: rendered.wordCount - raw.wordCount,
      evidence: [`Raw visible text: ~${raw.wordCount} words`, `Rendered visible text: ~${rendered.wordCount} words`],
    });
  }

  return diffs;
}
