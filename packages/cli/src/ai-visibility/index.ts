import type { Finding } from '@seocore/sdk';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { calculateAiScore } from '@seocore/scoring-core';
import { report as generateReport } from './reporter.js';
import type { CheckResult } from './types.js';
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

function toGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function collectIssues(findings: Finding[], ruleId: string): string[] {
  return Array.from(new Set(findings.filter((finding) => finding.ruleId === ruleId).map((finding) => finding.message)));
}

function buildBreakdown(aiFindings: Finding[], pagesAudited: number): CheckResult[] {
  const { subScores } = calculateAiScore(aiFindings, pagesAudited);

  return [
    {
      dimension: 'Extractability',
      score: subScores.extractability,
      maxScore: 100,
      weight: 17,
      issues: collectIssues(aiFindings, 'ai-extractability'),
      wins: collectIssues(aiFindings, 'ai-extractability').length === 0 ? ['Content is cleanly structured for AI extraction.'] : [],
    },
    {
      dimension: 'Entity Clarity',
      score: subScores.entityClarity,
      maxScore: 100,
      weight: 17,
      issues: collectIssues(aiFindings, 'ai-entity-clarity'),
      wins: collectIssues(aiFindings, 'ai-entity-clarity').length === 0 ? ['Entity identity is clearly defined.'] : [],
    },
    {
      dimension: 'Citation Readiness',
      score: subScores.citationReadiness,
      maxScore: 100,
      weight: 17,
      issues: collectIssues(aiFindings, 'ai-citation-readiness'),
      wins: collectIssues(aiFindings, 'ai-citation-readiness').length === 0 ? ['Citation and FAQ signals are present.'] : [],
    },
    {
      dimension: 'Structural Organization',
      score: subScores.structuralOrg,
      maxScore: 100,
      weight: 17,
      issues: collectIssues(aiFindings, 'ai-structural-organization'),
      wins: collectIssues(aiFindings, 'ai-structural-organization').length === 0 ? ['Content hierarchy is easy for AI systems to parse.'] : [],
    },
    {
      dimension: 'Retrieval Friendliness',
      score: subScores.retrievalFriendliness,
      maxScore: 100,
      weight: 16,
      issues: collectIssues(aiFindings, 'ai-retrieval-friendliness'),
      wins: collectIssues(aiFindings, 'ai-retrieval-friendliness').length === 0 ? ['Content chunks cleanly for retrieval systems.'] : [],
    },
    {
      dimension: 'Authority Signals',
      score: subScores.authoritySignals,
      maxScore: 100,
      weight: 16,
      issues: collectIssues(aiFindings, 'ai-authority-signals'),
      wins: collectIssues(aiFindings, 'ai-authority-signals').length === 0 ? ['Authority and trust signals are visible.'] : [],
    },
  ];
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

  const engine = new SeoEngine(new EventBus());
  const audit = await engine.run(
    url,
    {
      preset: 'quick',
      maxPages: 1,
      maxDepth: 1,
      modules: {
        core: false,
        performance: false,
        mobile: false,
        aiVisibility: true,
        security: false,
        backlinks: false,
        hreflang: false,
      },
    },
    'fast',
  );

  if (spinner) {
    spinner.stop('AI visibility analysis complete.');
  }

  const aiFindings = audit.findings.filter((finding) => finding.category === 'ai_visibility');
  const breakdown = buildBreakdown(aiFindings, audit.pagesAudited);
  const score = audit.categories.ai_visibility?.score ?? 0;
  const grade = toGrade(score);

  const result = {
    score,
    grade,
    breakdown,
    url,
    checkedAt: new Date().toISOString(),
  };

  if (!options.silent) {
    generateReport(url, score, grade, breakdown, jsonFlag, options);
  }

  return result;
}
