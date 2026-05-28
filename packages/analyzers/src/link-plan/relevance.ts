import { NormalizedPageFacts } from './types.js';

export interface RelevanceResult {
  score: number;
  signals: string[];
}

export function calculateRelevance(
  source: NormalizedPageFacts,
  target: NormalizedPageFacts
): RelevanceResult {
  const signals: string[] = [];
  let score = 0;

  const titleOverlap = wordOverlap(source.title || '', target.title || '');
  if (titleOverlap > 0) {
    score += titleOverlap * 3;
    signals.push('shared title term');
  }

  const h1Overlap = arrayWordOverlap(source.h1, target.h1);
  if (h1Overlap > 0) {
    score += h1Overlap * 4;
    signals.push('shared H1 term');
  }

  const h2Overlap = arrayWordOverlap(source.h2, target.h2);
  if (h2Overlap > 0) {
    score += h2Overlap * 2;
    signals.push('shared H2 term');
  }

  const urlOverlap = calculateUrlSegmentOverlap(source.url, target.url);
  if (urlOverlap > 0) {
    score += urlOverlap * 2.5;
    signals.push('shared path segment');
  }

  return { score, signals };
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection;
}

function arrayWordOverlap(a: string[], b: string[]): number {
  const flatA = a.join(' ');
  const flatB = b.join(' ');
  return wordOverlap(flatA, flatB);
}

function calculateUrlSegmentOverlap(url1: string, url2: string): number {
  const seg1 = url1.split('/').filter(Boolean);
  const seg2 = url2.split('/').filter(Boolean);

  if (seg1.length === 0 || seg2.length === 0) return 0;

  const set1 = new Set(seg1.map(s => s.toLowerCase()));
  const set2 = new Set(seg2.map(s => s.toLowerCase()));

  let intersection = 0;
  for (const seg of set1) {
    if (set2.has(seg) && seg.length > 2) {
      intersection++;
    }
  }

  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
}
