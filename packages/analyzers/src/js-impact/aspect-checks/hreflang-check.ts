import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkHreflang(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawSet = new Set(raw.hreflang.map(h => `${h.hreflang}:${h.href}`));
  const renderedSet = new Set(rendered.hreflang.map(h => `${h.hreflang}:${h.href}`));

  const onlyInRaw = raw.hreflang.filter(h => !renderedSet.has(`${h.hreflang}:${h.href}`));
  const onlyInRendered = rendered.hreflang.filter(h => !rawSet.has(`${h.hreflang}:${h.href}`));

  if (onlyInRaw.length > 0 || onlyInRendered.length > 0) {
    diffs.push({
      id: createDiffId('hreflang', ctx.url, { raw: raw.hreflang, rendered: rendered.hreflang }),
      aspect: 'hreflang',
      severity: onlyInRendered.length > 0 ? 'high' : 'medium',
      confidence: 'certain',
      title: 'Hreflang annotations differ between raw and rendered',
      description: onlyInRendered.length > 0
        ? 'Hreflang links are injected by JavaScript. Google may not discover them during crawl.'
        : 'Hreflang links changed after JavaScript execution.',
      raw: raw.hreflang.map(h => `${h.hreflang} → ${h.href}`),
      rendered: rendered.hreflang.map(h => `${h.hreflang} → ${h.href}`),
      evidence: [
        `Raw hreflang count: ${raw.hreflang.length}`,
        `Rendered hreflang count: ${rendered.hreflang.length}`,
        ...(onlyInRendered.slice(0, 3).map(h => `Only in rendered: ${h.hreflang} → ${h.href}`)),
        ...(onlyInRaw.slice(0, 3).map(h => `Only in raw: ${h.hreflang} → ${h.href}`)),
      ],
    });
  }

  return diffs;
}
