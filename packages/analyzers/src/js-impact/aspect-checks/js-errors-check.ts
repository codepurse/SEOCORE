import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export interface JsErrorContext {
  consoleMessages: { level: string; text: string; url?: string; line?: number }[];
  failedRequests: { url: string; method: string; status?: number; failure?: string; resourceType: string }[];
}

export function checkJsErrors(_raw: ParsedSurface, _rendered: ParsedSurface, ctx: DiffContext, errors: JsErrorContext): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const errorsOnly = errors.consoleMessages.filter(m => m.level === 'error' || m.level === 'severe');

  if (errorsOnly.length > 0) {
    diffs.push({
      id: createDiffId('jsErrors', ctx.url, { errorCount: errorsOnly.length }),
      aspect: 'jsErrors',
      severity: 'high',
      confidence: 'certain',
      title: 'JavaScript errors during rendering',
      description: `${errorsOnly.length} console error(s) occurred while rendering the page. Errors may prevent hydration and hide content from crawlers.`,
      raw: 0,
      rendered: errorsOnly.length,
      evidence: errorsOnly.slice(0, 5).map(e => `[${e.level}] ${e.text}${e.url ? ` (${e.url})` : ''}`),
    });
  }

  const failedCritical = errors.failedRequests.filter(r =>
    r.resourceType === 'script' || r.resourceType === 'xhr' || r.resourceType === 'fetch'
  );

  if (failedCritical.length > 0) {
    diffs.push({
      id: createDiffId('jsErrors', ctx.url, { failedCount: failedCritical.length }),
      aspect: 'jsErrors',
      severity: 'medium',
      confidence: 'likely',
      title: 'Critical resources failed to load',
      description: `${failedCritical.length} script or XHR request(s) failed. Missing resources may break hydration.`,
      raw: 0,
      rendered: failedCritical.length,
      evidence: failedCritical.slice(0, 5).map(r => `${r.method} ${r.url} — ${r.failure || `HTTP ${r.status}`}`),
    });
  }

  return diffs;
}
