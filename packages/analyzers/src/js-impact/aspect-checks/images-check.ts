import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkImages(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawSrcs = new Set(raw.images.map(i => i.src));
  const renderedSrcs = new Set(rendered.images.map(i => i.src));

  const onlyInRendered = rendered.images.filter(i => !rawSrcs.has(i.src));
  const onlyInRaw = raw.images.filter(i => !renderedSrcs.has(i.src));
  const lazyInRendered = rendered.images.filter(i => i.isLazy);

  if (onlyInRendered.length > 0) {
    diffs.push({
      id: createDiffId('images.src', ctx.url, { onlyInRendered: onlyInRendered.map(i => i.src) }),
      aspect: 'images.src',
      severity: 'medium',
      confidence: 'likely',
      title: 'Images only present in rendered DOM',
      description: `${onlyInRendered.length} image(s) are injected by JavaScript. Image search may not discover them.`,
      raw: raw.images.length,
      rendered: rendered.images.length,
      delta: rendered.images.length - raw.images.length,
      evidence: onlyInRendered.slice(0, 5).map(i => `Only in rendered: ${i.src}`),
    });
  }

  if (lazyInRendered.length > 0) {
    diffs.push({
      id: createDiffId('images.src', ctx.url, { lazyCount: lazyInRendered.length }),
      aspect: 'images.src',
      severity: 'low',
      confidence: 'likely',
      title: 'Lazy-loaded images detected',
      description: `${lazyInRendered.length} image(s) use data-src without src. Ensure they are discoverable by search engines.`,
      raw: raw.images.filter(i => i.isLazy).length,
      rendered: lazyInRendered.length,
      evidence: lazyInRendered.slice(0, 5).map(i => `Lazy: ${i.src}`),
    });
  }

  const renderedMissingAlts = rendered.images.filter(i => !i.alt || i.alt.trim() === '');
  const rawMissingAlts = raw.images.filter(i => !i.alt || i.alt.trim() === '');

  if (renderedMissingAlts.length > rawMissingAlts.length) {
    diffs.push({
      id: createDiffId('images.alt', ctx.url, { rawMissing: rawMissingAlts.length, renderedMissing: renderedMissingAlts.length }),
      aspect: 'images.alt',
      severity: 'medium',
      confidence: 'certain',
      title: 'Missing alt text increased in rendered DOM',
      description: `${renderedMissingAlts.length} image(s) lack alt text in rendered DOM (vs ${rawMissingAlts.length} in raw).`,
      raw: rawMissingAlts.length,
      rendered: renderedMissingAlts.length,
      delta: renderedMissingAlts.length - rawMissingAlts.length,
      evidence: renderedMissingAlts.slice(0, 5).map(i => `Missing alt: ${i.src}`),
    });
  }

  if (onlyInRaw.length > 0) {
    diffs.push({
      id: createDiffId('images.src', ctx.url, { onlyInRaw: onlyInRaw.map(i => i.src) }),
      aspect: 'images.src',
      severity: 'low',
      confidence: 'cosmetic',
      title: 'Images removed in rendered DOM',
      description: `${onlyInRaw.length} image(s) present in raw HTML but missing after hydration.`,
      raw: raw.images.length,
      rendered: rendered.images.length,
      evidence: onlyInRaw.slice(0, 5).map(i => `Only in raw: ${i.src}`),
    });
  }

  return diffs;
}
