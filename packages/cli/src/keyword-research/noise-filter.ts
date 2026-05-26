import type { FilteredKeyword, KeywordNoiseAssessment, KeywordSuggestion } from './types.js';

const BUSINESS_SUFFIXES = ['inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'hospital', 'foundation'] as const;
const ORGANIZATION_TERMS = [
  'department',
  'agency',
  'association',
  'foundation',
  'university',
  'county',
  'state',
  'city',
  'office',
  'bureau',
  'commission',
  'administration',
  'authority',
  'district',
] as const;
const DIRECTORY_ENTITIES = [
  'healthgrades',
  'zocdoc',
  'psychology today',
  'webmd',
  'yelp',
  'glassdoor',
  'indeed',
  'linkedin',
  'yellow pages',
  'superpages',
  'bbb',
] as const;
const NAVIGATIONAL_TERMS = ['reviews', 'review', 'address', 'phone', 'login', 'portal', 'hours', 'directions', 'map'] as const;
const BRANDABLE_HEAD_TERMS = [
  'crm',
  'software',
  'platform',
  'app',
  'apps',
  'shoes',
  'sneakers',
  'hosting',
  'analytics',
  'erp',
  'cms',
  'pricing',
  'login',
  'reviews',
  'alternatives',
] as const;
const GENERIC_BRANDABLE_MODIFIERS = [
  'best',
  'top',
  'guide',
  'how',
  'free',
  'cheap',
  'enterprise',
  'small',
  'business',
  'online',
  'for',
  'with',
] as const;

export function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s&/+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(keyword: string): string[] {
  return normalizeKeyword(keyword).split(/\s+/).filter(Boolean);
}

function matchesPhrase(keyword: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => keyword.includes(pattern));
}

function overlapRatio(keywordTokens: string[], seedTokens: Set<string>): number {
  if (seedTokens.size === 0) return 0;
  const overlap = keywordTokens.filter(token => seedTokens.has(token)).length;
  return overlap / seedTokens.size;
}

function seedLooksBranded(seedKeyword: string): boolean {
  const tokens = tokenize(seedKeyword);
  if (tokens.length < 2) return false;

  const headMatch = tokens.some(token => BRANDABLE_HEAD_TERMS.includes(token as (typeof BRANDABLE_HEAD_TERMS)[number]));
  if (!headMatch) return false;

  return tokens.some(
    token =>
      !BRANDABLE_HEAD_TERMS.includes(token as (typeof BRANDABLE_HEAD_TERMS)[number]) &&
      !GENERIC_BRANDABLE_MODIFIERS.includes(token as (typeof GENERIC_BRANDABLE_MODIFIERS)[number]),
  );
}

function isAllowlisted(seedKeyword: string, normalizedKeyword: string): boolean {
  if (!seedLooksBranded(seedKeyword)) return false;

  const seedTokens = tokenize(seedKeyword);
  const keywordTokens = new Set(tokenize(normalizedKeyword));
  return seedTokens.every(token => keywordTokens.has(token));
}

function splitAroundSeed(normalizedKeyword: string, seedKeyword: string): { prefix: string; suffix: string } {
  const normalizedSeed = normalizeKeyword(seedKeyword);
  const index = normalizedKeyword.indexOf(normalizedSeed);
  if (index === -1) {
    return { prefix: '', suffix: '' };
  }

  return {
    prefix: normalizedKeyword.slice(0, index).trim(),
    suffix: normalizedKeyword.slice(index + normalizedSeed.length).trim(),
  };
}

export function keywordNoiseScore(
  keyword: string,
  seedKeyword: string,
  options: { includeBrands?: boolean; strictNoiseFilter?: boolean } = {},
): KeywordNoiseAssessment {
  const normalizedKeyword = normalizeKeyword(keyword);
  const tokens = tokenize(normalizedKeyword);
  const tokenSet = new Set(tokens);
  const seedTokens = new Set(tokenize(seedKeyword));
  const reasons: string[] = [];
  let score = 0;

  const hasBusinessSuffix = BUSINESS_SUFFIXES.some(suffix => tokenSet.has(suffix));
  const hasOrgTerm = ORGANIZATION_TERMS.some(term => tokenSet.has(term)) || matchesPhrase(normalizedKeyword, ['department of', 'office of', 'state of', 'city of']);
  const hasDirectoryEntity = matchesPhrase(normalizedKeyword, DIRECTORY_ENTITIES);
  const hasNavigationalTerm = NAVIGATIONAL_TERMS.some(term => tokenSet.has(term));
  const overlap = overlapRatio(tokens, seedTokens);
  const longEntityShape = tokens.length >= 4 && overlap <= 0.5;
  const allowlisted = isAllowlisted(seedKeyword, normalizedKeyword);
  const { prefix, suffix } = splitAroundSeed(normalizedKeyword, seedKeyword);
  const prefixTokens = prefix ? tokenize(prefix) : [];
  const suffixTokens = suffix ? tokenize(suffix) : [];
  const hasEntityPrefix = prefixTokens.length > 0 && prefixTokens.length <= 3;
  const suffixIsMostlyNavigational =
    suffixTokens.length > 0 &&
    suffixTokens.every(token => NAVIGATIONAL_TERMS.includes(token as (typeof NAVIGATIONAL_TERMS)[number]));

  if (hasDirectoryEntity) {
    score += 50;
    reasons.push('directory/job-board entity');
  }

  if (hasBusinessSuffix) {
    score += 30;
    reasons.push('business suffix');
  }

  if (hasOrgTerm) {
    score += 30;
    reasons.push('organization/agency term');
  }

  if (hasNavigationalTerm) {
    score += 25;
    reasons.push('navigational modifier');
  }

  if (longEntityShape) {
    score += 20;
    reasons.push('low-overlap multiword entity');
  }

  if (hasEntityPrefix && (hasNavigationalTerm || suffixIsMostlyNavigational)) {
    score += 55;
    reasons.push('entity prefix around seed');
  }

  if (overlap === 0 && (hasBusinessSuffix || hasOrgTerm || hasDirectoryEntity)) {
    score += 15;
    reasons.push('off-topic entity');
  }

  if (allowlisted) {
    score = Math.max(0, score - 45);
    reasons.push('seed brand allowlist');
  }

  if (options.includeBrands) {
    return {
      score,
      allowlisted,
      hardFiltered: false,
      reasons,
    };
  }

  const hardThreshold = options.strictNoiseFilter ? 55 : 85;
  const hardFiltered =
    !allowlisted &&
    (
      score >= hardThreshold ||
      (hasNavigationalTerm && (hasDirectoryEntity || hasBusinessSuffix || hasOrgTerm)) ||
      (hasEntityPrefix && (hasNavigationalTerm || suffixIsMostlyNavigational))
    );

  return {
    score,
    allowlisted,
    hardFiltered,
    reasons,
  };
}

export function normalizeAndDedupSuggestions(
  suggestions: Array<{ keyword: string; sourceType: KeywordSuggestion['sourceType']; index: number }>,
): KeywordSuggestion[] {
  const bestByKeyword = new Map<string, KeywordSuggestion>();

  for (const suggestion of suggestions) {
    const normalizedKeyword = normalizeKeyword(suggestion.keyword);
    if (!normalizedKeyword) continue;

    const nextValue: KeywordSuggestion = {
      keyword: normalizedKeyword,
      normalizedKeyword,
      sourceType: suggestion.sourceType,
      index: suggestion.index,
    };

    const current = bestByKeyword.get(normalizedKeyword);
    if (!current) {
      bestByKeyword.set(normalizedKeyword, nextValue);
      continue;
    }

    if (current.sourceType !== 'direct' && suggestion.sourceType === 'direct') {
      bestByKeyword.set(normalizedKeyword, nextValue);
      continue;
    }

    if (current.sourceType === suggestion.sourceType && suggestion.index < current.index) {
      bestByKeyword.set(normalizedKeyword, nextValue);
    }
  }

  return Array.from(bestByKeyword.values());
}

export function applyNoiseFilter(
  suggestions: KeywordSuggestion[],
  seedKeyword: string,
  options: { includeBrands?: boolean; strictNoiseFilter?: boolean } = {},
): {
  kept: Array<KeywordSuggestion & { noiseAssessment: KeywordNoiseAssessment }>;
  filtered: FilteredKeyword[];
} {
  const kept: Array<KeywordSuggestion & { noiseAssessment: KeywordNoiseAssessment }> = [];
  const filtered: FilteredKeyword[] = [];

  for (const suggestion of suggestions) {
    const noiseAssessment = keywordNoiseScore(suggestion.normalizedKeyword, seedKeyword, options);
    if (noiseAssessment.hardFiltered) {
      filtered.push({
        keyword: suggestion.keyword,
        noiseScore: noiseAssessment.score,
        reasons: noiseAssessment.reasons,
      });
      continue;
    }

    kept.push({
      ...suggestion,
      noiseAssessment,
    });
  }

  return { kept, filtered };
}
