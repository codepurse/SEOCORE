import { fetchSite } from './fetcher.js';
import { check as checkMeta } from './checkers/meta.js';
import { check as checkSchema } from './checkers/schema.js';
import { check as checkContent } from './checkers/content.js';
import { check as checkCrawlability } from './checkers/crawlability.js';
import { check as checkCitations } from './checkers/citations.js';
import { check as checkTopical } from './checkers/topical.js';
import { score as calculateScore } from './scorer.js';
import { report as generateReport } from './reporter.js';
import { CheckResult } from './types.js';

export interface AiVisibilityOptions {
  json?: boolean;
  silent?: boolean;
}

export interface AiVisibilityResult {
  score: number;
  grade: string;
  breakdown: CheckResult[];
}

export async function runAiVisibility(
  url: string,
  options: AiVisibilityOptions = {}
): Promise<AiVisibilityResult> {
  const jsonFlag = !!options.json;

  // 1. Fetch site html, robots, sitemap, llms.txt
  const site = await fetchSite(url);

  // 2. Execute all checkers
  const breakdown: CheckResult[] = [
    checkMeta(site),
    checkSchema(site),
    checkContent(site),
    checkCrawlability(site),
    checkCitations(site),
    checkTopical(site),
  ];

  // 3. Score results
  const scoreResult = calculateScore(breakdown);

  // 4. Generate report
  if (!options.silent) {
    generateReport(url, scoreResult.score, scoreResult.grade, breakdown, jsonFlag);
  }

  return {
    score: scoreResult.score,
    grade: scoreResult.grade,
    breakdown,
  };
}
