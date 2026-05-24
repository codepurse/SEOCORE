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
import { Spinner } from '../utils/spinner.js';

export interface AiVisibilityOptions {
  json?: boolean;
  silent?: boolean;
  verbose?: boolean;
  format?: 'terminal' | 'json' | 'html';
  output?: string;
}

export interface AiVisibilityResult {
  score: number;
  grade: string;
  breakdown: CheckResult[];
  url: string;
  checkedAt: string;
}

export async function runAiVisibility(
  url: string,
  options: AiVisibilityOptions = {}
): Promise<AiVisibilityResult> {
  const jsonFlag = !!options.json || options.format === 'json';
  const silent = !!options.silent;

  let spinner: Spinner | null = null;
  if (!jsonFlag && !silent) {
    spinner = new Spinner(`Analyzing AI visibility for ${url}...`);
    spinner.start();
  }

  // 1. Fetch site html, robots, sitemap, llms.txt
  const site = await fetchSite(url);

  if (spinner) {
    spinner.stop('AI visibility analysis complete.');
  }

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
  const result = {
    score: scoreResult.score,
    grade: scoreResult.grade,
    breakdown,
    url,
    checkedAt: new Date().toISOString(),
  };

  if (!options.silent) {
    generateReport(url, scoreResult.score, scoreResult.grade, breakdown, jsonFlag, options);
  }

  return result;
}
