import axios from 'axios';
import { clusterKeywords } from './cluster-builder.js';
import { applyNoiseFilter, normalizeAndDedupSuggestions } from './noise-filter.js';
import { scoreKeyword } from './scorer.js';
import type { KeywordIntelligence, KeywordResearchOptions, KeywordSourceType, SearchIntent } from './types.js';

const GOOGLE_SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';

interface NicheDefinition {
  name: string;
  keywords: string[];
  semanticModifiers: string[];
}

const NICHES: NicheDefinition[] = [
  {
    name: 'Health, Medical & Wellness',
    keywords: ['health', 'medical', 'therapy', 'clinic', 'treatment', 'doctor', 'patient', 'hospital', 'wellness', 'disease', 'disorder', 'rehab', 'psychiatrist', 'psychologist', 'counseling', 'medicine', 'care', 'nursing'],
    semanticModifiers: ['treatment', 'services', 'clinics', 'disorders', 'providers', 'symptoms', 'therapy', 'cost', 'reviews', 'benefits', 'specialists', 'care option', 'insurance'],
  },
  {
    name: 'Tech, SaaS & Software',
    keywords: ['software', 'saas', 'app', 'tool', 'platform', 'tech', 'api', 'cloud', 'database', 'developer', 'security', 'code', 'programming', 'ai', 'artificial intelligence', 'crm'],
    semanticModifiers: ['features', 'pricing', 'reviews', 'alternatives', 'integration', 'vs', 'free trial', 'demo', 'tutorial', 'enterprise', 'comparison', 'download'],
  },
  {
    name: 'Finance & Insurance',
    keywords: ['finance', 'insurance', 'loan', 'credit', 'bank', 'investment', 'stock', 'crypto', 'mortgage', 'tax', 'wealth', 'savings', 'account', 'financial'],
    semanticModifiers: ['rates', 'best plans', 'calculator', 'how to invest', 'compare', 'fees', 'services', 'advisor', 'reviews', 'benefits', 'requirements'],
  },
  {
    name: 'Business, Marketing & Agency',
    keywords: ['marketing', 'seo', 'business', 'agency', 'consulting', 'advertising', 'sales', 'growth', 'brand', 'strategy', 'management', 'leads'],
    semanticModifiers: ['services', 'packages', 'pricing', 'agency cost', 'strategy guide', 'best practices', 'examples', 'consultant near me', 'portfolio', 'results'],
  },
  {
    name: 'E-commerce, Retail & Products',
    keywords: ['buy', 'shop', 'online', 'store', 'product', 'deal', 'discount', 'cheap', 'best price', 'reviews', 'purchase', 'shipping', 'shoes', 'sneakers'],
    semanticModifiers: ['best price', 'coupon', 'deals', 'where to buy', 'reviews', 'free shipping', 'cheap', 'under 50', 'vs', 'comparison', 'quality'],
  },
  {
    name: 'Real Estate & Property',
    keywords: ['real estate', 'property', 'house', 'apartment', 'rent', 'sell', 'home', 'agent', 'broker', 'mortgage', 'listing'],
    semanticModifiers: ['for sale', 'for rent', 'listings', 'agents near me', 'market value', 'calculator', 'investment', 'buying guide', 'neighborhoods'],
  },
  {
    name: 'Education & Learning',
    keywords: ['course', 'learn', 'degree', 'training', 'school', 'class', 'academy', 'tutorial', 'certification', 'study', 'education', 'university'],
    semanticModifiers: ['online courses', 'certification cost', 'training program', 'classes near me', 'degree requirements', 'syllabus', 'reviews', 'careers'],
  },
];

const GENERIC_SEMANTIC_MODIFIERS = [
  'best',
  'how to',
  'guide',
  'services',
  'pricing',
  'alternatives',
  'tips',
  'near me',
  'examples',
  'solutions',
] as const;

export async function fetchGoogleSuggest(query: string, lang = 'en', country = 'us'): Promise<string[]> {
  try {
    const response = await axios.get(GOOGLE_SUGGEST_URL, {
      params: {
        client: 'chrome',
        hl: lang,
        gl: country,
        q: query,
      },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });

    if (Array.isArray(response.data) && response.data[1]) {
      return response.data[1] as string[];
    }
    return [];
  } catch {
    return [];
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  taskFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    const chunkResults = await Promise.all(chunk.map(taskFn));
    results.push(...chunkResults);
  }
  return results;
}

export function detectNiche(keyword: string): NicheDefinition | null {
  const normalized = keyword.toLowerCase().trim();
  const tokens = new Set(normalized.split(/\s+/));

  for (const niche of NICHES) {
    if (niche.keywords.some(entry => tokens.has(entry) || normalized.includes(` ${entry}`) || normalized.startsWith(`${entry} `))) {
      return niche;
    }
  }

  return null;
}

function buildIntentDistribution(keywords: Array<{ intent: SearchIntent }>): Record<SearchIntent, number> {
  const distribution: Record<SearchIntent, number> = {
    informational: 0,
    commercial: 0,
    transactional: 0,
    local: 0,
    'jobs-career': 0,
  };

  for (const keyword of keywords) {
    distribution[keyword.intent] += 1;
  }

  return distribution;
}

export async function performKeywordResearch(
  keyword: string,
  options: KeywordResearchOptions = {},
): Promise<KeywordIntelligence> {
  const lang = options.lang || options.providerConfig?.locale || 'en';
  const country = options.country || options.providerConfig?.region || 'us';
  const expand = options.expand || false;
  const checkedAt = new Date().toISOString();

  const niche = detectNiche(keyword);
  const semanticModifiers = niche ? niche.semanticModifiers : Array.from(GENERIC_SEMANTIC_MODIFIERS);
  const querySources: Array<{ query: string; type: KeywordSourceType }> = [{ query: keyword, type: 'direct' }];

  for (const modifier of semanticModifiers) {
    const query = modifier.startsWith('best') || modifier.startsWith('how') ? `${modifier} ${keyword}` : `${keyword} ${modifier}`;
    querySources.push({ query, type: 'semantic' });
  }

  if (expand) {
    const questionWords = ['how', 'why', 'where', 'what', 'best', 'who', 'when', 'which', 'are', 'is', 'can'];
    for (const word of questionWords) {
      querySources.push({ query: `${word} ${keyword}`, type: 'question' });
    }

    for (const letter of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
      querySources.push({ query: `${keyword} ${letter}`, type: 'alphabetical' });
    }
  }

  const rawResults = await runWithConcurrency(querySources, 6, async source => {
    const suggestions = await fetchGoogleSuggest(source.query, lang, country);
    return suggestions.map((suggestion, index) => ({
      keyword: suggestion,
      sourceType: source.type,
      index,
    }));
  });

  const flattenedSuggestions = rawResults.flat();
  const originalCount = flattenedSuggestions.length;
  const normalizedSuggestions = normalizeAndDedupSuggestions(flattenedSuggestions);
  const filteredSuggestions = applyNoiseFilter(normalizedSuggestions, keyword, {
    includeBrands: options.includeBrands,
    strictNoiseFilter: options.strictNoiseFilter,
  });

  const scoredKeywords = filteredSuggestions.kept.map(entry =>
    scoreKeyword({
      keyword: entry.keyword,
      seedKeyword: keyword,
      sourceType: entry.sourceType,
      index: entry.index,
      noiseAssessment: entry.noiseAssessment,
    }),
  );

  scoredKeywords.sort((left, right) => right.score - left.score);

  const clusters = clusterKeywords(scoredKeywords, keyword);
  const totalSoftDownRanked = scoredKeywords.filter(entry => entry.noiseScore >= 25).length;

  return {
    seedKeyword: keyword,
    lang,
    country,
    checkedAt,
    metrics: {
      totalDiscovered: originalCount,
      totalFiltered: scoredKeywords.length,
      totalHardFiltered: filteredSuggestions.filtered.length,
      totalSoftDownRanked,
      intentsDistribution: buildIntentDistribution(scoredKeywords),
    },
    clusters,
    allScoredKeywords: scoredKeywords,
    filteredKeywords: filteredSuggestions.filtered,
  };
}

export * from './types.js';
