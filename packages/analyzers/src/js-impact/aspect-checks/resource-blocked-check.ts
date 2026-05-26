import type { JsImpactDiff, ParsedSurface, DiffContext } from '../types.js';
import { createDiffId } from '../diff-id.js';

export interface BlockedResourceInfo {
  url: string;
  reason: 'robots.txt' | 'csp' | 'mixed-content' | 'cors' | 'other';
  impact: 'critical' | 'high' | 'medium' | 'low';
}

export function checkBlockedResources(_raw: ParsedSurface, _rendered: ParsedSurface, ctx: DiffContext, blocked: BlockedResourceInfo[]): JsImpactDiff[] {
  const diffs: JsImpactDiff[] = [];

  const critical = blocked.filter(b => b.impact === 'critical');
  const high = blocked.filter(b => b.impact === 'high');

  if (blocked.length > 0) {
    diffs.push({
      id: createDiffId('resourceBlocked', ctx.url, { blocked: blocked.map(b => b.url) }),
      aspect: 'resourceBlocked',
      severity: critical.length > 0 ? 'critical' : (high.length > 0 ? 'high' : 'medium'),
      confidence: 'certain',
      title: 'Resources blocked during rendering',
      description: `${blocked.length} resource(s) were blocked. If critical JS is blocked by robots.txt, Google cannot render the page fully.`,
      raw: 0,
      rendered: blocked.length,
      evidence: blocked.slice(0, 5).map(b => `${b.url} (${b.reason}) — impact: ${b.impact}`),
    });
  }

  return diffs;
}
