import type { NormalizedGscPageMetrics, NormalizedCruxPageMetrics } from './types.js';

export interface NormalizerResult<T> {
  data: T[];
  warningCount: number;
}

export function normalizeGscData(raw: any): NormalizerResult<NormalizedGscPageMetrics> {
  const result: NormalizedGscPageMetrics[] = [];
  let warningCount = 0;

  if (!Array.isArray(raw)) {
    return { data: [], warningCount: 1 };
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      warningCount++;
      continue;
    }

    const url = item.url || item.page || item.pageUrl;
    if (typeof url !== 'string' || !url.trim()) {
      warningCount++;
      continue;
    }

    const impressions = Number(item.impressions);
    const clicks = Number(item.clicks);
    const ctr = Number(item.ctr);
    const position = Number(item.position);

    if (
      isNaN(impressions) ||
      isNaN(clicks) ||
      isNaN(ctr) ||
      isNaN(position)
    ) {
      warningCount++;
      continue;
    }

    result.push({
      url: url.trim(),
      impressions,
      clicks,
      ctr,
      position,
    });
  }

  return { data: result, warningCount };
}

export function normalizeCruxData(raw: any): NormalizerResult<NormalizedCruxPageMetrics> {
  const result: NormalizedCruxPageMetrics[] = [];
  let warningCount = 0;

  if (!Array.isArray(raw)) {
    return { data: [], warningCount: 1 };
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      warningCount++;
      continue;
    }

    const url = item.url || item.page || item.pageUrl;
    if (typeof url !== 'string' || !url.trim()) {
      warningCount++;
      continue;
    }

    // CrUX metrics are optional, but if present they must be valid numbers if defined
    const lcp = item.lcp !== undefined && item.lcp !== null ? Number(item.lcp) : undefined;
    const cls = item.cls !== undefined && item.cls !== null ? Number(item.cls) : undefined;
    const inp = item.inp !== undefined && item.inp !== null ? Number(item.inp) : undefined;

    if (
      (lcp !== undefined && isNaN(lcp)) ||
      (cls !== undefined && isNaN(cls)) ||
      (inp !== undefined && isNaN(inp))
    ) {
      warningCount++;
      continue;
    }

    result.push({
      url: url.trim(),
      ...(lcp !== undefined ? { lcp } : {}),
      ...(cls !== undefined ? { cls } : {}),
      ...(inp !== undefined ? { inp } : {}),
    });
  }

  return { data: result, warningCount };
}
