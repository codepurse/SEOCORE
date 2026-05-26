import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

function normalizeWhitespace(value: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function checkTitle(raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const rawTitle = normalizeWhitespace(raw.title);
  const renderedTitle = normalizeWhitespace(rendered.title);

  if (rawTitle === renderedTitle) return diffs;

  diffs.push({
    id: createDiffId('metadata.title', ctx.url, { raw: rawTitle, rendered: renderedTitle }),
    aspect: 'metadata.title',
    severity: 'high',
    confidence: 'certain',
    title: 'Title changed by JavaScript',
    description: 'The page title differs between raw HTML and rendered DOM. Google uses the raw title for indexing.',
    raw: rawTitle || '(missing)',
    rendered: renderedTitle || '(missing)',
    evidence: [`Raw title: "${rawTitle || 'none'}"`, `Rendered title: "${renderedTitle || 'none'}"`],
  });

  return diffs;
}
