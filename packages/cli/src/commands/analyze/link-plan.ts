import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { LinkPlanAnalyzer, LinkPlanResult, LinkSuggestion } from '@seocore/analyzers';
import { validateUrl } from '../../shared/index.js';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('link-plan')
      .description('Generate actionable internal linking recommendations')
      .argument('<url>', 'Target website starting URL')
      .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
      .option('-o, --output <path>', 'Export file path')
      .option('-t, --top <number>', 'Limit suggestions to top N', parseInt)
      .option('--full', 'Crawl the entire site', false)
      .option('-d, --depth <number>', 'Crawl depth limit', parseInt)
      .option('-m, --max-pages <number>', 'Maximum pages to crawl', parseInt)
      .option('--min-confidence <number>', 'Minimum confidence threshold (0-100)', parseInt)
      .option('--max-suggestions-per-target <number>', 'Max suggestions per target page', parseInt)
      .option('--verbose', 'Show additional diagnostic details', false)
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore analyze link-plan https://example.com',
          'seocore analyze link-plan https://example.com --top 20',
          'seocore analyze link-plan https://example.com --full --min-confidence 60 --verbose',
          'seocore analyze link-plan https://example.com --format html --output ./link-plan.html',
        ],
      },
    ]
  );
}

async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    console.log(pc.cyan('\n🔗  Analyzing internal link structure...\n'));

    const partialConfig: any = {
      maxPages: options.maxPages || (options.full ? 100 : 50),
      maxDepth: options.depth || (options.full ? 5 : 3),
      preset: 'standard',
    };

    const eventBus = new EventBus();
    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig);

    const analyzer = new LinkPlanAnalyzer();
    const plan = analyzer.analyze(result.pages, result.crawlGraph, url, {
      maxSuggestions: options.full ? 100 : 50,
      maxSuggestionsPerTarget: options.maxSuggestionsPerTarget || 5,
      minConfidence: options.minConfidence || 0,
    });

    if (options.format === 'json') {
      const outPath = options.output || './link-plan-report.json';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
      console.log(pc.green(`✓  JSON report exported to ${pc.bold(outPath)}`));
      return;
    }

    if (options.format === 'html') {
      const htmlOutput = generateHtml(plan);
      const outPath = options.output || './link-plan-report.html';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, htmlOutput, 'utf8');
      console.log(pc.green(`✓  HTML report exported to ${pc.bold(outPath)}`));
      return;
    }

    printTerminalReport(plan, options.top, options.verbose);
  } catch (err: any) {
    console.error(pc.red(`\nLink plan analysis failed: ${err.message}`));
    process.exit(1);
  }
}

function printTerminalReport(plan: LinkPlanResult, limit?: number, verbose?: boolean): void {
  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                 INTERNAL LINK PLANNER')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  if (plan.suggestions.length > 0) {
    console.log(pc.bold(pc.green('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.green(`SUGGESTED INTERNAL LINKS (${plan.suggestions.length}):`)));
    console.log(pc.green('───────────────────────────────────────────────────────────────'));

    const suggestions = plan.suggestions.slice(0, limit || 15);
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const confColor = s.confidence > 70 ? pc.green : s.confidence > 50 ? pc.yellow : pc.gray;
      const confBadge = confColor(`${s.confidence}%`);
      const scoreBadge = pc.gray(`score: ${s.score}`);

      console.log(`\n  ${pc.green('→')} ${pc.bold(`Link #${i + 1}`)} ${pc.gray(`[${confBadge} confidence · ${scoreBadge}]`)}`);

      const sourceShort = s.sourceUrl.length > 60 ? s.sourceUrl.slice(0, 57) + '...' : s.sourceUrl;
      const targetShort = s.targetUrl.length > 60 ? s.targetUrl.slice(0, 57) + '...' : s.targetUrl;

      console.log(`    ${pc.cyan('From:')} ${sourceShort}`);
      if (s.sourceTitle) {
        console.log(`    ${pc.gray('└─')} Title: "${s.sourceTitle.slice(0, 50)}"`);
      }

      console.log(`    ${pc.green('To:')} ${targetShort}`);
      if (s.targetTitle) {
        console.log(`    ${pc.gray('└─')} Title: "${s.targetTitle.slice(0, 50)}"`);
      }

      console.log(`    ${pc.magenta('Anchor:')} "${s.anchorTheme}"`);
      console.log(`    ${pc.gray('Reason:')} ${s.reason}`);
      if (verbose && s.sourceSignals.length > 0) {
        console.log(`    ${pc.gray('Signals:')} ${s.sourceSignals.join(', ')}`);
      }
    }
    if (plan.suggestions.length > suggestions.length) {
      console.log(`\n  ${pc.gray(`... and ${plan.suggestions.length - suggestions.length} more suggestions`)}`);
    }
    console.log();
  }

  if (plan.orphanPages.length > 0) {
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`ORPHAN PAGES (${plan.orphanPages.length}):`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));

    const orphans = plan.orphanPages.slice(0, limit || 10);
    for (const orphan of orphans) {
      const titleStr = orphan.title ? `"${orphan.title.slice(0, 50)}${orphan.title.length > 50 ? '...' : ''}"` : 'No title';
      console.log(`  ${pc.red('○')} ${pc.cyan(orphan.url)}`);
      console.log(`    ${pc.gray('└─')} Title: ${pc.white(titleStr)}`);
      console.log(`    ${pc.gray('└─')} ${pc.yellow(orphan.reason)}`);
      if (verbose && orphan.score != null) {
        console.log(`    ${pc.gray('└─')} Target score: ${orphan.score}`);
      }
    }
    if (plan.orphanPages.length > orphans.length) {
      console.log(`  ${pc.gray(`... and ${plan.orphanPages.length - orphans.length} more orphan pages`)}`);
    }
    console.log();
  }

  if (plan.priorityPages.length > 0) {
    console.log(pc.bold(pc.yellow('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.yellow(`LOW-AUTHORITY PRIORITY PAGES (${plan.priorityPages.length}):`)));
    console.log(pc.yellow('───────────────────────────────────────────────────────────────'));

    const priorities = plan.priorityPages.slice(0, limit || 10);
    for (const priority of priorities) {
      const titleStr = priority.title ? `"${priority.title.slice(0, 50)}${priority.title.length > 50 ? '...' : ''}"` : 'No title';
      console.log(`  ${pc.yellow('★')} ${pc.cyan(priority.url)}`);
      console.log(`    ${pc.gray('└─')} Title: ${pc.white(titleStr)}`);
      console.log(`    ${pc.gray('└─')} ${pc.yellow(priority.reason)}`);
      if (verbose && priority.score != null) {
        console.log(`    ${pc.gray('└─')} Target score: ${priority.score}`);
      }
    }
    if (plan.priorityPages.length > priorities.length) {
      console.log(`  ${pc.gray(`... and ${plan.priorityPages.length - priorities.length} more priority pages`)}`);
    }
    console.log();
  }

  if (plan.hubs.length > 0) {
    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.cyan(`HIGH-LEVERAGE HUBS (${plan.hubs.length}):`)));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));

    for (const hub of plan.hubs.slice(0, limit || 10)) {
      const authColor = hub.authorityScore > 70 ? pc.green : hub.authorityScore > 40 ? pc.yellow : pc.gray;
      const hubShort = hub.url.length > 60 ? hub.url.slice(0, 57) + '...' : hub.url;

      console.log(`  ${pc.cyan('●')} ${hubShort}`);
      console.log(`    ${pc.gray('└─')} Out-links: ${pc.white(hub.outDegree)} | In-links: ${pc.white(hub.inDegree)} | Authority: ${authColor(hub.authorityScore.toFixed(0))}`);
    }
    console.log();
  }

  console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
  console.log(pc.bold('SUMMARY:'));
  console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
  console.log(`  Orphan pages:     ${pc.red(String(plan.summary.orphanCount))}`);
  console.log(`  Priority pages:   ${pc.yellow(String(plan.summary.priorityCount))}`);
  console.log(`  Suggestions:      ${pc.green(String(plan.summary.suggestionCount))}`);
  console.log(`  Hubs:             ${pc.cyan(String(plan.summary.hubCount))}`);
  console.log();

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  if (plan.summary.orphanCount === 0 && plan.summary.priorityCount === 0) {
    console.log(pc.green('✓  No linking issues detected. Your internal link structure looks healthy!\n'));
  } else {
    const totalIssues = plan.summary.orphanCount + plan.summary.priorityCount;
    console.log(pc.yellow(`⚠  Found ${totalIssues} pages that could benefit from additional internal links.\n`));
  }
}

function generateHtml(plan: LinkPlanResult): string {
  const suggestionsRows = plan.suggestions.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><a href="${s.sourceUrl}">${s.sourceUrl}</a>${s.sourceTitle ? `<br><small>${s.sourceTitle}</small>` : ''}</td>
      <td><a href="${s.targetUrl}">${s.targetUrl}</a>${s.targetTitle ? `<br><small>${s.targetTitle}</small>` : ''}</td>
      <td>${s.anchorTheme}</td>
      <td><span class="badge ${s.confidence > 70 ? 'good' : s.confidence > 50 ? 'mid' : 'low'}">${s.confidence}%</span></td>
      <td>${s.score}</td>
      <td>${s.reason}</td>
    </tr>
  `).join('');

  const orphanCards = plan.orphanPages.map(o => `
    <div class="card orphan">
      <div class="card-title"><a href="${o.url}">${o.url}</a></div>
      ${o.title ? `<div class="card-subtitle">${o.title}</div>` : ''}
      <div class="card-meta">${o.reason}</div>
    </div>
  `).join('');

  const hubCards = plan.hubs.map(h => `
    <div class="card hub">
      <div class="card-title"><a href="${h.url}">${h.url}</a></div>
      <div class="card-meta">Out: ${h.outDegree} | In: ${h.inDegree} | Authority: ${h.authorityScore}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Internal Link Plan - ${plan.url}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; max-width: 1400px; margin: 0 auto; background: #f8fafc; color: #1e293b; }
    h1, h2, h3 { color: #0f172a; margin-bottom: 1rem; }
    h1 { border-bottom: 2px solid #0ea5e9; padding-bottom: 0.5rem; }
    .meta { color: #64748b; margin-bottom: 2rem; }
    .section { background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); padding: 2rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; color: #0f172a; font-weight: 600; }
    tr:hover { background: #f8fafc; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge.good { background: #dcfce7; color: #166534; }
    .badge.mid { background: #fef9c3; color: #854d0e; }
    .badge.low { background: #f1f5f9; color: #475569; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
    .card { border-left: 4px solid; padding: 1rem; background: #fafafa; border-radius: 0 8px 8px 0; }
    .card.orphan { border-color: #ef4444; }
    .card.hub { border-color: #0ea5e9; }
    .card-title { font-weight: 600; margin-bottom: 0.25rem; }
    .card-title a { color: #0f172a; text-decoration: none; }
    .card-title a:hover { text-decoration: underline; }
    .card-subtitle { color: #64748b; font-size: 0.9rem; }
    .card-meta { color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .summary-item { text-align: center; padding: 1.5rem; background: #f1f5f9; border-radius: 8px; }
    .summary-number { font-size: 2rem; font-weight: bold; color: #0ea5e9; }
    .summary-label { color: #64748b; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>🔗 Internal Link Plan</h1>
  <div class="meta">
    <p><strong>URL:</strong> ${plan.url}</p>
    <p><strong>Generated:</strong> ${plan.generatedAt}</p>
  </div>

  <div class="section">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-number">${plan.summary.orphanCount}</div>
        <div class="summary-label">Orphan Pages</div>
      </div>
      <div class="summary-item">
        <div class="summary-number">${plan.summary.priorityCount}</div>
        <div class="summary-label">Priority Pages</div>
      </div>
      <div class="summary-item">
        <div class="summary-number">${plan.summary.suggestionCount}</div>
        <div class="summary-label">Suggestions</div>
      </div>
      <div class="summary-item">
        <div class="summary-number">${plan.summary.hubCount}</div>
        <div class="summary-label">Hubs</div>
      </div>
    </div>
  </div>

  ${plan.suggestions.length > 0 ? `
  <div class="section">
    <h2>Suggested Internal Links (${plan.suggestions.length})</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Source</th><th>Target</th><th>Anchor</th><th>Confidence</th><th>Score</th><th>Reason</th></tr>
      </thead>
      <tbody>
        ${suggestionsRows}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${plan.orphanPages.length > 0 ? `
  <div class="section">
    <h2>Orphan Pages (${plan.orphanPages.length})</h2>
    <div class="cards">
      ${orphanCards}
    </div>
  </div>
  ` : ''}

  ${plan.hubs.length > 0 ? `
  <div class="section">
    <h2>High-Leverage Hubs (${plan.hubs.length})</h2>
    <div class="cards">
      ${hubCards}
    </div>
  </div>
  ` : ''}
</body>
</html>`;
}
