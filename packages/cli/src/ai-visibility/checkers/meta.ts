import { FetchedSite } from '../fetcher.js';
import { CheckResult } from '../types.js';

export function check(site: FetchedSite): CheckResult {
  const dimension = 'Metadata Signals';
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
  let score = 0;
  const issues: string[] = [];
  const wins: string[] = [];

  // 1. Meta description
  const metaDescription = $('meta[name="description"]').attr('content') 
    || $('meta[name="Description"]').attr('content');
  if (metaDescription) {
    const len = metaDescription.length;
    if (len >= 120 && len <= 160) {
      score += 20;
      wins.push(`Meta description present with optimal length (${len} chars).`);
    } else {
      score += 10;
      issues.push(`Meta description is ${len} chars (optimal length is 120-160 chars).`);
      wins.push('Meta description tag is present.');
    }
  } else {
    issues.push('Meta description tag is missing.');
  }

  // 2. og:title
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) {
    score += 15;
    wins.push('Open Graph title tag is present.');
  } else {
    issues.push('Open Graph title tag is missing.');
  }

  // 3. og:description
  const ogDescription = $('meta[property="og:description"]').attr('content');
  if (ogDescription) {
    score += 15;
    wins.push('Open Graph description tag is present.');
  } else {
    issues.push('Open Graph description tag is missing.');
  }

  // 4. og:image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    score += 10;
    wins.push('Open Graph image tag is present.');
  } else {
    issues.push('Open Graph image tag is missing.');
  }

  // 5. twitter:card
  const twitterCard = $('meta[name="twitter:card"]').attr('content')
    || $('meta[property="twitter:card"]').attr('content');
  if (twitterCard) {
    score += 10;
    wins.push('Twitter card tag is present.');
  } else {
    issues.push('Twitter card tag is missing.');
  }

  // 6. canonical tag
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    score += 10;
    wins.push('Canonical URL tag is present.');
  } else {
    issues.push('Canonical URL tag is missing.');
  }

  // 7. robots meta allows indexing
  const robotsMeta = $('meta[name="robots"]').attr('content');
  if (robotsMeta && robotsMeta.toLowerCase().includes('noindex')) {
    issues.push('Robots meta tag explicitly restricts indexing ("noindex").');
  } else {
    score += 10;
    wins.push('Robots meta tag allows engine indexing.');
  }

  // 8. viewport meta
  const viewport = $('meta[name="viewport"]').attr('content');
  if (viewport) {
    score += 10;
    wins.push('Viewport meta tag is present.');
  } else {
    issues.push('Viewport meta tag is missing.');
  }

  // Cap score at 100
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
