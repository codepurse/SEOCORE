import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { LinkPlanAnalyzer } from '@seocore/analyzers';
import { validateUrl } from '../../shared/index.js';

export function command(): Command {
  return new Command('link-plan')
    .description('Generate actionable internal linking recommendations')
    .argument('<url>', 'Target website starting URL')
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('-t, --top <number>', 'Limit suggestions to top N pages', parseInt)
    .option('--full', 'Crawl the entire site', false)
    .option('-d, --depth <number>', 'Crawl depth limit', parseInt)
    .option('-m, --max-pages <number>', 'Maximum pages to crawl', parseInt)
    .action(handler);
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
    const plan = analyzer.analyze(result.pages, result.crawlGraph, url);

    if (options.format === 'json') {
      const outPath = options.output || './link-plan-report.json';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
      console.log(pc.green(`✓  JSON report exported to ${pc.bold(outPath)}`));
      return;
    }

    printTerminalReport(plan, options.top);
  } catch (err: any) {
    console.error(pc.red(`\nLink plan analysis failed: ${err.message}`));
    process.exit(1);
  }
}

function printTerminalReport(plan: any, limit?: number): void {
  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                 INTERNAL LINK PLANNER')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

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
    }
    if (plan.priorityPages.length > priorities.length) {
      console.log(`  ${pc.gray(`... and ${plan.priorityPages.length - priorities.length} more priority pages`)}`);
    }
    console.log();
  }

  if (plan.suggestions.length > 0) {
    console.log(pc.bold(pc.green('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.green(`SUGGESTED INTERNAL LINKS (${plan.suggestions.length}):`)));
    console.log(pc.green('───────────────────────────────────────────────────────────────'));

    const suggestions = plan.suggestions.slice(0, limit || 15);
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const confColor = s.confidence > 70 ? pc.green : s.confidence > 50 ? pc.yellow : pc.gray;
      const confBadge = confColor(`${s.confidence}%`);

      console.log(`\n  ${pc.green('→')} ${pc.bold(`Link #${i + 1}`)} ${pc.gray(`[${confBadge} confidence]`)}`);

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
    }
    if (plan.suggestions.length > suggestions.length) {
      console.log(`\n  ${pc.gray(`... and ${plan.suggestions.length - suggestions.length} more suggestions`)}`);
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

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  if (plan.orphanPages.length === 0 && plan.priorityPages.length === 0) {
    console.log(pc.green('✓  No linking issues detected. Your internal link structure looks healthy!\n'));
  } else {
    const totalIssues = plan.orphanPages.length + plan.priorityPages.length;
    console.log(pc.yellow(`⚠  Found ${totalIssues} pages that could benefit from additional internal links.\n`));
  }
}
