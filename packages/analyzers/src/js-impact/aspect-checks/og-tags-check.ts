import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

const OG_KEYS = ['title', 'description', 'image', 'type', 'url'];

export function checkOgTags(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawOnly: string[] = [];
  const renderedOnly: string[] = [];
  const changed: string[] = [];

  for (const key of OG_KEYS) {
    const rawVal = raw.openGraph[key];
    const renderedVal = rendered.openGraph[key];
    if (rawVal && !renderedVal) rawOnly.push(key);
    else if (!rawVal && renderedVal) renderedOnly.push(key);
    else if (rawVal && renderedVal && rawVal !== renderedVal) changed.push(key);
  }

  if (rawOnly.length === 0 && renderedOnly.length === 0 && changed.length === 0) return diffs;

  const evidence: string[] = [];
  for (const key of rawOnly) evidence.push(`Raw og:${key} present, missing in rendered`);
  for (const key of renderedOnly) evidence.push(`Rendered og:${key} present, missing in raw`);
  for (const key of changed) evidence.push(`og:${key} changed: "${raw.openGraph[key]}" → "${rendered.openGraph[key]}"`);

  const hasMissingInRaw = renderedOnly.length > 0;

  diffs.push({
    id: createDiffId('metadata.openGraph', ctx.url, { rawOnly, renderedOnly, changed }),
    aspect: 'metadata.openGraph',
    severity: hasMissingInRaw ? 'medium' : 'low',
    confidence: 'certain',
    title: 'Open Graph tags differ between raw and rendered',
    description: 'Social scrapers (Facebook, LinkedIn) do not execute JavaScript. Missing OG tags in raw HTML means shared links may lack previews.',
    raw: OG_KEYS.filter(k => !!raw.openGraph[k]),
    rendered: OG_KEYS.filter(k => !!rendered.openGraph[k]),
    evidence: evidence.slice(0, 5),
  });

  return diffs;
}
