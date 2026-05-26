import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

function normalizeWhitespace(value: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function checkMetaDescription(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawDesc = normalizeWhitespace(raw.metaDescription);
  const renderedDesc = normalizeWhitespace(rendered.metaDescription);

  if (rawDesc === renderedDesc) return diffs;

  diffs.push({
    id: createDiffId('metadata.metaDescription', ctx.url, { raw: rawDesc, rendered: renderedDesc }),
    aspect: 'metadata.metaDescription',
    severity: 'high',
    confidence: 'certain',
    title: 'Meta description changed by JavaScript',
    description: 'The meta description differs between raw HTML and rendered DOM. Google typically uses the raw version for snippets.',
    raw: rawDesc || '(missing)',
    rendered: renderedDesc || '(missing)',
    evidence: [`Raw meta description: "${rawDesc || 'none'}"`, `Rendered meta description: "${renderedDesc || 'none'}"`],
  });

  return diffs;
}
