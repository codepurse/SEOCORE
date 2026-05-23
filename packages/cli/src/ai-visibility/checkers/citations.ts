import { FetchedSite } from '../fetcher.js';
import { CheckResult } from '../types.js';

export function check(site: FetchedSite): CheckResult {
  const dimension = 'Citations & Authority Signals';
  const weight = 15;
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
  let currentHost = '';
  try {
    const parsedUrl = new URL(site.url);
    currentHost = parsedUrl.hostname.toLowerCase();
  } catch {
    // Ignore invalid start URL
  }

  let pressCount = 0;
  let reviewCount = 0;
  let eduGovCount = 0;

  const matchedPress: string[] = [];
  const matchedReviews: string[] = [];
  const matchedEduGov: string[] = [];

  const pressDomains = [
    'forbes.com', 'businessinsider.com', 'techcrunch.com', 'wired.com', 'nytimes.com',
    'wsj.com', 'bloomberg.com', 'reuters.com', 'apnews.com', 'theverge.com'
  ];
  
  const reviewDomains = [
    'g2.com', 'capterra.com', 'trustpilot.com', 'softwareadvice.com', 'getapp.com'
  ];

  const matchesDomain = (hostname: string, targetDomain: string) => {
    return hostname === targetDomain || hostname.endsWith('.' + targetDomain);
  };

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const urlObj = new URL(href);
        const host = urlObj.hostname.toLowerCase();

        // Skip if same host
        if (currentHost && host === currentHost) {
          return;
        }

        let matched = false;

        for (const d of pressDomains) {
          if (matchesDomain(host, d)) {
            pressCount++;
            matchedPress.push(urlObj.origin);
            matched = true;
            break;
          }
        }

        if (!matched) {
          for (const d of reviewDomains) {
            if (matchesDomain(host, d)) {
              reviewCount++;
              matchedReviews.push(urlObj.origin);
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          if (host.endsWith('.edu') || host.endsWith('.gov')) {
            eduGovCount++;
            matchedEduGov.push(urlObj.origin);
          }
        }

      } catch {
        // Skip invalid URL strings
      }
    }
  });

  let score = 0;
  const issues: string[] = [];
  const wins: string[] = [];

  const totalPressAndReview = pressCount + reviewCount;

  if (pressCount >= 4) {
    score = 60;
    wins.push(`Found strong press authority references (${pressCount} press links: ${[...new Set(matchedPress)].join(', ')}).`);
  } else if (totalPressAndReview >= 2) {
    score = 40;
    wins.push(`Found citation references (${totalPressAndReview} links: ${[...new Set([...matchedPress, ...matchedReviews])].join(', ')}).`);
  } else if (totalPressAndReview >= 1) {
    score = 20;
    wins.push(`Found single citation reference (${[...new Set([...matchedPress, ...matchedReviews])].join(', ')}).`);
  } else {
    score = 0;
    issues.push('No citations to known press domains or review platforms found (helps AI verify trust).');
  }

  // Bonus for edu/gov
  if (eduGovCount > 0) {
    score += 20;
    wins.push(`Awarded 20pt authority bonus for .edu/.gov link references (${[...new Set(matchedEduGov)].join(', ')}).`);
  } else {
    issues.push('No .edu or .gov outbound links found (important academic/government trust markers).');
  }

  // Cap at 100
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
