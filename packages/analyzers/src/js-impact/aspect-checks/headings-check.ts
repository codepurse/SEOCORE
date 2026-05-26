import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

function setDiff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[]; common: string[] } {
  const setA = new Set(a.map(s => s.replace(/\s+/g, ' ').trim()));
  const setB = new Set(b.map(s => s.replace(/\s+/g, ' ').trim()));
  const onlyInA = [...setA].filter(x => !setB.has(x));
  const onlyInB = [...setB].filter(x => !setA.has(x));
  const common = [...setA].filter(x => setB.has(x));
  return { onlyInA, onlyInB, common };
}

export function checkHeadings(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const h1Diff = setDiff(raw.headings.h1, rendered.headings.h1);
  if (h1Diff.onlyInA.length > 0 || h1Diff.onlyInB.length > 0) {
    const missingInRaw = h1Diff.onlyInB.length > 0;
    diffs.push({
      id: createDiffId('headings.h1', ctx.url, { raw: raw.headings.h1, rendered: rendered.headings.h1 }),
      aspect: 'headings.h1',
      severity: missingInRaw ? 'high' : 'medium',
      confidence: 'certain',
      title: 'H1 heading differs between raw and rendered',
      description: missingInRaw
        ? 'H1 is only present in the rendered DOM. Google may not see it during initial crawl.'
        : 'H1 changed between raw HTML and rendered DOM.',
      raw: raw.headings.h1,
      rendered: rendered.headings.h1,
      evidence: [
        ...(h1Diff.onlyInA.length > 0 ? [`Only in raw: ${h1Diff.onlyInA.join(', ')}`] : []),
        ...(h1Diff.onlyInB.length > 0 ? [`Only in rendered: ${h1Diff.onlyInB.join(', ')}`] : []),
      ],
    });
  }

  const allLevels = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;
  const rawAll = allLevels.flatMap(l => (raw.headings as any)[l] as string[]);
  const renderedAll = allLevels.flatMap(l => (rendered.headings as any)[l] as string[]);
  const setDiffResult = setDiff(rawAll, renderedAll);

  if (setDiffResult.onlyInA.length > 0 || setDiffResult.onlyInB.length > 0) {
    diffs.push({
      id: createDiffId('headings.set', ctx.url, { raw: rawAll, rendered: renderedAll }),
      aspect: 'headings.set',
      severity: setDiffResult.onlyInB.length > 0 ? 'medium' : 'low',
      confidence: 'certain',
      title: 'Heading structure differs between raw and rendered',
      description: 'H2-H6 headings are not identical between raw HTML and rendered DOM.',
      raw: rawAll,
      rendered: renderedAll,
      evidence: [
        ...(setDiffResult.onlyInA.length > 0 ? [`Only in raw: ${setDiffResult.onlyInA.slice(0, 3).join(', ')}${setDiffResult.onlyInA.length > 3 ? ` (+${setDiffResult.onlyInA.length - 3} more)` : ''}`] : []),
        ...(setDiffResult.onlyInB.length > 0 ? [`Only in rendered: ${setDiffResult.onlyInB.slice(0, 3).join(', ')}${setDiffResult.onlyInB.length > 3 ? ` (+${setDiffResult.onlyInB.length - 3} more)` : ''}`] : []),
      ],
    });
  }

  return diffs;
}
