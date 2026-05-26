import type { SearchIntent } from './types.js';

function tokenize(keyword: string): string[] {
  return keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function matchesPattern(keyword: string, tokens: Set<string>, patterns: readonly string[]): boolean {
  return patterns.some(pattern => {
    if (pattern.includes(' ')) {
      return keyword.includes(pattern);
    }
    return tokens.has(pattern);
  });
}

const JOB_PATTERNS = [
  'job',
  'jobs',
  'career',
  'careers',
  'salary',
  'hiring',
  'vacancy',
  'vacancies',
  'internship',
  'internships',
  'resume',
  'employment',
  'employer',
  'recruitment',
  'recruiter',
  'positions',
  'openings',
  'degree',
  'certification',
  'training',
  'license',
  'licensing',
] as const;

const LOCAL_PATTERNS = [
  'near me',
  'nearby',
  'local',
  'in my area',
  'address',
  'phone number',
  'location',
  'locations',
  'directions',
  'map',
  'hours',
  'open now',
  'zip code',
  'postal code',
] as const;

const TRANSACTIONAL_PATTERNS = [
  'buy',
  'purchase',
  'order',
  'hire',
  'consult',
  'book',
  'appointment',
  'services',
  'service',
  'agency',
  'provider',
  'providers',
  'clinic',
  'clinics',
  'shop',
  'online',
  'enroll',
  'register',
  'class',
  'classes',
  'course',
  'courses',
  'program',
  'programs',
  'center',
  'centers',
  'facility',
  'facilities',
  'therapist',
  'therapists',
  'hospital',
  'hospitals',
] as const;

const COMMERCIAL_PATTERNS = [
  'best',
  'top',
  'review',
  'reviews',
  'vs',
  'versus',
  'comparison',
  'compare',
  'alternative',
  'alternatives',
  'cost',
  'costs',
  'price',
  'pricing',
  'packages',
  'cheap',
  'expensive',
  'affordable',
  'ratings',
  'rated',
  'specifications',
  'specs',
] as const;

const INFORMATIONAL_PATTERNS = [
  'how',
  'why',
  'where',
  'what',
  'who',
  'when',
  'which',
  'guide',
  'tips',
  'tutorial',
  'tutorials',
  'benefits',
  'meaning',
  'definition',
  'examples',
  'example',
  'symptoms',
  'causes',
  'treatment',
  'disorder',
  'disorders',
  'history',
  'statistics',
  'facts',
  'information',
  'info',
  'faq',
  'faqs',
  'research',
] as const;

const LOCAL_PREPOSITIONS = ['in', 'at', 'near', 'around'] as const;

export function classifyIntent(keyword: string): SearchIntent {
  const normalized = keyword.toLowerCase().trim();
  const tokens = new Set(tokenize(normalized));

  if (matchesPattern(normalized, tokens, JOB_PATTERNS)) {
    return 'jobs-career';
  }

  const hasLocalPreposition = LOCAL_PREPOSITIONS.some(preposition => normalized.includes(` ${preposition} `));
  const hasStatePattern = /\bin\s+[a-z]{2}\b/i.test(normalized);
  const hasCityPattern =
    /\b(nyc|la|boston|chicago|miami|houston|seattle|austin|denver|dallas|phoenix|atlanta|philadelphia|detroit)\b/i.test(
      normalized,
    );
  if (
    matchesPattern(normalized, tokens, LOCAL_PATTERNS) ||
    (hasLocalPreposition && (hasStatePattern || hasCityPattern))
  ) {
    return 'local';
  }

  if (matchesPattern(normalized, tokens, TRANSACTIONAL_PATTERNS)) {
    return 'transactional';
  }

  if (matchesPattern(normalized, tokens, COMMERCIAL_PATTERNS)) {
    return 'commercial';
  }

  if (matchesPattern(normalized, tokens, INFORMATIONAL_PATTERNS)) {
    return 'informational';
  }

  return 'informational';
}
