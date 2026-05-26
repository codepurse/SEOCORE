import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

function setDiffUrls(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyInA: [...setA].filter(x => !setB.has(x)),
    onlyInB: [...setB].filter(x => !setA.has(x)),
  };
}

export function checkLinks(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawInternal = raw.links.internal.map(l => l.url);
  const renderedInternal = rendered.links.internal.map(l => l.url);
  const rawExternal = raw.links.external.map(l => l.url);
  const renderedExternal = rendered.links.external.map(l => l.url);

  const internalDiff = setDiffUrls(rawInternal, renderedInternal);
  const externalDiff = setDiffUrls(rawExternal, renderedExternal);

  const totalRaw = rawInternal.length + rawExternal.length;
  const totalRendered = renderedInternal.length + renderedExternal.length;

  if (totalRaw !== totalRendered) {
    diffs.push({
      id: createDiffId('links.internal', ctx.url, { raw: totalRaw, rendered: totalRendered }),
      aspect: 'links.internal',
      severity: 'medium',
      confidence: 'certain',
      title: 'Link count changed between raw and rendered',
      description: `Raw HTML has ${totalRaw} links; rendered DOM has ${totalRendered} links.`,
      raw: totalRaw,
      rendered: totalRendered,
      delta: totalRendered - totalRaw,
      evidence: [`Raw total links: ${totalRaw}`, `Rendered total links: ${totalRendered}`],
    });
  }

  if (internalDiff.onlyInB.length > 0) {
    diffs.push({
      id: createDiffId('links.onlyInRendered', ctx.url, { onlyInRendered: internalDiff.onlyInB }),
      aspect: 'links.onlyInRendered',
      severity: 'medium',
      confidence: 'likely',
      title: 'Internal links only present in rendered DOM',
      description: `${internalDiff.onlyInB.length} internal link(s) appear only after JavaScript execution. Google may not discover them during crawl.`,
      raw: totalRaw,
      rendered: totalRendered,
      evidence: internalDiff.onlyInB.slice(0, 5).map(url => `Only in rendered: ${url}`),
    });
  }

  if (internalDiff.onlyInA.length > 0) {
    diffs.push({
      id: createDiffId('links.internal', ctx.url, { onlyInRaw: internalDiff.onlyInA }),
      aspect: 'links.internal',
      severity: 'low',
      confidence: 'cosmetic',
      title: 'Internal links removed in rendered DOM',
      description: `${internalDiff.onlyInA.length} internal link(s) present in raw HTML but missing after hydration.`,
      raw: totalRaw,
      rendered: totalRendered,
      evidence: internalDiff.onlyInA.slice(0, 5).map(url => `Only in raw: ${url}`),
    });
  }

  if (externalDiff.onlyInB.length > 0 || externalDiff.onlyInA.length > 0) {
    diffs.push({
      id: createDiffId('links.external', ctx.url, { raw: rawExternal.length, rendered: renderedExternal.length }),
      aspect: 'links.external',
      severity: 'low',
      confidence: 'cosmetic',
      title: 'External links differ between raw and rendered',
      description: 'External link set changed after JavaScript execution.',
      raw: rawExternal.length,
      rendered: renderedExternal.length,
      evidence: [
        ...(externalDiff.onlyInB.slice(0, 3).map(url => `Only in rendered: ${url}`)),
        ...(externalDiff.onlyInA.slice(0, 3).map(url => `Only in raw: ${url}`)),
      ],
    });
  }

  return diffs;
}
