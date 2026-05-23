import pc from 'picocolors';
import { AuditResult, Finding, Severity, Category } from '@seocore/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { HTML_TEMPLATE } from './template.js';

export class HtmlReporter {
  static export(result: AuditResult, outputPath: string): string {
    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const html = this.generateHtml(result);
    fs.writeFileSync(absolutePath, html, 'utf8');
    return absolutePath;
  }

  static generateHtml(result: AuditResult): string {
    const dataString = JSON.stringify(result).replace(/</g, '\\u003c');
    return HTML_TEMPLATE.replace(
      'window.__SEO_AUDIT_DATA__;',
      `window.__SEO_AUDIT_DATA__ = ${dataString};`
    );
  }
}

export class JsonReporter {
  static export(result: AuditResult, outputPath: string): string {
    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absolutePath, JSON.stringify(result, null, 2), 'utf8');
    return absolutePath;
  }
}

export class TerminalReporter {
  static report(result: AuditResult, options: { verbose?: boolean; minSeverity?: Severity } = {}): void {
    const { verbose = false, minSeverity = 'warning' } = options;

    const severityPriority: Record<Severity, number> = {
      critical: 4,
      error: 3,
      warning: 2,
      info: 1,
    };

    const minPriority = severityPriority[minSeverity];

    // Banner
    console.log('\n' + pc.bold(pc.bgCyan(pc.black('  SEOCORE INTELLIGENCE ENGINE  '))));
    console.log(`${pc.gray('Target URL:')} ${pc.cyan(pc.bold(result.url))}`);
    console.log(`${pc.gray('Timestamp: ')} ${result.timestamp}`);
    console.log(`${pc.gray('Pages Audited:')} ${pc.yellow(String(result.pagesAudited))} | ${pc.gray('Total Load Time:')} ${result.totalLoadTimeMs}ms\n`);

    // Filter and sort findings
    const activeFindings = result.findings
      .filter(f => severityPriority[f.severity] >= minPriority);

    // Group findings by category
    const findingsByCategory: Record<Category, Finding[]> = {
      indexing: [],
      metadata: [],
      links: [],
      seo: [],
      ai_visibility: [],
      accessibility: [],
      performance: [],
      mobile_seo: [],
    };
    for (const f of activeFindings) {
      if (findingsByCategory[f.category]) {
        findingsByCategory[f.category].push(f);
      }
    }

    // 1. Grouped Issue Display (Detailed Findings)
    console.log(pc.bold('DETAILED FINDINGS BY CATEGORY:'));
    let printedAny = false;

    const catColors: Record<Category, any> = {
      indexing: pc.bgBlue,
      metadata: pc.bgMagenta,
      links: pc.bgCyan,
      seo: pc.bgGreen,
      ai_visibility: pc.bgCyan,
      accessibility: pc.bgYellow,
      performance: pc.bgRed,
      mobile_seo: pc.bgBlue,
    };

    const sevColors: Record<Severity, any> = {
      critical: pc.red,
      error: pc.red,
      warning: pc.yellow,
      info: pc.blue,
    };

    for (const [catName, findings] of Object.entries(findingsByCategory)) {
      if (findings.length === 0) continue;
      printedAny = true;

      console.log(`\n${catColors[catName as Category](pc.bold(` ${catName.toUpperCase()} ISSUES (${findings.length}) `))}`);

      // Sort findings: critical first, then error, warning, info
      const sorted = [...findings].sort((a, b) => severityPriority[b.severity] - severityPriority[a.severity]);
      const countToShow = verbose ? sorted.length : Math.min(5, sorted.length);

      for (let i = 0; i < countToShow; i++) {
        const f = sorted[i];
        const sevColor = sevColors[f.severity];
        console.log(`\n  ${pc.bold(pc.white('• ' + f.message))} [${sevColor(f.severity.toUpperCase())}]`);
        console.log(`    ${pc.gray('URL:')}  ${pc.cyan(f.url)}`);
        console.log(`    ${pc.gray('Fix:')}  ${pc.green(f.recommendation)}`);
        if (f.evidence) {
          console.log(`    ${pc.gray('Info:')} ${pc.gray(f.evidence)}`);
        }
        if (f.category === 'mobile_seo') {
          let impact = '';
          if (f.id.includes('missing-viewport')) impact = '-40 Usability points (-14.0% Overall)';
          else if (f.id.includes('invalid-viewport')) impact = '-20 Usability points (-7.0% Overall)';
          else if (f.id.includes('fixed-width')) impact = '-20 Usability points (-7.0% Overall)';
          else if (f.id.includes('poor-navigation')) impact = '-15 Usability points (-5.25% Overall)';
          else if (f.id.includes('tap-target')) impact = '-15 Usability points (-5.25% Overall)';
          else if (f.id.includes('poor-lcp')) impact = '-40 Performance points (-14.0% Overall)';
          else if (f.id.includes('needs-improvement-lcp')) impact = '-20 Performance points (-7.0% Overall)';
          else if (f.id.includes('poor-cls')) impact = '-30 Performance points (-10.5% Overall)';
          else if (f.id.includes('needs-improvement-cls')) impact = '-15 Performance points (-5.25% Overall)';
          else if (f.id.includes('heavy-js')) impact = '-20 Performance points (-7.0% Overall)';
          else if (f.id.includes('excessive-js')) impact = '-40 Performance points (-14.0% Overall)';
          else if (f.id.includes('heavy-images')) impact = '-15 Performance points (-5.25% Overall)';
          else if (f.id.includes('render-blocking')) impact = '-15 Performance points (-5.25% Overall)';
          else if (f.id.includes('missing-media-queries')) impact = '-50 Responsive Design points (-10.0% Overall)';
          else if (f.id.includes('fixed-layout')) impact = '-25 Responsive Design points (-5.0% Overall)';
          else if (f.id.includes('missing-breakpoints')) impact = '-25 Responsive Design points (-5.0% Overall)';
          else if (f.id.includes('hidden-content')) impact = '-40 Indexing Readiness points (-4.0% Overall)';
          else if (f.id.includes('missing-schema')) impact = '-45 Indexing Readiness points (-4.5% Overall)';
          else if (f.id.includes('missing-canonical')) impact = '-40 Indexing Readiness points (-4.0% Overall)';
          else if (f.id.includes('canonical-mismatch')) impact = '-20 Indexing Readiness points (-2.0% Overall)';
          
          if (impact) {
            console.log(`    ${pc.gray('Impact:')} ${pc.red(impact)}`);
          }
        }
      }

      if (sorted.length > countToShow) {
        console.log(`  ${pc.italic(pc.yellow(`  ... and ${sorted.length - countToShow} more ${catName} findings. Run with --verbose to view all.`))}`);
      }
    }

    if (!printedAny) {
      console.log(pc.green('  ✔ No issues found matching active filters! Great job.\n'));
    }

    // 2. "TOP ISSUES" summary
    const totalCritical = result.findings.filter(f => f.severity === 'critical').length;
    const totalErrors = result.findings.filter(f => f.severity === 'error').length;
    const totalWarnings = result.findings.filter(f => f.severity === 'warning').length;

    console.log('\n' + pc.bold('TOP ISSUES SUMMARY:'));
    console.log(`  Critical: ${totalCritical > 0 ? pc.bold(pc.red(totalCritical)) : pc.gray('0')} | Errors: ${totalErrors > 0 ? pc.bold(pc.red(totalErrors)) : pc.gray('0')} | Warnings: ${totalWarnings > 0 ? pc.bold(pc.yellow(totalWarnings)) : pc.gray('0')}\n`);

    // 3. "QUICK WINS" section (High Impact, Critical/Error)
    const quickWins = [...result.findings]
      .filter(f => f.severity === 'critical' || f.severity === 'error')
      .slice(0, 5);

    if (quickWins.length > 0) {
      console.log(pc.bold(pc.green('⚡ QUICK WINS (High Impact Fixes):')));
      for (const win of quickWins) {
        const badge = win.severity === 'critical' ? pc.bgRed(' CRITICAL ') : pc.bgYellow(pc.black(' ERROR '));
        console.log(`  ${badge} ${pc.white(win.message)}`);
        console.log(`    ${pc.gray('Action:')} ${pc.green(win.recommendation)}`);
        console.log(`    ${pc.gray('Page:')}   ${pc.cyan(win.url)}\n`);
      }
    }

    // 4. Drilldown View: Crawl Graph topology and Pages Directory
    if (result.pages && Object.keys(result.pages).length > 0) {
      console.log(pc.bold('SITE DIRECTORY & CRAWL TOPOLOGY:'));
      console.log(pc.gray('┌──────────────────────────────────────────────────┬──────┬───────┬──────┬───────┬──────┐'));
      console.log(pc.gray('│') + ' URL                                              ' + pc.gray('│') + ' Stat ' + pc.gray('│') + ' Depth ' + pc.gray('│') + ' InL  ' + pc.gray('│') + ' Auth  ' + pc.gray('│') + ' Perf ' + pc.gray('│'));
      console.log(pc.gray('├──────────────────────────────────────────────────┼──────┼───────┼──────┼───────┼──────┤'));

      const pagesList = Object.values(result.pages).slice(0, 15);
      for (const p of pagesList) {
        let urlShort = p.url;
        if (urlShort.length > 48) {
          urlShort = urlShort.substring(0, 45) + '...';
        }
        const paddedUrl = urlShort.padEnd(48);

        const statusColor = p.statusCode === 200 ? pc.green : p.statusCode === 0 ? pc.gray : pc.red;
        const paddedStat = String(p.statusCode).padStart(4);

        const depthVal = p.depth !== undefined ? String(p.depth) : '-';
        const paddedDepth = depthVal.padStart(5);

        const inLVal = p.inDegree !== undefined ? String(p.inDegree) : '-';
        const paddedInL = inLVal.padStart(4);

        const authVal = p.authorityScore !== undefined ? String(p.authorityScore) : '-';
        const paddedAuth = authVal.padStart(5);

        const perfVal = p.performanceScore !== undefined ? String(p.performanceScore) : '-';
        let perfColor = pc.green;
        if (p.performanceScore && p.performanceScore < 50) perfColor = pc.red;
        else if (p.performanceScore && p.performanceScore < 80) perfColor = pc.yellow;
        const paddedPerf = perfVal.padStart(4);

        console.log(
          pc.gray('│') + ` ${paddedUrl} ` +
          pc.gray('│') + ` ${statusColor(paddedStat)} ` +
          pc.gray('│') + ` ${pc.white(paddedDepth)} ` +
          pc.gray('│') + ` ${pc.white(paddedInL)} ` +
          pc.gray('│') + ` ${pc.yellow(paddedAuth)} ` +
          pc.gray('│') + ` ${perfColor(paddedPerf)} ` +
          pc.gray('│') +
          (p.isOrphan ? pc.red(' [ORPHAN]') : '')
        );
      }
      console.log(pc.gray('└──────────────────────────────────────────────────┴──────┴───────┴──────┴───────┴──────┘'));
      if (Object.keys(result.pages).length > 15) {
        console.log(`  ${pc.italic(pc.gray(`... and ${Object.keys(result.pages).length - 15} more pages in report directory.`))}\n`);
      } else {
        console.log();
      }
    }

    // 5. Crawl Graph Metrics Summary
    if (result.crawlGraph) {
      const { metrics } = result.crawlGraph;
      console.log(pc.cyan('=== CRAWL TOPOLOGY METRICS ==='));
      console.log(`  Max Depth:       ${pc.bold(metrics.maxDepth)}`);
      console.log(`  Orphan Pages:    ${metrics.orphanCount > 0 ? pc.bold(pc.red(metrics.orphanCount)) : pc.green('0')}`);
      if (metrics.hubPages.length > 0) {
        console.log(`  Top Hub Page:    ${pc.cyan(metrics.hubPages[0].url)} (${pc.yellow(metrics.hubPages[0].outDegree)} out-links)`);
      }
      if (metrics.authorityNodes.length > 0) {
        console.log(`  Top Authority:   ${pc.cyan(metrics.authorityNodes[0].url)} (${pc.yellow(metrics.authorityNodes[0].inDegree)} in-links)`);
      }
      console.log();
    }

    // 6. Category Performance Table
    console.log(pc.bold('CATEGORY PERFORMANCE:'));
    console.log(pc.gray('┌─────────────────┬─────────┬────────────┬────────────┬────────────┐'));
    console.log(pc.gray('│') + ' Category        ' + pc.gray('│') + ' Score   ' + pc.gray('│') + ' Critical   ' + pc.gray('│') + ' Errors     ' + pc.gray('│') + ' Warnings   ' + pc.gray('│'));
    console.log(pc.gray('├─────────────────┼─────────┼────────────┼────────────┼────────────┤'));

    for (const [catName, cat] of Object.entries(result.categories)) {
      const formattedCat = catName.charAt(0).toUpperCase() + catName.slice(1);
      const paddedCat = formattedCat.padEnd(15);
      const catScore = cat.score;
      let catColor = pc.green;
      if (catScore < 50) catColor = pc.red;
      else if (catScore < 90) catColor = pc.yellow;

      const paddedScore = String(catScore).padStart(4) + '   ';
      const critCount = cat.findingsCount.critical;
      const errCount = cat.findingsCount.error;
      const warnCount = cat.findingsCount.warning;

      const paddedCrit = critCount > 0 ? pc.red(String(critCount).padStart(5).padEnd(10)) : pc.gray('    0     ');
      const paddedErr = errCount > 0 ? pc.red(String(errCount).padStart(5).padEnd(10)) : pc.gray('    0     ');
      const paddedWarn = warnCount > 0 ? pc.yellow(String(warnCount).padStart(5).padEnd(10)) : pc.gray('    0     ');

      console.log(
        pc.gray('│') + ` ${paddedCat} ` +
        pc.gray('│') + ` ${catColor(paddedScore)} ` +
        pc.gray('│') + ` ${paddedCrit} ` +
        pc.gray('│') + ` ${paddedErr} ` +
        pc.gray('│') + ` ${paddedWarn} ` +
        pc.gray('│')
      );
    }
    console.log(pc.gray('└─────────────────┴─────────┴────────────┴────────────┴────────────┘\n'));

    // 7. Overall SEO Score Meter (At absolute bottom)
    const score = result.score;
    let scoreColor = pc.green;
    let badge = ' [ EXCELLENT ]';
    if (score < 50) {
      scoreColor = pc.red;
      badge = ' [ CRITICAL ]';
    } else if (score < 90) {
      scoreColor = pc.yellow;
      badge = ' [ NEEDS WORK ]';
    }

    const perfScore = result.categories.performance?.score ?? 100;
    const indexingScore = result.categories.indexing?.score ?? 100;
    const accessScore = result.categories.accessibility?.score ?? 100;
    const aiScore = result.categories.ai_visibility?.score ?? 100;

    let aiColor = pc.green;
    if (aiScore < 50) aiColor = pc.red;
    else if (aiScore < 90) aiColor = pc.yellow;

    let perfColor = pc.green;
    if (perfScore < 50) perfColor = pc.red;
    else if (perfScore < 80) perfColor = pc.yellow;

    let idxColor = pc.green;
    if (indexingScore < 50) idxColor = pc.red;
    else if (indexingScore < 90) idxColor = pc.yellow;

    let accColor = pc.green;
    if (accessScore < 50) accColor = pc.red;
    else if (accessScore < 90) accColor = pc.yellow;

    const mobileScore = result.categories.mobile_seo?.score ?? 100;
    let mobileColor = pc.green;
    if (mobileScore < 50) mobileColor = pc.red;
    else if (mobileScore < 90) mobileColor = pc.yellow;

    console.log(pc.bold('PRIMARY AUDIT SCORES:'));
    console.log(`  Overall SEO Score:   [ ${scoreColor(String(score).padStart(3))} / 100 ]`);
    console.log(`  Mobile SEO Score:    [ ${mobileColor(String(mobileScore).padStart(3))} / 100 ]`);
    console.log(`  Performance Score:   [ ${perfColor(String(perfScore).padStart(3))} / 100 ]`);
    console.log(`  Indexing Score:      [ ${idxColor(String(indexingScore).padStart(3))} / 100 ]`);
    console.log(`  Accessibility Score: [ ${accColor(String(accessScore).padStart(3))} / 100 ]`);
    console.log(`  AI Visibility Score: [ ${aiColor(String(aiScore).padStart(3))} / 100 ]\n`);

    // Calculate AI sub-score breakdown
    const aiFindings = result.findings.filter(f => f.category === 'ai_visibility');
    const pagesCount = result.pagesAudited || 1;

    let extractability = 100;
    let entityClarity = 100;
    let citationReadiness = 100;
    let structuralOrg = 100;
    let retrievalFriendliness = 100;
    let authoritySignals = 100;

    const hasDetail = (f: any, detail: string, msgSubstring: string) => {
      let hash = 0;
      for (let i = 0; i < detail.length; i++) {
        hash = (hash << 5) - hash + detail.charCodeAt(i);
        hash |= 0;
      }
      const suffix = `:${Math.abs(hash).toString(36)}`;
      return f.id.endsWith(suffix) || f.message.toLowerCase().includes(msgSubstring.toLowerCase());
    };

    for (const f of aiFindings) {
      if (f.ruleId === 'ai-extractability') {
        if (hasDetail(f, 'no-semantic-containers', 'semantic content container')) extractability -= 25 / pagesCount;
        if (hasDetail(f, 'high-boilerplate-ratio', 'boilerplate-to-content')) extractability -= 25 / pagesCount;
        if (hasDetail(f, 'no-answer-first', 'answer-first')) extractability -= 10 / pagesCount;
      } else if (f.ruleId === 'ai-entity-clarity') {
        if (hasDetail(f, 'weak-entity', 'weakly defined')) entityClarity -= 55 / pagesCount;
        if (hasDetail(f, 'missing-disambiguation', 'disambiguation')) entityClarity -= 30 / pagesCount;
      } else if (f.ruleId === 'ai-citation-readiness') {
        if (hasDetail(f, 'no-external-citations', 'external citations')) citationReadiness -= 40 / pagesCount;
        if (hasDetail(f, 'missing-faq-schema', 'structured schema')) citationReadiness -= 30 / pagesCount;
        if (hasDetail(f, 'no-statistics', 'statistics')) citationReadiness -= 20 / pagesCount;
      } else if (f.ruleId === 'ai-structural-organization') {
        if (hasDetail(f, 'broken-hierarchy', 'Heading hierarchy')) structuralOrg -= 45 / pagesCount;
        if (hasDetail(f, 'no-lists-or-tables', 'list or table')) structuralOrg -= 20 / pagesCount;
      } else if (f.ruleId === 'ai-retrieval-friendliness') {
        if (hasDetail(f, 'paragraphs-too-long', 'Content sections are too long')) retrievalFriendliness -= 40 / pagesCount;
        if (hasDetail(f, 'thin-content', 'too thin')) retrievalFriendliness -= 50 / pagesCount;
      } else if (f.ruleId === 'ai-authority-signals') {
        if (hasDetail(f, 'missing-authorship', 'author profiles')) authoritySignals -= 45 / pagesCount;
        if (hasDetail(f, 'missing-trust-signals', 'trust signals')) authoritySignals -= 40 / pagesCount;
      }
    }

    extractability = Math.max(0, Math.min(100, Math.round(extractability)));
    entityClarity = Math.max(0, Math.min(100, Math.round(entityClarity)));
    citationReadiness = Math.max(0, Math.min(100, Math.round(citationReadiness)));
    structuralOrg = Math.max(0, Math.min(100, Math.round(structuralOrg)));
    retrievalFriendliness = Math.max(0, Math.min(100, Math.round(retrievalFriendliness)));
    authoritySignals = Math.max(0, Math.min(100, Math.round(authoritySignals)));

    const printBreakdownRow = (label: string, subScore: number, ruleId: string) => {
      console.log(`  • ${label.padEnd(26)} ${pc.bold(subScore)} / 100`);
      if (subScore < 100) {
        const ruleFindings = aiFindings.filter(f => f.ruleId === ruleId);
        const uniqueMessages = Array.from(new Set(ruleFindings.map(f => f.message)));
        for (const msg of uniqueMessages) {
          const arrowColor = subScore < 50 ? pc.red : pc.yellow;
          console.log(`    ${arrowColor('→')} ${pc.gray(msg)}`);
        }
      }
    };

    console.log(pc.bold(pc.cyan('🤖 AI VISIBILITY SCORE BREAKDOWN:')));
    printBreakdownRow('Extractability:', extractability, 'ai-extractability');
    printBreakdownRow('Entity Clarity:', entityClarity, 'ai-entity-clarity');
    printBreakdownRow('Citation Readiness:', citationReadiness, 'ai-citation-readiness');
    printBreakdownRow('Structural Organization:', structuralOrg, 'ai-structural-organization');
    printBreakdownRow('Retrieval Friendliness:', retrievalFriendliness, 'ai-retrieval-friendliness');
    printBreakdownRow('Authority Signals:', authoritySignals, 'ai-authority-signals');
    console.log();

    // Calculate Mobile SEO sub-score breakdown
    const mobileFindings = result.findings.filter(f => f.category === 'mobile_seo');
    const scale = pagesCount || 1;

    let usabilityScore = 100;
    let performanceScore = 100;
    let responsiveScore = 100;
    let mobileIndexingScore = 100;

    for (const f of mobileFindings) {
      if (f.ruleId === 'mobile-usability') {
        if (f.id.includes('missing-viewport')) usabilityScore -= 40 / scale;
        if (f.id.includes('invalid-viewport')) usabilityScore -= 20 / scale;
        if (f.id.includes('fixed-width')) usabilityScore -= 20 / scale;
        if (f.id.includes('poor-navigation')) usabilityScore -= 15 / scale;
        if (f.id.includes('tap-target')) usabilityScore -= 15 / scale;
      } else if (f.ruleId === 'mobile-performance') {
        if (f.id.includes('poor-lcp')) performanceScore -= 40 / scale;
        if (f.id.includes('needs-improvement-lcp')) performanceScore -= 20 / scale;
        if (f.id.includes('poor-cls')) performanceScore -= 30 / scale;
        if (f.id.includes('needs-improvement-cls')) performanceScore -= 15 / scale;
        if (f.id.includes('heavy-js')) performanceScore -= 20 / scale;
        if (f.id.includes('excessive-js')) performanceScore -= 40 / scale;
        if (f.id.includes('heavy-images')) performanceScore -= 15 / scale;
        if (f.id.includes('render-blocking')) performanceScore -= 15 / scale;
      } else if (f.ruleId === 'mobile-responsive') {
        if (f.id.includes('missing-media-queries')) responsiveScore -= 50 / scale;
        if (f.id.includes('fixed-layout')) responsiveScore -= 25 / scale;
        if (f.id.includes('missing-breakpoints')) responsiveScore -= 25 / scale;
      } else if (f.ruleId === 'mobile-indexing') {
        if (f.id.includes('hidden-content')) mobileIndexingScore -= 40 / scale;
        if (f.id.includes('missing-schema')) mobileIndexingScore -= 45 / scale;
        if (f.id.includes('missing-canonical')) mobileIndexingScore -= 40 / scale;
        if (f.id.includes('canonical-mismatch')) mobileIndexingScore -= 20 / scale;
      }
    }

    usabilityScore = Math.max(0, Math.min(100, Math.round(usabilityScore)));
    performanceScore = Math.max(0, Math.min(100, Math.round(performanceScore)));
    responsiveScore = Math.max(0, Math.min(100, Math.round(responsiveScore)));
    mobileIndexingScore = Math.max(0, Math.min(100, Math.round(mobileIndexingScore)));

    const printMobileBreakdownRow = (label: string, subScore: number, ruleId: string) => {
      console.log(`  • ${label.padEnd(26)} ${pc.bold(subScore)} / 100`);
      if (subScore < 100) {
        const ruleFindings = mobileFindings.filter(f => f.ruleId === ruleId);
        const uniqueMessages = Array.from(new Set(ruleFindings.map(f => f.message)));
        for (const msg of uniqueMessages) {
          const arrowColor = subScore < 50 ? pc.red : pc.yellow;
          console.log(`    ${arrowColor('→')} ${pc.gray(msg)}`);
        }
      }
    };

    console.log(pc.bold(pc.cyan('📱 MOBILE SEO SCORE BREAKDOWN:')));
    printMobileBreakdownRow('Mobile Usability (35%):', usabilityScore, 'mobile-usability');
    printMobileBreakdownRow('Mobile Performance (35%):', performanceScore, 'mobile-performance');
    printMobileBreakdownRow('Responsive Design (20%):', responsiveScore, 'mobile-responsive');
    printMobileBreakdownRow('Indexing Readiness (10%):', mobileIndexingScore, 'mobile-indexing');
    console.log();

    const filledBlocks = Math.round(score / 5);
    const emptyBlocks = 20 - filledBlocks;
    const bar = scoreColor('█'.repeat(filledBlocks)) + pc.gray('░'.repeat(emptyBlocks));

    console.log(pc.bold(`OVERALL SEO SCORE: ${scoreColor(score)} / 100 ${scoreColor(badge)}`));
    console.log(`[${bar}]\n`);

    console.log(pc.gray('Report completed successfully.\n'));
  }
}
