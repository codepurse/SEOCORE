import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import type { ContentAnalysis, EeatAnalysis, AiCitationReadiness } from '@seocore/analyzers';

export interface ContentAnalysisResult {
  metadata: { url: string; date: string };
  scores: { eeat: number; contentQuality: number; aiCitationReadiness: number };
  eeat: EeatAnalysis;
  contentQuality: ContentAnalysis;
  aiCitationReadiness: AiCitationReadiness;
}

export function reportTerminal(result: ContentAnalysisResult): void {
  console.log(pc.cyan('='.repeat(80)));
  console.log(pc.cyan(pc.bold('              E-E-A-T & CONTENT QUALITY ANALYSIS REPORT')));
  console.log(pc.cyan('='.repeat(80)));
  console.log(`Target: ${pc.bold(result.metadata.url)}`);
  console.log(`Date: ${result.metadata.date}`);
  console.log();

  // Overall scores
  console.log(pc.bold(pc.yellow('📊 OVERALL SCORES:')));
  console.log(`  • E-E-A-T Score:          ${formatScore(result.scores.eeat)}`);
  console.log(`  • Content Quality Score:  ${formatScore(result.scores.contentQuality)}`);
  console.log(`  • AI Citation Readiness: ${formatScore(result.scores.aiCitationReadiness)}`);
  console.log();

  // E-E-A-T pillars
  console.log(pc.bold(pc.blue('🏛️  E-E-A-T PILLARS:')));
  console.log(`  • Experience:       ${formatScore(result.eeat.pillars.experience)}`);
  console.log(`  • Expertise:        ${formatScore(result.eeat.pillars.expertise)}`);
  console.log(`  • Authoritativeness: ${formatScore(result.eeat.pillars.authoritativeness)}`);
  console.log(`  • Trustworthiness:  ${formatScore(result.eeat.pillars.trustworthiness)}`);
  console.log();

  // Content quality
  console.log(pc.bold(pc.green('📝 CONTENT QUALITY:')));
  console.log(`  • Readability:`);
  console.log(`    - Flesch Reading Ease: ${result.contentQuality.readability.fleschReadingEase} (${getReadabilityLabel(result.contentQuality.readability.fleschReadingEase)})`);
  console.log(`    - Flesch-Kincaid Grade Level: ${result.contentQuality.readability.fleschKincaidGradeLevel}`);
  console.log(`  • Word Count: ${result.contentQuality.wordCount}`);
  console.log(`  • Headings: H1: ${result.contentQuality.headings.h1Count}, H2: ${result.contentQuality.headings.h2Count}, H3: ${result.contentQuality.headings.h3Count}`);
  console.log(`  • Internal Link Density: ${result.contentQuality.internalLinkDensity.toFixed(2)} links/100 words`);

  if (result.contentQuality.keywords.length > 0) {
    console.log(`  • Top Keywords:`);
    result.contentQuality.keywords.forEach(kw => {
      console.log(`    - ${kw.term}: ${(kw.density * 100).toFixed(2)}% (${kw.count} times)`);
    });
  }
  console.log();

  // AI Citation Readiness
  console.log(pc.bold(pc.magenta('🚀 AI CITATION READINESS:')));
  console.log(`  • Structured Data: ${result.aiCitationReadiness.structuredData.present ? pc.green('✓') : pc.yellow('✗')}`);
  if (result.aiCitationReadiness.structuredData.types.length > 0) {
    console.log(`    - Types: ${result.aiCitationReadiness.structuredData.types.join(', ')}`);
  }
  console.log(`  • llms.txt: ${result.aiCitationReadiness.llmsTxt.present ? pc.green('✓') : pc.yellow('✗')}`);
  console.log(`  • Semantic HTML: ${result.aiCitationReadiness.semanticHtml.good ? pc.green('✓') : pc.yellow('✗')}`);
  console.log();

  // Findings
  const issues = [...result.eeat.findings.filter(f => f.type !== 'success')];
  if (issues.length > 0) {
    console.log(pc.bold(pc.red('⚠️ ISSUES TO FIX:')));
    issues.forEach(issue => {
      const icon = issue.type === 'error' ? '🔴' : '🟡';
      console.log(`  ${icon} [${issue.pillar}] ${issue.message}`);
    });
  }
  const strengths = [...result.eeat.findings.filter(f => f.type === 'success')];
  if (strengths.length > 0) {
    console.log(pc.bold(pc.green('✅ STRENGTHS:')));
    strengths.forEach(strength => {
      console.log(`  🟢 [${strength.pillar}] ${strength.message}`);
    });
  }
  console.log();
}

function formatScore(score: number): string {
  let color: (s: string) => string;
  if (score >= 80) color = pc.green;
  else if (score >= 60) color = pc.yellow;
  else color = pc.red;
  return `${color(`${score}/100`)}`;
}

function getReadabilityLabel(score: number): string {
  if (score >= 90) return 'Very Easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly Easy';
  if (score >= 60) return 'Plain English';
  if (score >= 50) return 'Fairly Difficult';
  if (score >= 30) return 'Difficult';
  return 'Very Confusing';
}

export function exportJson(result: ContentAnalysisResult, outputPath: string): string {
  const absolutePath = path.resolve(outputPath);
  fs.writeFileSync(absolutePath, JSON.stringify(result, null, 2), 'utf8');
  return absolutePath;
}

export function exportHtml(result: ContentAnalysisResult, outputPath: string): string {
  const absolutePath = path.resolve(outputPath);
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEOCORE - E-E-A-T & Content Quality Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; margin: 2rem; max-width: 1200px; margin-left: auto; margin-right: auto; }
    h1, h2, h3 { color: #1a73e8; }
    .score-card { background: #f8f9fa; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .success { color: #0f9d58; }
    .warning { color: #f9ab00; }
    .error { color: #d93025; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f1f3f4; }
  </style>
</head>
<body>
  <h1>SEOCORE - E-E-A-T & Content Quality Report</h1>
  <p><strong>Target:</strong> ${result.metadata.url}</p>
  <p><strong>Date:</strong> ${result.metadata.date}</p>

  <h2>Overall Scores</h2>
  <div class="score-card">
    <p><strong>E-E-A-T Score:</strong> <span class="${result.scores.eeat >= 80 ? 'success' : result.scores.eeat >= 60 ? 'warning' : 'error'}">${result.scores.eeat}/100</span></p>
    <p><strong>Content Quality Score:</strong> <span class="${result.scores.contentQuality >= 80 ? 'success' : result.scores.contentQuality >= 60 ? 'warning' : 'error'}">${result.scores.contentQuality}/100</span></p>
    <p><strong>AI Citation Readiness:</strong> <span class="${result.scores.aiCitationReadiness >= 80 ? 'success' : result.scores.aiCitationReadiness >= 60 ? 'warning' : 'error'}">${result.scores.aiCitationReadiness}/100</span></p>
  </div>

  <h2>E-E-A-T Pillars</h2>
  <table>
    <tr><th>Pillar</th><th>Score</th></tr>
    <tr><td>Experience</td><td>${result.eeat.pillars.experience}/100</td></tr>
    <tr><td>Expertise</td><td>${result.eeat.pillars.expertise}/100</td></tr>
    <tr><td>Authoritativeness</td><td>${result.eeat.pillars.authoritativeness}/100</td></tr>
    <tr><td>Trustworthiness</td><td>${result.eeat.pillars.trustworthiness}/100</td></tr>
  </table>

  <h2>Content Quality Details</h2>
  <div class="score-card">
    <p><strong>Readability:</strong> Flesch Reading Ease: ${result.contentQuality.readability.fleschReadingEase} | Flesch-Kincaid Grade Level: ${result.contentQuality.readability.fleschKincaidGradeLevel}</p>
    <p><strong>Word Count:</strong> ${result.contentQuality.wordCount}</p>
    <p><strong>Headings:</strong> H1: ${result.contentQuality.headings.h1Count}, H2: ${result.contentQuality.headings.h2Count}, H3: ${result.contentQuality.headings.h3Count}</p>
  </div>

  <h2>Findings</h2>
  <h3 class="warning">Issues</h3>
  <ul>
    ${result.eeat.findings.filter(f => f.type !== 'success').map(f => `<li class="${f.type}">${f.message}</li>`).join('')}
  </ul>
  <h3 class="success">Strengths</h3>
  <ul>
    ${result.eeat.findings.filter(f => f.type === 'success').map(f => `<li class="${f.type}">${f.message}</li>`).join('')}
  </ul>
</body>
</html>`;
  fs.writeFileSync(absolutePath, html, 'utf8');
  return absolutePath;
}
