import { classifyIntent } from './intent-classifier.js';
import type { KeywordProviderMetrics } from './providers/types.js';
import type { KeywordNoiseAssessment, KeywordSourceType, ScoredKeyword } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tokenize(keyword: string): string[] {
  return keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function sourceWeight(sourceType: KeywordSourceType): number {
  switch (sourceType) {
    case 'direct':
      return 2;
    case 'semantic':
      return 1;
    case 'question':
      return 1;
    case 'alphabetical':
      return 0;
  }
}

function normalizeVolume(searchVolume?: number): number {
  if (!searchVolume || searchVolume <= 0) return 0;
  return clamp((Math.log10(searchVolume + 1) / 5) * 100, 0, 100);
}

function providerAdjustment(metrics?: KeywordProviderMetrics): number {
  if (!metrics) return 0;

  const volumeBoost = normalizeVolume(metrics.searchVolume) * 0.18;
  const difficultyPenalty = (metrics.keywordDifficulty ?? 0) * 0.08;
  const cpcBoost = clamp((metrics.cpc ?? 0) * 1.2, 0, 10);
  const competitionPenalty = clamp((metrics.competition ?? 0) * 8, 0, 8);

  return Math.round(volumeBoost + cpcBoost - difficultyPenalty - competitionPenalty);
}

function noisePenalty(noise: KeywordNoiseAssessment, intent: ReturnType<typeof classifyIntent>): number {
  if (noise.allowlisted) return 0;

  const multiplier = intent === 'commercial' ? 0.18 : 0.3;
  return Math.round(noise.score * multiplier);
}

export function scoreKeyword(input: {
  keyword: string;
  seedKeyword: string;
  sourceType: KeywordSourceType;
  index: number;
  noiseAssessment: KeywordNoiseAssessment;
  providerMetrics?: KeywordProviderMetrics;
}): ScoredKeyword {
  const intent = classifyIntent(input.keyword);
  const kw = input.keyword.toLowerCase().trim();
  const seed = input.seedKeyword.toLowerCase().trim();

  let businessIntentScore = 4;
  if (intent === 'transactional') businessIntentScore = 10;
  else if (intent === 'commercial') businessIntentScore = 8;
  else if (intent === 'local') businessIntentScore = 7;
  else if (intent === 'informational') businessIntentScore = 5;
  else if (intent === 'jobs-career') businessIntentScore = 1;

  const topicalImportanceBase = (() => {
    if (kw === seed) return 10;
    if (kw.startsWith(seed)) return 9;
    if (kw.includes(seed)) return 8;

    const seedTokens = tokenize(seed);
    const kwTokens = new Set(tokenize(kw));
    const matches = seedTokens.filter(token => kwTokens.has(token)).length;
    const matchRatio = matches / Math.max(seedTokens.length, 1);
    return Math.max(1, Math.round(matchRatio * 7));
  })();

  const indexFactor = Math.max(0, 10 - input.index) / 10;
  const topicalImportance = clamp(
    topicalImportanceBase + Math.round(indexFactor * 2) + sourceWeight(input.sourceType),
    0,
    10,
  );

  const heuristicScore = clamp(
    Math.round((topicalImportance * 0.6 + businessIntentScore * 0.4) * 10),
    0,
    100,
  );

  const score = clamp(
    heuristicScore - noisePenalty(input.noiseAssessment, intent) + providerAdjustment(input.providerMetrics),
    0,
    100,
  );

  return {
    keyword: input.keyword,
    normalizedKeyword: kw,
    intent,
    score,
    heuristicScore,
    businessIntentScore,
    topicalImportance,
    sourceType: input.sourceType,
    noiseScore: input.noiseAssessment.score,
    noiseAssessment: input.noiseAssessment,
    providerMetrics: input.providerMetrics,
  };
}
