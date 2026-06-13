import type { Finding, NormalizedPage, RuleEvaluationContext, SeoConfig } from '@seocore/sdk';
import { resolveConfig } from '@seocore/config';
import { HttpCrawler } from '@seocore/crawler';
import { PageNormalizer } from '@seocore/analyzers';
import { getSecurityRules, SECURITY_SUBCHECKS } from '@seocore/rules-security';
import { calculateSecurityScoreDetails, type SecurityScoreDetails } from '@seocore/scoring-core';
import { Spinner } from '../utils/spinner.js';
import { report as generateReport } from './reporter.js';

export interface SecurityAuditOptions {
  json?: boolean;
  format?: 'terminal' | 'json' | 'html';
  output?: string;
  verbose?: boolean;
  silent?: boolean;
  config?: string;
  /** Injectable fetch, primarily for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface SecurityAuditResult {
  url: string;
  finalUrl: string;
  checkedAt: string;
  score: number;
  grade: string;
  details: SecurityScoreDetails;
  findings: Finding[];
}

/** Matches the letter grade used by the main audit reporter for consistency. */
export function securityGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

const PROBE_TIMEOUT_MS = 8000;

function probeFinding(
  subCheck: string,
  severity: Finding['severity'],
  url: string,
  message: string,
  recommendation: string,
  evidence?: string,
): Finding {
  return {
    id: `security-site:${url}:${subCheck}`,
    ruleId: 'security-site',
    subCheck: subCheck as Finding['subCheck'],
    severity,
    category: 'security',
    url,
    message,
    recommendation,
    evidence,
  };
}

/**
 * Verifies that the plain-HTTP version of an HTTPS site redirects to HTTPS.
 * Returns null when the site is already HTTP (covered by the not-https rule),
 * when HTTP correctly redirects, or when HTTP is simply unreachable (HTTPS-only).
 */
export async function checkHttpsRedirect(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Finding | null> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:') return null;

  const httpUrl = `http://${target.host}${target.pathname}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetchImpl(httpUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)' },
    });
    clearTimeout(timeoutId);

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location');
    let redirectsToHttps = false;
    if (location) {
      try {
        redirectsToHttps = new URL(location, httpUrl).protocol === 'https:';
      } catch {
        redirectsToHttps = false;
      }
    }

    if (!isRedirect || !redirectsToHttps) {
      return probeFinding(
        SECURITY_SUBCHECKS.NO_HTTPS_REDIRECT,
        'warning',
        url,
        `The HTTP version of the site does not redirect to HTTPS (responded ${res.status}).`,
        'Configure a 301/308 redirect from http:// to https:// so visitors are never served the insecure URL.',
        `HEAD ${httpUrl} → ${res.status}${location ? ` (Location: ${location})` : ''}`,
      );
    }
  } catch {
    // HTTP endpoint unreachable — acceptable (HTTPS-only). Not a finding.
    return null;
  }

  return null;
}

/**
 * Checks for a published security.txt (RFC 9116) at the well-known or legacy path.
 */
export async function checkSecurityTxt(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Finding | null> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }

  const paths = ['/.well-known/security.txt', '/security.txt'];
  for (const path of paths) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      const res = await fetchImpl(`${origin}${path}`, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)' },
      });
      clearTimeout(timeoutId);
      if (res.ok) return null; // found a security.txt
    } catch {
      // try next path
    }
  }

  return probeFinding(
    SECURITY_SUBCHECKS.MISSING_SECURITY_TXT,
    'info',
    url,
    'No security.txt found (RFC 9116).',
    'Publish /.well-known/security.txt with a security contact so researchers can report vulnerabilities responsibly.',
  );
}

export async function runSecurityAudit(
  url: string,
  options: SecurityAuditOptions = {},
): Promise<SecurityAuditResult> {
  const jsonFlag = !!options.json || options.format === 'json';
  const fetchImpl = options.fetchImpl ?? fetch;

  let spinner: Spinner | null = null;
  if (!jsonFlag && !options.silent) {
    spinner = new Spinner(`Running security audit for ${url}...`);
    spinner.start();
  }

  const config: SeoConfig = resolveConfig({}, options.config);

  // Single-page, full-fidelity: crawl the target directly and run the security rules
  // with no severity filtering, so info-level findings (COOP/COEP/CORP, etc.) surface.
  const crawler = new HttpCrawler(config.cacheDir);
  const crawlResult = await crawler.crawl(url, config);

  if (!crawlResult.html && (crawlResult.statusCode === 0 || crawlResult.statusCode >= 400)) {
    if (spinner) spinner.stop('Security audit failed.');
    throw new Error(crawlResult.error || `Could not fetch ${url} (status ${crawlResult.statusCode}).`);
  }

  const page: NormalizedPage = PageNormalizer.normalize(crawlResult);
  const finalUrl = crawlResult.url || url;

  const ctx = {
    allPages: { [finalUrl]: page },
    config,
    dataSources: new Map(),
  } as unknown as RuleEvaluationContext;

  const findings: Finding[] = [];
  for (const rule of getSecurityRules()) {
    findings.push(...(await rule.evaluate(page, ctx)));
  }

  // Site-level probes (run once against the target).
  const [redirectFinding, securityTxtFinding] = await Promise.all([
    checkHttpsRedirect(finalUrl, fetchImpl),
    checkSecurityTxt(finalUrl, fetchImpl),
  ]);
  if (redirectFinding) findings.push(redirectFinding);
  if (securityTxtFinding) findings.push(securityTxtFinding);

  const details = calculateSecurityScoreDetails(findings, 1, { security: 0 });
  const grade = securityGrade(details.score);

  if (spinner) spinner.stop('Security audit complete.');

  const result: SecurityAuditResult = {
    url,
    finalUrl,
    checkedAt: new Date().toISOString(),
    score: details.score,
    grade,
    details,
    findings,
  };

  if (!options.silent) {
    generateReport(result, { json: jsonFlag, format: options.format, output: options.output, verbose: options.verbose });
  }

  return result;
}
