import { FetchedSite } from '../fetcher.js';
import { CheckResult } from '../types.js';

function extractTypes(obj: unknown): string[] {
  if (obj === null || obj === undefined) {
    return [];
  }
  if (Array.isArray(obj)) {
    return obj.flatMap(extractTypes);
  }
  if (typeof obj === 'object') {
    const types: string[] = [];
    const typedObj = obj as Record<string, unknown>;
    
    if (typeof typedObj['@type'] === 'string') {
      types.push(typedObj['@type']);
    } else if (Array.isArray(typedObj['@type'])) {
      for (const t of typedObj['@type']) {
        if (typeof t === 'string') {
          types.push(t);
        }
      }
    }

    for (const key of Object.keys(typedObj)) {
      if (key !== '@type') {
        types.push(...extractTypes(typedObj[key]));
      }
    }
    return types;
  }
  return [];
}

export function check(site: FetchedSite): CheckResult {
  const dimension = 'Structured Data (Schema)';
  const weight = 25;
  const maxScore = 100;

  if (site.fetchError) {
    return {
      dimension,
      score: 0,
      maxScore,
      weight,
      issues: [`Fetch failed: ${site.fetchError}`],
      wins: [],
    };
  }

  const $ = site.$;
  const jsonLdScripts = $('script[type="application/ld+json"]');

  if (jsonLdScripts.length === 0) {
    return {
      dimension,
      score: 0,
      maxScore,
      weight,
      issues: ['No JSON-LD structured data tags found.'],
      wins: [],
    };
  }

  const foundTypes: string[] = [];
  let parseErrors = 0;

  jsonLdScripts.each((_, element) => {
    try {
      const text = $(element).html();
      if (text) {
        const parsed = JSON.parse(text.trim());
        foundTypes.push(...extractTypes(parsed));
      }
    } catch {
      parseErrors++;
    }
  });

  if (foundTypes.length === 0) {
    const issues = ['No valid JSON-LD schema blocks could be parsed.'];
    if (parseErrors > 0) {
      issues.push(`Failed to parse ${parseErrors} JSON-LD blocks due to syntax errors.`);
    }
    return {
      dimension,
      score: 0,
      maxScore,
      weight,
      issues,
      wins: [],
    };
  }

  let score = 0;
  const issues: string[] = [];
  const wins: string[] = [];

  if (parseErrors > 0) {
    issues.push(`Syntax error in ${parseErrors} JSON-LD blocks.`);
  }

  // 1. Organization
  if (foundTypes.includes('Organization')) {
    score += 25;
    wins.push('Schema: Organization type present.');
  } else {
    issues.push('Schema: Organization type missing (important for AI brand graph mapping).');
  }

  // 2. SoftwareApplication
  if (foundTypes.includes('SoftwareApplication')) {
    score += 25;
    wins.push('Schema: SoftwareApplication type present.');
  } else {
    issues.push('Schema: SoftwareApplication type missing (helps LLMs recognize software solutions).');
  }

  // 3. FAQPage
  if (foundTypes.includes('FAQPage')) {
    score += 20;
    wins.push('Schema: FAQPage type present.');
  } else {
    issues.push('Schema: FAQPage type missing (highly requested for AI chat answer indexing).');
  }

  // 4. Review or AggregateRating
  if (foundTypes.includes('Review') || foundTypes.includes('AggregateRating')) {
    score += 15;
    wins.push('Schema: Review or AggregateRating type present.');
  } else {
    issues.push('Schema: Review/AggregateRating type missing (required for trust/authority signals).');
  }

  // 5. Product
  if (foundTypes.includes('Product')) {
    score += 15;
    wins.push('Schema: Product type present.');
  } else {
    issues.push('Schema: Product type missing (important for commerce and feature queries).');
  }

  const finalScore = Math.min(maxScore, score);

  return {
    dimension,
    score: finalScore,
    maxScore,
    weight,
    issues,
    wins,
  };
}
