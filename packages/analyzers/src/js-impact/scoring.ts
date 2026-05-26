import type { JsImpactDiff, JsImpactScore, JsImpactSummary } from './types.js';

/**
 * Scoring rubric (weights documented in JSDoc):
 * - indexability: 35%
 * - contentParity: 25%
 * - metadataParity: 15%
 * - structuredDataParity: 10%
 * - crawlability: 15%
 */

const WEIGHTS = {
  indexability: 0.35,
  contentParity: 0.25,
  metadataParity: 0.15,
  structuredDataParity: 0.10,
  crawlability: 0.15,
};

export function calculateScore(
  diffs: JsImpactDiff[],
  rawWordCount: number,
  renderedWordCount: number
): { score: JsImpactScore; summary: JsImpactSummary } {
  const reasoning: string[] = [];

  const indexabilityDiffs = diffs.filter(d =>
    d.aspect === 'indexability.canonical' ||
    d.aspect === 'indexability.metaRobots' ||
    d.aspect === 'indexability.xRobotsTag'
  );

  let indexabilityScore = 100;
  for (const d of indexabilityDiffs) {
    if (d.severity === 'critical') { indexabilityScore = 0; reasoning.push(`Critical indexability issue: ${d.title}`); }
    else if (d.severity === 'high') { indexabilityScore = Math.max(0, indexabilityScore - 40); reasoning.push(`High indexability issue: ${d.title}`); }
    else if (d.severity === 'medium') { indexabilityScore = Math.max(0, indexabilityScore - 15); reasoning.push(`Medium indexability issue: ${d.title}`); }
    else if (d.severity === 'low') { indexabilityScore = Math.max(0, indexabilityScore - 5); }
  }
  indexabilityScore = Math.max(0, Math.min(100, indexabilityScore));

  const maxWords = Math.max(rawWordCount, renderedWordCount);
  const minWords = Math.min(rawWordCount, renderedWordCount);
  const contentParityScore = maxWords > 0 ? Math.floor((minWords / maxWords) * 100) : 100;
  if (contentParityScore < 100) {
    reasoning.push(`Content parity ${contentParityScore}/100 (raw: ${rawWordCount} words, rendered: ${renderedWordCount} words)`);
  }

  const metadataAspects = ['metadata.title', 'metadata.metaDescription', 'metadata.openGraph', 'metadata.twitter'];
  const metadataDiffs = diffs.filter(d => metadataAspects.includes(d.aspect));
  const metadataParityScore = metadataAspects.length > 0
    ? Math.max(0, 100 - Math.floor((metadataDiffs.length / metadataAspects.length) * 100))
    : 100;
  if (metadataDiffs.length > 0) {
    reasoning.push(`Metadata parity ${metadataParityScore}/100 (${metadataDiffs.length} metadata aspect(s) differ)`);
  }

  const structuredDataDiffs = diffs.filter(d => d.aspect === 'structuredData.jsonLd');
  const structuredDataParityScore = structuredDataDiffs.length > 0 ? 50 : 100;
  if (structuredDataDiffs.length > 0) {
    reasoning.push(`Structured data parity ${structuredDataParityScore}/100 (JSON-LD differs)`);
  }

  const crawlabilityDiffs = diffs.filter(d =>
    d.aspect === 'resourceBlocked' || d.aspect === 'jsErrors'
  );
  let crawlabilityScore = 100;
  for (const d of crawlabilityDiffs) {
    if (d.severity === 'critical') { crawlabilityScore = Math.max(0, crawlabilityScore - 20); reasoning.push(`Critical crawlability issue: ${d.title}`); }
    else if (d.severity === 'high') { crawlabilityScore = Math.max(0, crawlabilityScore - 10); reasoning.push(`High crawlability issue: ${d.title}`); }
    else if (d.severity === 'medium') { crawlabilityScore = Math.max(0, crawlabilityScore - 5); }
  }
  crawlabilityScore = Math.max(0, Math.min(100, crawlabilityScore));

  const overall = Math.round(
    indexabilityScore * WEIGHTS.indexability +
    contentParityScore * WEIGHTS.contentParity +
    metadataParityScore * WEIGHTS.metadataParity +
    structuredDataParityScore * WEIGHTS.structuredDataParity +
    crawlabilityScore * WEIGHTS.crawlability
  );

  const summary: JsImpactSummary = {
    critical: diffs.filter(d => d.severity === 'critical').length,
    high: diffs.filter(d => d.severity === 'high').length,
    medium: diffs.filter(d => d.severity === 'medium').length,
    low: diffs.filter(d => d.severity === 'low').length,
  };

  const score: JsImpactScore = {
    overall: Math.max(0, Math.min(100, overall)),
    indexability: indexabilityScore,
    contentParity: contentParityScore,
    metadataParity: metadataParityScore,
    structuredDataParity: structuredDataParityScore,
    crawlability: crawlabilityScore,
    reasoning,
  };

  return { score, summary };
}
