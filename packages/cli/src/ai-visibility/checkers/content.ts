import * as cheerio from 'cheerio';
import { FetchedSite } from '../fetcher.js';
import { CheckResult } from '../types.js';

export function check(site: FetchedSite): CheckResult {
  const dimension = 'Content Quality & Structure';
  const weight = 20;
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

  // 1. Word count of visible text
  const $clone = cheerio.load(site.rawHtml);
  $clone('script, style, svg, path, iframe, noscript, link').remove();
  const bodyText = $clone('body').text() || $clone.root().text() || '';
  const words = bodyText.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  if (wordCount < 300) {
    issues.push(`Word count is extremely low (${wordCount} words). AI crawlers prefer deep, rich text.`);
  } else if (wordCount <= 800) {
    score += 20;
    wins.push(`Word count is adequate (${wordCount} words).`);
    issues.push(`Word count is ${wordCount} words; consider increasing to 800+ for deeper AI topical relevance.`);
  } else if (wordCount <= 2000) {
    score += 40;
    wins.push(`Word count is rich and detailed (${wordCount} words), providing great training data and context.`);
  } else {
    score += 60;
    wins.push(`Word count is exceptionally comprehensive (${wordCount} words) — authoritative reference for LLMs.`);
  }

  // 2. Number of H2 headings
  const h2Count = $('h2').length;
  if (h2Count === 0) {
    issues.push('No H2 headings found. Semantic outline (H2/H3) is critical for chunking.');
  } else if (h2Count <= 2) {
    score += 10;
    wins.push(`Found ${h2Count} H2 headings.`);
    issues.push(`Only ${h2Count} H2 headings found. Add more structural headers to chunk content for AI reading.`);
  } else {
    score += 20;
    wins.push(`Excellent section heading structure (${h2Count} H2 headings found).`);
  }

  // 3. Internal links count
  // We need to count internal links. Let's find all relative hrefs or same-domain hrefs.
  let internalLinksCount = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    // Check if relative or starts with /
    if (href.startsWith('/') && !href.startsWith('//')) {
      internalLinksCount++;
    } else if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#') && !href.startsWith('javascript:')) {
      internalLinksCount++;
    }
  });

  if (internalLinksCount <= 2) {
    issues.push(`Very few internal links found (${internalLinksCount}). AI crawlers cannot follow site pathways.`);
  } else if (internalLinksCount <= 9) {
    score += 10;
    wins.push(`Found ${internalLinksCount} internal links.`);
    issues.push(`Only ${internalLinksCount} internal links found. Aim for 10+ to construct a robust context map.`);
  } else {
    score += 20;
    wins.push(`Strong internal link count (${internalLinksCount} links) helping crawler discovery.`);
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
