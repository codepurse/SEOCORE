import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkContentWordCount(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawWords = raw.wordCount;
  const renderedWords = rendered.wordCount;

  if (rawWords === renderedWords) return diffs;

  const maxWords = Math.max(rawWords, renderedWords);
  const minWords = Math.min(rawWords, renderedWords);
  const deltaPct = maxWords > 0 ? ((maxWords - minWords) / maxWords) * 100 : 0;

  let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
  if (deltaPct > 50) severity = 'critical';
  else if (deltaPct > 30) severity = 'high';
  else if (deltaPct > 10) severity = 'medium';
  else severity = 'low';

  const direction = renderedWords > rawWords ? 'increased' : 'decreased';

  diffs.push({
    id: createDiffId('content.wordCount', ctx.url, { raw: rawWords, rendered: renderedWords }),
    aspect: 'content.wordCount',
    severity,
    confidence: 'certain',
    title: `Visible word count ${direction} by ${Math.round(deltaPct)}%`,
    description: `Raw HTML contains ${rawWords} words; rendered DOM contains ${renderedWords} words. Large deltas suggest content is injected client-side.`,
    raw: rawWords,
    rendered: renderedWords,
    delta: renderedWords - rawWords,
    evidence: [`Raw words: ${rawWords}`, `Rendered words: ${renderedWords}`, `Delta: ${Math.round(deltaPct)}%`],
  });

  return diffs;
}
