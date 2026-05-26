import type { ClusterLabelSource, ScoredKeyword } from './types.js';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'a',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'an',
  'is',
  'are',
  'about',
  'from',
  'how',
  'why',
  'what',
  'who',
  'where',
  'when',
  'which',
  'or',
  'best',
  'top',
  'new',
  'guide',
  'tips',
  'tip',
  'care',
  'beginner',
  'beginners',
  'near',
  'me',
  'vs',
  'versus',
]);

type SemanticBucketDefinition = {
  key: string;
  label: string;
  terms: string[];
};

type TopicCandidate = {
  key: string;
  label: string;
  score: number;
  labelSource: ClusterLabelSource;
  matchTerms: string[];
};

const SEMANTIC_BUCKETS: SemanticBucketDefinition[] = [
  { key: 'services', label: 'Services', terms: ['service', 'services', 'provider', 'providers', 'agency', 'agencies'] },
  { key: 'treatment', label: 'Treatment', terms: ['treatment', 'therapy', 'therapies', 'rehab'] },
  { key: 'clinics', label: 'Clinics', terms: ['clinic', 'clinics', 'center', 'centers', 'facility', 'facilities'] },
  { key: 'symptoms', label: 'Symptoms', terms: ['symptom', 'symptoms', 'signs'] },
  { key: 'disorders', label: 'Disorders', terms: ['disorder', 'disorders', 'condition', 'conditions'] },
  { key: 'costs', label: 'Costs', terms: ['cost', 'costs', 'price', 'prices', 'pricing', 'insurance'] },
  { key: 'reviews', label: 'Reviews', terms: ['review', 'reviews', 'ratings', 'rating'] },
  { key: 'comparisons', label: 'Comparisons', terms: ['compare', 'comparison', 'comparisons', 'vs', 'versus', 'alternative', 'alternatives'] },
  { key: 'local-care', label: 'Local care', terms: ['near me', 'nearby', 'local', 'location', 'locations'] },
  { key: 'careers', label: 'Careers', terms: ['job', 'jobs', 'career', 'careers', 'salary', 'hiring'] },
];

export function tokenizeForTopics(keyword: string): string[] {
  return keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function singularize(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1);
  return token;
}

export function canonicalizeTopicKey(key: string): string {
  return key
    .split(/\s+/)
    .map(token => singularize(token))
    .join(' ')
    .trim();
}

export function formatTopicLabel(key: string): string {
  return key
    .split(/\s+/)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function extractKeywordPhrases(keyword: string, seedTokens: Set<string>): string[] {
  const tokens = tokenizeForTopics(keyword).filter(token => !STOP_WORDS.has(token) && !seedTokens.has(token) && token.length >= 3);
  const phrases = new Set<string>();

  for (const token of tokens) {
    phrases.add(canonicalizeTopicKey(token));
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = canonicalizeTopicKey(`${tokens[index]} ${tokens[index + 1]}`);
    if (bigram.split(' ').every(token => token.length >= 3)) {
      phrases.add(bigram);
    }
  }

  return Array.from(phrases);
}

function countTopicCandidates(keywords: ScoredKeyword[], seedTokens: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();

  for (const keyword of keywords) {
    const phrases = extractKeywordPhrases(keyword.keyword, seedTokens);
    for (const phrase of phrases) {
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  return counts;
}

function semanticMatches(keyword: string): TopicCandidate[] {
  const normalized = keyword.toLowerCase().trim();
  const tokenSet = new Set(tokenizeForTopics(normalized));

  return SEMANTIC_BUCKETS.flatMap(bucket => {
    const matchedTerms = bucket.terms.filter(term => {
      if (term.includes(' ')) return normalized.includes(term);
      return tokenSet.has(term);
    });

    if (matchedTerms.length === 0) return [];

    return [
      {
        key: bucket.key,
        label: bucket.label,
        score: 100 + matchedTerms.length * 10,
        labelSource: 'semantic-bucket' as const,
        matchTerms: matchedTerms,
      },
    ];
  });
}

export function assignTopicCandidate(
  keyword: ScoredKeyword,
  seedKeyword: string,
  topicCounts?: Map<string, number>,
): TopicCandidate | null {
  const semantic = semanticMatches(keyword.keyword)
    .filter(candidate => candidate.key !== 'careers' && candidate.key !== 'local-care')
    .sort((left, right) => right.score - left.score)[0];

  if (semantic) {
    return semantic;
  }

  const seedTokens = new Set(tokenizeForTopics(seedKeyword));
  const phrases = extractKeywordPhrases(keyword.keyword, seedTokens);

  const rankedPhrases = phrases
    .map(phrase => ({
      phrase,
      count: topicCounts?.get(phrase) ?? 0,
      specificity: phrase.includes(' ') ? 2 : 1,
    }))
    .filter(entry => entry.count >= 2)
    .sort((left, right) => {
      if (right.specificity !== left.specificity) return right.specificity - left.specificity;
      if (right.count !== left.count) return right.count - left.count;
      return right.phrase.length - left.phrase.length;
    });

  if (rankedPhrases.length === 0) return null;

  const best = rankedPhrases[0];
  return {
    key: best.phrase,
    label: formatTopicLabel(best.phrase),
    score: best.count * 10 + best.specificity * 5,
    labelSource: 'phrase',
    matchTerms: [best.phrase],
  };
}

export function buildTopicCounts(keywords: ScoredKeyword[], seedKeyword: string): Map<string, number> {
  return countTopicCandidates(keywords, new Set(tokenizeForTopics(seedKeyword)));
}
