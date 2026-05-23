import { FetchedSite } from '../fetcher.js';
import { CheckResult } from '../types.js';

export function check(site: FetchedSite): CheckResult {
  const dimension = 'Topical Breadth & Context';
  const weight = 10;
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
  const patterns = [
    '/blog',
    '/guides',
    '/glossary',
    '/faq',
    '/compare',
    '/case-studies',
    '/about',
    '/pricing',
    '/documentation',
    '/resources'
  ];

  const matchedPatterns = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    let pathname = '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const urlObj = new URL(href);
        pathname = urlObj.pathname;
      } catch {
        // Skip invalid URL
      }
    } else {
      pathname = href.split('?')[0].split('#')[0];
    }

    const pathLower = pathname.toLowerCase();
    for (const pattern of patterns) {
      const patLower = pattern.toLowerCase();
      // Match exact path, subpath starting with pattern + '/', or relative suffix mapping (e.g., /blog.html)
      if (pathLower === patLower || pathLower.startsWith(patLower + '/') || pathLower.startsWith(patLower + '.')) {
        matchedPatterns.add(pattern);
      }
    }
  });

  const matchedArray = Array.from(matchedPatterns);
  const score = Math.min(maxScore, matchedArray.length * 10);

  const wins: string[] = [];
  const issues: string[] = [];

  for (const pattern of patterns) {
    if (matchedPatterns.has(pattern)) {
      wins.push(`Discovered internal topical pathway: ${pattern}`);
    } else {
      issues.push(`Missing typical topical pathway: ${pattern} (helps AI synthesize complete brand context).`);
    }
  }

  return {
    dimension,
    score,
    maxScore,
    weight,
    issues,
    wins,
  };
}
