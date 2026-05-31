import type { Finding, Severity } from '@seocore/sdk';
import { SECURITY_SUBCHECKS, type SecuritySubCheck } from '@seocore/rules-security';

export type SecurityBucketKey =
  | 'transport'
  | 'hsts'
  | 'csp'
  | 'browser-hardening'
  | 'cross-origin-isolation'
  | 'cookie-security'
  | 'supply-chain-disclosure';

interface SecurityBucketRule {
  subCheck: SecuritySubCheck;
  deduction: number;
}

interface SecurityBucketConfig {
  key: SecurityBucketKey;
  label: string;
  weight: number;
  maxDeductionPerPage: number;
  rules: readonly SecurityBucketRule[];
}

export interface SecurityBucketResult {
  key: SecurityBucketKey;
  label: string;
  weight: number;
  weightPct: number;
  score: number;
  averageDeduction: number;
  matchedFindings: number;
  affectedPages: number;
  coverage: number;
  subChecks: SecuritySubCheck[];
}

export interface SecurityScoreDetails {
  score: number;
  calculatedScore: number;
  floorLimit: number;
  floorAdjustedScore: number;
  appliedCap: number | null;
  gateReason: string | null;
  buckets: SecurityBucketResult[];
}

interface InternalSecurityBucketResult extends SecurityBucketResult {
  rawScore: number;
}

const SEVERITY_FACTORS: Record<Severity, number> = {
  critical: 1.15,
  error: 1.0,
  warning: 0.8,
  info: 0.6,
};

// Minimum share of a bucket's per-page severity that always applies, even when an
// issue is found on a single page out of many. Prevents widespread-issue dilution:
// a real hole on one page can never be averaged away to ~0 by clean pages, while
// site-wide issues still scale up to the full per-page deduction (prevalence -> 1).
const PREVALENCE_FLOOR = 0.4;

interface SecurityScoreCapRule {
  maxScore: number;
  reason: string;
  matches: (findings: Finding[]) => boolean;
}

const SECURITY_SCORE_CAP_RULES: readonly SecurityScoreCapRule[] = [
  {
    maxScore: 40,
    reason: 'Critical transport failure: HTTP or mixed content detected.',
    matches: findings => findings.some(finding =>
      matchesSubCheck(finding, SECURITY_SUBCHECKS.NOT_HTTPS)
      || matchesSubCheck(finding, SECURITY_SUBCHECKS.MIXED_CONTENT)
    ),
  },
  {
    maxScore: 79,
    reason: 'Core security control missing: CSP or HSTS not enforced.',
    matches: findings => findings.some(finding =>
      matchesSubCheck(finding, SECURITY_SUBCHECKS.MISSING_CSP)
      || matchesSubCheck(finding, SECURITY_SUBCHECKS.MISSING_HSTS)
    ),
  },
  {
    maxScore: 89,
    reason: 'Security errors remain unresolved.',
    matches: findings => findings.some(finding =>
      (finding.severity === 'error' || finding.severity === 'critical')
      && !matchesSubCheck(finding, SECURITY_SUBCHECKS.NOT_HTTPS)
      && !matchesSubCheck(finding, SECURITY_SUBCHECKS.MIXED_CONTENT)
      && !matchesSubCheck(finding, SECURITY_SUBCHECKS.MISSING_CSP)
      && !matchesSubCheck(finding, SECURITY_SUBCHECKS.MISSING_HSTS)
    ),
  },
];

const SECURITY_BUCKETS: readonly SecurityBucketConfig[] = [
  {
    key: 'transport',
    label: 'HTTPS / Mixed Content',
    weight: 0.20,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.NOT_HTTPS, deduction: 100 },
      { subCheck: SECURITY_SUBCHECKS.MIXED_CONTENT, deduction: 40 },
      { subCheck: SECURITY_SUBCHECKS.INSECURE_FORM, deduction: 35 },
    ],
  },
  {
    key: 'hsts',
    label: 'HSTS',
    weight: 0.15,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.MISSING_HSTS, deduction: 100 },
      { subCheck: SECURITY_SUBCHECKS.HSTS_INVALID, deduction: 60 },
      { subCheck: SECURITY_SUBCHECKS.HSTS_SHORT_MAX_AGE, deduction: 35 },
      { subCheck: SECURITY_SUBCHECKS.HSTS_MISSING_SUBDOMAINS, deduction: 20 },
      { subCheck: SECURITY_SUBCHECKS.HSTS_MISSING_PRELOAD, deduction: 10 },
    ],
  },
  {
    key: 'csp',
    label: 'CSP Quality',
    weight: 0.20,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.MISSING_CSP, deduction: 70 },
      { subCheck: SECURITY_SUBCHECKS.CSP_REPORT_ONLY, deduction: 20 },
      { subCheck: SECURITY_SUBCHECKS.CSP_UNSAFE_INLINE_SCRIPT, deduction: 35 },
      { subCheck: SECURITY_SUBCHECKS.CSP_UNSAFE_EVAL_SCRIPT, deduction: 30 },
      { subCheck: SECURITY_SUBCHECKS.CSP_SCRIPT_SRC_WILDCARD, deduction: 25 },
      { subCheck: SECURITY_SUBCHECKS.CSP_OBJECT_SRC_WILDCARD, deduction: 20 },
      { subCheck: SECURITY_SUBCHECKS.CSP_MISSING_OBJECT_SRC, deduction: 15 },
      { subCheck: SECURITY_SUBCHECKS.CSP_MISSING_DEFAULT_SRC, deduction: 15 },
      { subCheck: SECURITY_SUBCHECKS.CSP_MISSING_FRAME_ANCESTORS, deduction: 10 },
    ],
  },
  {
    key: 'browser-hardening',
    label: 'Browser Hardening',
    weight: 0.15,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.MISSING_X_FRAME_OPTIONS, deduction: 30 },
      { subCheck: SECURITY_SUBCHECKS.MISSING_X_CONTENT_TYPE_OPTIONS, deduction: 30 },
      { subCheck: SECURITY_SUBCHECKS.INVALID_X_CONTENT_TYPE_OPTIONS, deduction: 15 },
      { subCheck: SECURITY_SUBCHECKS.MISSING_REFERRER_POLICY, deduction: 15 },
      { subCheck: SECURITY_SUBCHECKS.MISSING_PERMISSIONS_POLICY, deduction: 10 },
    ],
  },
  {
    key: 'cross-origin-isolation',
    label: 'Cross-Origin Isolation',
    weight: 0.10,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.MISSING_COOP, deduction: 34 },
      { subCheck: SECURITY_SUBCHECKS.MISSING_COEP, deduction: 33 },
      { subCheck: SECURITY_SUBCHECKS.MISSING_CORP, deduction: 33 },
    ],
  },
  {
    key: 'cookie-security',
    label: 'Cookie Security',
    weight: 0.12,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.COOKIE_MISSING_SECURE, deduction: 40 },
      { subCheck: SECURITY_SUBCHECKS.COOKIE_MISSING_HTTP_ONLY, deduction: 35 },
      { subCheck: SECURITY_SUBCHECKS.COOKIE_MISSING_SAME_SITE, deduction: 25 },
    ],
  },
  {
    key: 'supply-chain-disclosure',
    label: 'Supply Chain / Disclosure',
    weight: 0.08,
    maxDeductionPerPage: 100,
    rules: [
      { subCheck: SECURITY_SUBCHECKS.MISSING_SRI, deduction: 45 },
      { subCheck: SECURITY_SUBCHECKS.SERVER_VERSION_DISCLOSURE, deduction: 15 },
      { subCheck: SECURITY_SUBCHECKS.X_POWERED_BY_DISCLOSURE, deduction: 15 },
    ],
  },
] as const;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function matchesSubCheck(finding: Finding, subCheck: SecuritySubCheck): boolean {
  return finding.subCheck === subCheck
    || finding.ruleId === subCheck
    || finding.id.endsWith(`:${subCheck}`)
    || finding.id.includes(`:${subCheck}:`);
}

function getSecurityScoreCap(securityFindings: Finding[]): SecurityScoreCapRule | null {
  for (const rule of SECURITY_SCORE_CAP_RULES) {
    if (rule.matches(securityFindings)) {
      return rule;
    }
  }

  return null;
}

function calculateBucketResult(
  securityFindings: Finding[],
  pagesAudited: number,
  bucket: SecurityBucketConfig,
): InternalSecurityBucketResult {
  const normalizedPagesAudited = Math.max(1, pagesAudited);
  const pageDeductions = new Map<string, number>();
  let matchedFindings = 0;

  for (const finding of securityFindings) {
    for (const rule of bucket.rules) {
      if (!matchesSubCheck(finding, rule.subCheck)) {
        continue;
      }

      matchedFindings++;
      const severityFactor = SEVERITY_FACTORS[finding.severity] ?? 1;
      const weightedDeduction = rule.deduction * severityFactor;
      const pageKey = finding.url || '__unknown__';
      const currentDeduction = pageDeductions.get(pageKey) ?? 0;
      pageDeductions.set(
        pageKey,
        Math.min(bucket.maxDeductionPerPage, currentDeduction + weightedDeduction),
      );
      break;
    }
  }

  const affectedPages = pageDeductions.size;
  const totalDeduction = Array.from(pageDeductions.values())
    .reduce((sum, deduction) => sum + deduction, 0);

  // Typical severity on an affected page (0..maxDeductionPerPage), independent of
  // how many clean pages exist. This is what was previously diluted by total pages.
  const averageAffectedDeduction = affectedPages > 0 ? totalDeduction / affectedPages : 0;

  // How widespread the issue is across the audited site (0..1).
  const coverage = affectedPages > 0
    ? Math.min(1, affectedPages / normalizedPagesAudited)
    : 0;

  // Blend severity with prevalence: isolated issues keep at least PREVALENCE_FLOOR
  // of their bite, site-wide issues reach the full per-page deduction.
  const prevalence = affectedPages > 0
    ? PREVALENCE_FLOOR + (1 - PREVALENCE_FLOOR) * coverage
    : 0;

  const effectiveDeduction = averageAffectedDeduction * prevalence;
  const rawScore = clampScore(100 - effectiveDeduction);

  return {
    key: bucket.key,
    label: bucket.label,
    weight: bucket.weight,
    weightPct: Math.round(bucket.weight * 100),
    score: Math.round(rawScore),
    rawScore,
    averageDeduction: Math.round(effectiveDeduction * 10) / 10,
    matchedFindings,
    affectedPages,
    coverage: Math.round(coverage * 1000) / 1000,
    subChecks: bucket.rules.map(rule => rule.subCheck),
  };
}

export function calculateSecurityScoreDetails(
  findings: Finding[],
  pagesAudited: number,
  floors: Record<string, number>,
): SecurityScoreDetails {
  const securityFindings = findings.filter(f => f.category === 'security');
  const bucketResults = SECURITY_BUCKETS.map(bucket =>
    calculateBucketResult(securityFindings, pagesAudited, bucket),
  );

  const calculatedSecurityScore = Math.round(
    bucketResults.reduce((sum, bucket) => sum + (bucket.rawScore * bucket.weight), 0),
  );

  const floorLimit = floors.security ?? 0;
  const floorAdjustedScore = Math.max(floorLimit, calculatedSecurityScore);
  const scoreCap = getSecurityScoreCap(securityFindings);
  const appliedCap = scoreCap && floorAdjustedScore > scoreCap.maxScore
    ? scoreCap.maxScore
    : null;
  const finalScore = appliedCap !== null
    ? appliedCap
    : floorAdjustedScore;

  return {
    score: finalScore,
    calculatedScore: calculatedSecurityScore,
    floorLimit,
    floorAdjustedScore,
    appliedCap,
    gateReason: appliedCap !== null ? scoreCap?.reason ?? null : null,
    buckets: bucketResults.map(({ rawScore: _rawScore, ...bucket }) => bucket),
  };
}

export function calculateSecurityScore(findings: Finding[], pagesAudited: number, floors: Record<string, number>): number {
  return calculateSecurityScoreDetails(findings, pagesAudited, floors).score;
}
