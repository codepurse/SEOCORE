import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkMetaRobots(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawVal = (raw.metaRobots || '').toLowerCase();
  const renderedVal = (rendered.metaRobots || '').toLowerCase();

  if (rawVal === renderedVal) return diffs;

  const rawNoindex = rawVal.includes('noindex');
  const renderedNoindex = renderedVal.includes('noindex');

  if (!rawNoindex && renderedNoindex) {
    diffs.push({
      id: createDiffId('indexability.metaRobots', ctx.url, { raw: raw.metaRobots, rendered: rendered.metaRobots }),
      aspect: 'indexability.metaRobots',
      severity: 'critical',
      confidence: 'certain',
      title: 'noindex injected by JavaScript',
      description: 'The rendered page contains a noindex directive not present in raw HTML. If Google renders the page, it may drop it from the index.',
      raw: raw.metaRobots ?? '(missing)',
      rendered: rendered.metaRobots ?? '(missing)',
      evidence: [`Raw meta robots: ${raw.metaRobots ?? 'none'}`, `Rendered meta robots: ${rendered.metaRobots}`],
    });
  } else if (rawNoindex && !renderedNoindex) {
    diffs.push({
      id: createDiffId('indexability.metaRobots', ctx.url, { raw: raw.metaRobots, rendered: rendered.metaRobots }),
      aspect: 'indexability.metaRobots',
      severity: 'high',
      confidence: 'certain',
      title: 'noindex removed by JavaScript',
      description: 'Raw HTML has noindex, but rendered DOM removes it. Google may still see the raw noindex during initial crawl.',
      raw: raw.metaRobots ?? '(missing)',
      rendered: rendered.metaRobots ?? '(missing)',
      evidence: [`Raw meta robots: ${raw.metaRobots}`, 'Rendered meta robots: none'],
    });
  } else if (raw.metaRobots !== rendered.metaRobots) {
    diffs.push({
      id: createDiffId('indexability.metaRobots', ctx.url, { raw: raw.metaRobots, rendered: rendered.metaRobots }),
      aspect: 'indexability.metaRobots',
      severity: 'medium',
      confidence: 'likely',
      title: 'Meta robots changed by JavaScript',
      description: 'The meta robots directive differs between raw and rendered.',
      raw: raw.metaRobots ?? '(missing)',
      rendered: rendered.metaRobots ?? '(missing)',
      evidence: [`Raw: ${raw.metaRobots ?? 'none'}`, `Rendered: ${rendered.metaRobots ?? 'none'}`],
    });
  }

  return diffs;
}
