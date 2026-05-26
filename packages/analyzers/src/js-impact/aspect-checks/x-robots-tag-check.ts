import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkXRobotsTag(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const headerVal = (ctx.xRobotsTag || '').toLowerCase();
  const renderedVal = (rendered.metaRobots || '').toLowerCase();

  if (!headerVal) return diffs;

  const headerNoindex = headerVal.includes('noindex');
  const renderedNoindex = renderedVal.includes('noindex');

  if (headerNoindex && !renderedNoindex) {
    diffs.push({
      id: createDiffId('indexability.xRobotsTag', ctx.url, { header: ctx.xRobotsTag, rendered: rendered.metaRobots }),
      aspect: 'indexability.xRobotsTag',
      severity: 'high',
      confidence: 'certain',
      title: 'X-Robots-Tag noindex conflicts with rendered meta robots',
      description: 'The HTTP X-Robots-Tag header says noindex, but the rendered DOM does not. Google respects the header.',
      raw: ctx.xRobotsTag,
      rendered: rendered.metaRobots ?? '(missing)',
      evidence: [`X-Robots-Tag: ${ctx.xRobotsTag}`, `Rendered meta robots: ${rendered.metaRobots ?? 'none'}`],
    });
  } else if (!headerNoindex && renderedNoindex) {
    diffs.push({
      id: createDiffId('indexability.xRobotsTag', ctx.url, { header: ctx.xRobotsTag, rendered: rendered.metaRobots }),
      aspect: 'indexability.xRobotsTag',
      severity: 'critical',
      confidence: 'certain',
      title: 'Rendered noindex not backed by X-Robots-Tag',
      description: 'Rendered DOM injects noindex, but the HTTP header does not. Google may still index based on header.',
      raw: ctx.xRobotsTag ?? '(missing)',
      rendered: rendered.metaRobots ?? '(missing)',
      evidence: [`X-Robots-Tag: ${ctx.xRobotsTag ?? 'none'}`, `Rendered meta robots: ${rendered.metaRobots}`],
    });
  }

  return diffs;
}
