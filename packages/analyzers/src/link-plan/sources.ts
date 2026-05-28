import { NormalizedPageFacts, HubSummary } from './types.js';

export function findHubs(facts: Map<string, NormalizedPageFacts>): HubSummary[] {
  const hubs: HubSummary[] = [];

  for (const [url, page] of facts) {
    if (page.isUtility) continue;

    const outDegree = page.outDegree;
    const inDegree = page.inDegree;
    const authorityScore = page.authorityScore;

    if (outDegree > 5 || authorityScore > 50 || inDegree > 10) {
      hubs.push({ url, outDegree, inDegree, authorityScore });
    }
  }

  return hubs
    .sort((a, b) => b.authorityScore - a.authorityScore)
    .slice(0, 20);
}

export function calculateSourceScore(
  source: NormalizedPageFacts,
  target?: NormalizedPageFacts
): number {
  if (source.isUtility) return -50;

  let score = 0;

  score += Math.min(30, source.authorityScore / 3);
  score += Math.min(20, source.inDegree / 2);

  if (!source.isUtility) score += 10;

  if (target) {
    const topicScore = calculateTopicOverlapScore(source, target);
    score += topicScore * 15;
  }

  const saturationPenalty = Math.max(0, source.outDegree - 50) * 0.5;
  score -= saturationPenalty;

  return score;
}

function calculateTopicOverlapScore(a: NormalizedPageFacts, b: NormalizedPageFacts): number {
  const aTokens = extractTokens(a);
  const bTokens = extractTokens(b);

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  return intersection / Math.max(aTokens.size, bTokens.size);
}

function extractTokens(page: NormalizedPageFacts): Set<string> {
  const tokens = new Set<string>();
  const addTokens = (text: string) => {
    text.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3) tokens.add(w);
    });
  };

  if (page.title) addTokens(page.title);
  page.h1.forEach(addTokens);
  page.h2.forEach(addTokens);

  const pathTokens = page.url.split('/').filter(Boolean);
  const lastSegment = pathTokens[pathTokens.length - 1] || '';
  lastSegment.replace(/[-_]/g, ' ').split(/\s+/).forEach(w => {
    if (w.length > 2) tokens.add(w.toLowerCase());
  });

  return tokens;
}

export function rankSourcesForTarget(
  target: NormalizedPageFacts,
  facts: Map<string, NormalizedPageFacts>,
  excludeUrls: Set<string>
): { url: string; score: number }[] {
  const ranked: { url: string; score: number }[] = [];

  for (const [url, source] of facts) {
    if (url === target.url) continue;
    if (excludeUrls.has(url)) continue;
    if (source.isUtility) continue;

    const score = calculateSourceScore(source, target);
    if (score > 0) {
      ranked.push({ url, score });
    }
  }

  return ranked.sort((a, b) => b.score - a.score);
}
