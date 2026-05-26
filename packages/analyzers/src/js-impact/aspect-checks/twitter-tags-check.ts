import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

const TWITTER_KEYS = ['card', 'title', 'description', 'image', 'site', 'creator'];

export function checkTwitterTags(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawOnly: string[] = [];
  const renderedOnly: string[] = [];
  const changed: string[] = [];

  for (const key of TWITTER_KEYS) {
    const rawVal = raw.twitter[key];
    const renderedVal = rendered.twitter[key];
    if (rawVal && !renderedVal) rawOnly.push(key);
    else if (!rawVal && renderedVal) renderedOnly.push(key);
    else if (rawVal && renderedVal && rawVal !== renderedVal) changed.push(key);
  }

  if (rawOnly.length === 0 && renderedOnly.length === 0 && changed.length === 0) return diffs;

  const evidence: string[] = [];
  for (const key of rawOnly) evidence.push(`Raw twitter:${key} present, missing in rendered`);
  for (const key of renderedOnly) evidence.push(`Rendered twitter:${key} present, missing in raw`);
  for (const key of changed) evidence.push(`twitter:${key} changed: "${raw.twitter[key]}" → "${rendered.twitter[key]}"`);

  const hasMissingInRaw = renderedOnly.length > 0;

  diffs.push({
    id: createDiffId('metadata.twitter', ctx.url, { rawOnly, renderedOnly, changed }),
    aspect: 'metadata.twitter',
    severity: hasMissingInRaw ? 'medium' : 'low',
    confidence: 'certain',
    title: 'Twitter Card tags differ between raw and rendered',
    description: 'Twitter and other social scrapers do not execute JavaScript. Missing Twitter Card tags in raw HTML means shared links may lack rich previews.',
    raw: TWITTER_KEYS.filter(k => !!raw.twitter[k]),
    rendered: TWITTER_KEYS.filter(k => !!rendered.twitter[k]),
    evidence: evidence.slice(0, 5),
  });

  return diffs;
}
