import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import type { Finding, Severity } from '@seocore/sdk';
import type { SecurityAuditResult } from './index.js';

interface ReportOptions {
  json?: boolean;
  format?: 'terminal' | 'json' | 'html';
  output?: string;
  verbose?: boolean;
}

const SEVERITY_ORDER: Severity[] = ['critical', 'error', 'warning', 'info'];

function gradeColor(grade: string): (s: string) => string {
  if (grade.startsWith('A')) return pc.green;
  if (grade === 'B') return pc.cyan;
  if (grade === 'C') return pc.yellow;
  return pc.red;
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 90) return pc.green;
  if (score >= 70) return pc.cyan;
  if (score >= 60) return pc.yellow;
  return pc.red;
}

function severityTag(sev: Severity): string {
  switch (sev) {
    case 'critical': return pc.bgRed(pc.white(' CRITICAL '));
    case 'error': return pc.red('[ERROR]  ');
    case 'warning': return pc.yellow('[WARNING]');
    case 'info': return pc.gray('[INFO]   ');
  }
}

export function report(result: SecurityAuditResult, options: ReportOptions = {}): void {
  if (options.json || options.format === 'json') {
    const json = JSON.stringify(result, null, 2);
    if (options.output) {
      fs.writeFileSync(options.output, json, 'utf8');
      console.log(pc.green(`✓ Security report saved to ${path.resolve(options.output)}`));
    } else {
      console.log(json);
    }
    return;
  }

  if (options.format === 'html') {
    const html = renderHtml(result);
    const outPath = options.output || 'seocore-security-report.html';
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(pc.green(`✓ Security HTML report saved to ${path.resolve(outPath)}`));
    return;
  }

  renderTerminal(result, options);
}

function renderTerminal(result: SecurityAuditResult, options: ReportOptions): void {
  const { details } = result;
  const gc = gradeColor(result.grade);
  const sc = scoreColor(result.score);

  console.log();
  console.log(pc.bold(pc.cyan('====================================================================')));
  console.log(pc.bold(pc.cyan('                    SECURITY AUDIT REPORT                           ')));
  console.log(pc.bold(pc.cyan('====================================================================')));
  console.log(`${pc.bold('Target URL:')} ${pc.underline(result.url)}`);
  if (result.finalUrl !== result.url) {
    console.log(`${pc.bold('Final URL:')}  ${pc.gray(result.finalUrl)}`);
  }
  console.log(`${pc.bold('Checked At:')} ${pc.gray(result.checkedAt)}`);
  console.log();
  console.log(`  ${pc.bold('Security Score:')} [ ${sc(String(result.score).padStart(3))} / 100 ]   ${pc.bold('Grade:')} [ ${gc(pc.bold(result.grade))} ]`);
  if (details.appliedCap !== null && details.gateReason) {
    console.log(`  ${pc.yellow('⚠ Score capped at ' + details.appliedCap)}: ${pc.gray(details.gateReason)}`);
  }
  console.log();

  // Bucket breakdown
  console.log(pc.bold('CATEGORY BREAKDOWN:'));
  console.log(pc.gray('────────────────────────────────────────────────────────────────────'));
  for (const bucket of details.buckets) {
    const bc = scoreColor(bucket.score);
    const label = bucket.label.padEnd(28);
    const scoreStr = bc(String(bucket.score).padStart(3));
    const weight = pc.gray(`${bucket.weightPct}%`.padStart(4));
    const affected = bucket.affectedPages > 0 ? pc.gray(` — ${bucket.matchedFindings} issue(s)`) : pc.green(' — clean');
    console.log(`  ${label} ${scoreStr}/100  ${weight}${affected}`);
  }
  console.log();

  // Findings grouped by severity
  const findings = result.findings;
  if (findings.length === 0) {
    console.log(pc.green('✓ No security issues found. Excellent.'));
    console.log();
    return;
  }

  console.log(pc.bold(`FINDINGS (${findings.length}):`));
  console.log(pc.gray('────────────────────────────────────────────────────────────────────'));
  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter(f => f.severity === sev);
    if (group.length === 0) continue;
    for (const finding of group) {
      console.log(`  ${severityTag(sev)} ${finding.message}`);
      if (options.verbose) {
        if (finding.recommendation) console.log(`      ${pc.gray('Fix:')} ${pc.green(finding.recommendation)}`);
        if (finding.evidence) console.log(`      ${pc.gray('Evidence:')} ${pc.gray(finding.evidence)}`);
      }
    }
  }
  console.log();
  if (!options.verbose) {
    console.log(pc.gray('💡 Tip: run with --verbose to see remediation steps and evidence for each finding.'));
    console.log();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(result: SecurityAuditResult): string {
  const { details } = result;
  const bucketRows = details.buckets
    .map(b => `<tr><td>${escapeHtml(b.label)}</td><td class="num">${b.score}</td><td class="num">${b.weightPct}%</td><td class="num">${b.matchedFindings}</td></tr>`)
    .join('\n');

  const findingRows = SEVERITY_ORDER.flatMap(sev =>
    result.findings
      .filter(f => f.severity === sev)
      .map(f => `<tr class="sev-${sev}"><td>${sev.toUpperCase()}</td><td>${escapeHtml(f.message)}</td><td>${escapeHtml(f.recommendation || '')}</td></tr>`),
  ).join('\n');

  const cap = details.appliedCap !== null && details.gateReason
    ? `<p class="cap">⚠ Score capped at ${details.appliedCap}: ${escapeHtml(details.gateReason)}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Security Audit — ${escapeHtml(result.url)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem auto; max-width: 920px; color: #1a1a2e; padding: 0 1rem; }
  h1 { font-size: 1.5rem; }
  .grade { font-size: 3rem; font-weight: 800; }
  .meta { color: #666; font-size: .9rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #eee; }
  th { background: #f6f6fb; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .cap { color: #b45309; background: #fffbeb; padding: .6rem .8rem; border-radius: 6px; }
  .sev-critical td:first-child { color: #fff; background: #dc2626; font-weight: 700; }
  .sev-error td:first-child { color: #dc2626; font-weight: 700; }
  .sev-warning td:first-child { color: #b45309; }
  .sev-info td:first-child { color: #6b7280; }
</style></head><body>
  <h1>🔒 Security Audit Report</h1>
  <p class="meta"><strong>${escapeHtml(result.url)}</strong><br>Checked ${escapeHtml(result.checkedAt)}</p>
  <p><span class="grade">${escapeHtml(result.grade)}</span> &nbsp; ${result.score} / 100</p>
  ${cap}
  <h2>Category breakdown</h2>
  <table><thead><tr><th>Category</th><th class="num">Score</th><th class="num">Weight</th><th class="num">Issues</th></tr></thead>
  <tbody>${bucketRows}</tbody></table>
  <h2>Findings (${result.findings.length})</h2>
  ${result.findings.length === 0
    ? '<p>✓ No security issues found.</p>'
    : `<table><thead><tr><th>Severity</th><th>Issue</th><th>Recommendation</th></tr></thead><tbody>${findingRows}</tbody></table>`}
  <p class="meta">Generated by SEOCore — passive header/configuration audit.</p>
</body></html>`;
}
