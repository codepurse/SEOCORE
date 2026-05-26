import pc from 'picocolors';
import type { JsImpactReport, JsImpactReporter } from '@seocore/sdk';

export class JsImpactTerminalReporter implements JsImpactReporter {
  report(report: JsImpactReport): void {
    console.log('\n' + pc.bold(pc.bgCyan(pc.black('  JAVASCRIPT SEO IMPACT REPORT  '))));
    console.log(pc.gray('Target URL:') + ' ' + pc.cyan(pc.bold(report.url)));
    console.log(pc.gray('Timestamp:') + ' ' + report.checkedAt + '\n');

    // Render strategy
    console.log(pc.bold('RENDER STRATEGY:'));
    console.log(`  Strategy: ${pc.yellow(report.render.strategy.toUpperCase())}`);
    if (report.render.framework) {
      console.log(`  Detected Framework: ${pc.cyan(report.render.framework)}`);
    }
    console.log(`  Timings: Raw Fetch ${report.render.timings.rawFetchMs}ms, Render ${report.render.timings.renderTotalMs}ms`);
    console.log(`  Byte Delta: Raw ${report.render.bytes.raw}B → Rendered ${report.render.bytes.rendered}B (${report.render.bytes.deltaPct.toFixed(1)}%)`);
    if (report.render.consoleMessages.length > 0) {
    const errors = report.render.consoleMessages.filter((m: { level: string }) => m.level === 'error' || m.level === 'severe').length;
    if (errors > 0) {
      console.log(pc.red(`  ⚠️  ${errors} JavaScript errors during render`));
    }
  }
    console.log();

    // Summary counts
    const { critical, high, medium, low } = report.summary;
    console.log(pc.bold('ISSUE SUMMARY:'));
    console.log(
      `  Critical: ${critical > 0 ? pc.red(critical) : '0'} | ` +
      `High: ${high > 0 ? pc.yellow(high) : '0'} | ` +
      `Medium: ${medium > 0 ? pc.blue(medium) : '0'} | ` +
      `Low: ${low > 0 ? pc.gray(low) : '0'}`
    );
    console.log();

    // Diffs list
    if (report.diffs.length > 0) {
      console.log(pc.bold('DETAILED ISSUES:'));
      for (const diff of report.diffs) {
        const sevColor =
          diff.severity === 'critical' ? pc.red :
          diff.severity === 'high' ? pc.yellow :
          diff.severity === 'medium' ? pc.blue : pc.gray;
        console.log(`\n  ${pc.bold(diff.title)} [${sevColor(diff.severity.toUpperCase())}]`);
        console.log(`    Aspect: ${diff.aspect}`);
        console.log(`    Description: ${diff.description}`);
        if (diff.raw !== undefined) {
          console.log(`    Raw: ${typeof diff.raw === 'number' ? diff.raw : (Array.isArray(diff.raw) ? diff.raw.join(', ') : diff.raw)}`);
        }
        if (diff.rendered !== undefined) {
          console.log(`    Rendered: ${typeof diff.rendered === 'number' ? diff.rendered : (Array.isArray(diff.rendered) ? diff.rendered.join(', ') : diff.rendered)}`);
        }
        if (diff.delta !== undefined) {
          console.log(`    Delta: ${diff.delta}`);
        }
        console.log('    Evidence:');
        for (const e of diff.evidence.slice(0, 3)) {
          console.log(`      - ${e}`);
        }
      }
      console.log();
    }

    // Score
    const scoreColor =
      report.score.overall >= 90 ? pc.green :
      report.score.overall >= 50 ? pc.yellow : pc.red;
    console.log(pc.bold('OVERALL SCORE:'));
    console.log(`  ${scoreColor(report.score.overall)} / 100`);
    console.log(`  Indexability: ${report.score.indexability}`);
    console.log(`  Content Parity: ${report.score.contentParity}`);
    console.log(`  Metadata Parity: ${report.score.metadataParity}`);
    console.log(`  Structured Data Parity: ${report.score.structuredDataParity}`);
    console.log(`  Crawlability: ${report.score.crawlability}`);
    console.log();

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log(pc.bold(pc.green('RECOMMENDATIONS:')));
      for (const rec of report.recommendations.slice(0, 5)) {
        console.log(`\n  ${pc.bold(rec.title)} (Priority ${rec.priority})`);
        console.log(`    Rationale: ${rec.rationale}`);
        console.log(`    Action: ${pc.green(rec.action)}`);
        if (rec.frameworkSpecific) {
          console.log(`    Framework-specific: ${rec.frameworkSpecific}`);
        }
      }
    }
    console.log();
  }

  async write(report: JsImpactReport, outputPath: string): Promise<void> {
    throw new Error('Terminal reporter does not support write to file. Use JSON, HTML, or Markdown.');
  }
}
