import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export function checkCanonical(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  if (raw.canonical === rendered.canonical) return diffs;

  const hasRaw = !!raw.canonical;
  const hasRendered = !!rendered.canonical;

  if (!hasRaw && hasRendered) {
    diffs.push({
      id: createDiffId('indexability.canonical', ctx.url, { raw: raw.canonical, rendered: rendered.canonical }),
      aspect: 'indexability.canonical',
      severity: 'critical',
      confidence: 'certain',
      title: 'Canonical injected by JavaScript',
      description: 'The canonical link is only present in the rendered DOM. Google may not see it during initial crawl.',
      raw: undefined,
      rendered: rendered.canonical as string,
      evidence: [`Raw canonical: none`, `Rendered canonical: ${rendered.canonical}`],
    });
  } else if (hasRaw && hasRendered && raw.canonical !== rendered.canonical) {
    diffs.push({
      id: createDiffId('indexability.canonical', ctx.url, { raw: raw.canonical, rendered: rendered.canonical }),
      aspect: 'indexability.canonical',
      severity: 'high',
      confidence: 'certain',
      title: 'Canonical changed by JavaScript',
      description: 'The canonical URL differs between raw HTML and rendered DOM.',
      raw: raw.canonical as string,
      rendered: rendered.canonical as string,
      evidence: [`Raw: ${raw.canonical}`, `Rendered: ${rendered.canonical}`],
    });
  } else if (hasRaw && !hasRendered) {
    diffs.push({
      id: createDiffId('indexability.canonical', ctx.url, { raw: raw.canonical, rendered: rendered.canonical }),
      aspect: 'indexability.canonical',
      severity: 'high',
      confidence: 'certain',
      title: 'Canonical removed by JavaScript',
      description: 'The canonical link present in raw HTML was removed during hydration.',
      raw: raw.canonical as string,
      rendered: undefined,
      evidence: [`Raw canonical: ${raw.canonical}`, 'Rendered canonical: none'],
    });
  }

  return diffs;
}
