import fs from 'fs/promises';
import path from 'path';
import type { JsImpactReport, JsImpactReporter } from '@seocore/sdk';

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>JavaScript SEO Impact Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; max-width: 1000px; margin: 0 auto; background: #f8fafc; color: #1e293b; }
    h1, h2, h3 { color: #0f172a; }
    h1 { margin-bottom: 0.5rem; }
    .container { background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); padding: 2rem; }
    .score-card { display: flex; gap: 2rem; margin: 2rem 0; }
    .score-item { text-align: center; }
    .score-number { font-size: 2.5rem; font-weight: bold; }
    .score-good { color: #10b981; }
    .score-mid { color: #f59e0b; }
    .score-bad { color: #ef4444; }
    .issues { margin: 2rem 0; }
    .issue { border-left: 4px solid #e5e7eb; padding: 1rem; margin: 1rem 0; background: #fafafa; border-radius: 0 8px 8px 0; }
    .issue.critical { border-color: #ef4444; background: #fef2f2; }
    .issue.high { border-color: #f59e0b; background: #fffbeb; }
    .issue.medium { border-color: #3b82f6; background: #eff6ff; }
    .issue.low { border-color: #6b7280; background: #f3f4f6; }
    .issue-title { font-weight: 600; margin-bottom: 0.5rem; }
    .issue-meta { font-size: 0.875rem; color: #64748b; margin-bottom: 0.5rem; }
    .recommendations { margin: 2rem 0; }
    .rec { padding: 1rem; border: 1px solid #e5e7eb; border-radius: 8px; margin: 1rem 0; background: #f8fafc; }
    .rec-priority { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; background: #0f172a; color: white; font-size: 0.75rem; margin-right: 0.5rem; }
    .rec-title { font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>JavaScript SEO Impact Report</h1>
    <p>URL: <a href="{{url}}">{{url}}</a></p>
    <p>Generated: {{checkedAt}}</p>

    <div class="score-card">
      <div class="score-item">
        <div class="score-number {{overallScoreClass}}">{{score.overall}}</div>
        <div>Overall Score</div>
      </div>
      <div class="score-item">
        <div class="score-number {{indexabilityScoreClass}}">{{score.indexability}}</div>
        <div>Indexability</div>
      </div>
      <div class="score-item">
        <div class="score-number {{contentParityScoreClass}}">{{score.contentParity}}</div>
        <div>Content Parity</div>
      </div>
      <div class="score-item">
        <div class="score-number {{metadataParityScoreClass}}">{{score.metadataParity}}</div>
        <div>Metadata Parity</div>
      </div>
    </div>

    <h2>Render Strategy</h2>
    <ul>
      <li>Strategy: {{renderStrategy}}</li>
      <li>Framework: {{framework}}</li>
      <li>Timings: Raw Fetch {{timings.rawFetchMs}}ms, Render {{timings.renderTotalMs}}ms</li>
      <li>Byte Delta: Raw {{bytes.raw}}B → Rendered {{bytes.rendered}}B ({{bytes.deltaPct}}%)</li>
    </ul>

    <h2>Issues ({{summary.critical}} critical, {{summary.high}} high, {{summary.medium}} medium, {{summary.low}} low)</h2>
    <div class="issues">
      {{issuesHtml}}
    </div>

    <h2>Recommendations</h2>
    <div class="recommendations">
      {{recsHtml}}
    </div>
  </div>
</body>
</html>
`;

function getScoreClass(score: number): string {
  if (score >= 90) return 'score-good';
  if (score >= 50) return 'score-mid';
  return 'score-bad';
}

export class JsImpactHtmlReporter implements JsImpactReporter {
  report(report: JsImpactReport): void {
    console.error('HTML reporter does not support console output. Use write() instead.');
  }

  async write(report: JsImpactReport, outputPath: string): Promise<void> {
    const issuesHtml = report.diffs.map(diff => {
      const evidence = diff.evidence.map(e => `<li>${e}</li>`).join('');
      const rawValue = diff.raw != null
        ? (typeof diff.raw === 'number' ? diff.raw : (Array.isArray(diff.raw) ? diff.raw.join(', ') : diff.raw))
        : '(none)';
      const renderedValue = diff.rendered != null
        ? (typeof diff.rendered === 'number' ? diff.rendered : (Array.isArray(diff.rendered) ? diff.rendered.join(', ') : diff.rendered))
        : '(none)';
      return `
        <div class="issue ${diff.severity}">
          <div class="issue-title">${diff.title}</div>
          <div class="issue-meta">Severity: ${diff.severity.toUpperCase()} · Aspect: ${diff.aspect}</div>
          <p>${diff.description}</p>
          <p><strong>Raw:</strong> ${rawValue}</p>
          <p><strong>Rendered:</strong> ${renderedValue}</p>
          ${diff.delta != null ? `<p><strong>Delta:</strong> ${diff.delta}</p>` : ''}
          <p><strong>Evidence:</strong></p>
          <ul>${evidence}</ul>
        </div>
      `;
    }).join('');

    const recsHtml = report.recommendations.map(rec => `
      <div class="rec">
        <div class="rec-priority">P${rec.priority}</div>
        <div class="rec-title">${rec.title}</div>
        <p>${rec.rationale}</p>
        <p><strong>Action:</strong> ${rec.action}</p>
        ${rec.frameworkSpecific ? `<p><strong>Framework-specific:</strong> ${rec.frameworkSpecific}</p>` : ''}
      </div>
    `).join('');

    const html = HTML_TEMPLATE
      .replaceAll('{{url}}', report.url)
      .replaceAll('{{checkedAt}}', report.checkedAt)
      .replaceAll('{{renderStrategy}}', report.render.strategy.toUpperCase())
      .replaceAll('{{framework}}', report.render.framework || 'Not detected')
      .replaceAll('{{timings.rawFetchMs}}', report.render.timings.rawFetchMs.toString())
      .replaceAll('{{timings.renderTotalMs}}', report.render.timings.renderTotalMs.toString())
      .replaceAll('{{bytes.raw}}', report.render.bytes.raw.toString())
      .replaceAll('{{bytes.rendered}}', report.render.bytes.rendered.toString())
      .replaceAll('{{bytes.deltaPct}}', report.render.bytes.deltaPct.toFixed(1))
      .replaceAll('{{summary.critical}}', report.summary.critical.toString())
      .replaceAll('{{summary.high}}', report.summary.high.toString())
      .replaceAll('{{summary.medium}}', report.summary.medium.toString())
      .replaceAll('{{summary.low}}', report.summary.low.toString())
      .replaceAll('{{score.overall}}', report.score.overall.toString())
      .replaceAll('{{score.indexability}}', report.score.indexability.toString())
      .replaceAll('{{score.contentParity}}', report.score.contentParity.toString())
      .replaceAll('{{score.metadataParity}}', report.score.metadataParity.toString())
      .replaceAll('{{overallScoreClass}}', getScoreClass(report.score.overall))
      .replaceAll('{{indexabilityScoreClass}}', getScoreClass(report.score.indexability))
      .replaceAll('{{contentParityScoreClass}}', getScoreClass(report.score.contentParity))
      .replaceAll('{{metadataParityScoreClass}}', getScoreClass(report.score.metadataParity))
      .replaceAll('{{issuesHtml}}', issuesHtml)
      .replaceAll('{{recsHtml}}', recsHtml);

    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, html, 'utf8');
  }
}
