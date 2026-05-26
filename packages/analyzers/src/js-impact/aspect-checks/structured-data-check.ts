import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

function getTypes(items: unknown[]): string[] {
  const types: string[] = [];
  for (const item of items) {
    if (item && typeof item === 'object') {
      const t = (item as any)['@type'];
      if (typeof t === 'string') types.push(t);
      else if (Array.isArray(t)) types.push(...t);
    }
  }
  return types.sort();
}

export function checkStructuredData(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawTypes = getTypes(raw.jsonLd);
  const renderedTypes = getTypes(rendered.jsonLd);

  const rawSet = new Set(rawTypes);
  const renderedSet = new Set(renderedTypes);

  const onlyInRendered = renderedTypes.filter(t => !rawSet.has(t));
  const onlyInRaw = rawTypes.filter(t => !renderedSet.has(t));

  if (onlyInRendered.length > 0 || onlyInRaw.length > 0 || raw.jsonLd.length !== rendered.jsonLd.length) {
    const severity = onlyInRendered.length > 0 ? 'high' : 'medium';
    diffs.push({
      id: createDiffId('structuredData.jsonLd', ctx.url, { rawTypes, renderedTypes }),
      aspect: 'structuredData.jsonLd',
      severity,
      confidence: 'certain',
      title: 'JSON-LD structured data differs between raw and rendered',
      description: onlyInRendered.length > 0
        ? 'JSON-LD blocks are only present in the rendered DOM. Rich results may work but are fragile.'
        : 'JSON-LD structured data changed after JavaScript execution.',
      raw: rawTypes,
      rendered: renderedTypes,
      evidence: [
        `Raw JSON-LD blocks: ${raw.jsonLd.length}`,
        `Rendered JSON-LD blocks: ${rendered.jsonLd.length}`,
        ...(onlyInRendered.length > 0 ? [`Types only in rendered: ${onlyInRendered.join(', ')}`] : []),
        ...(onlyInRaw.length > 0 ? [`Types only in raw: ${onlyInRaw.join(', ')}`] : []),
      ],
    });
  }

  return diffs;
}
