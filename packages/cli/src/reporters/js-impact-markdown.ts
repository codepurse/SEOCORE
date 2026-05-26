import fs from 'fs/promises';
import path from 'path';
import type { JsImpactReport, JsImpactReporter } from '@seocore/sdk';

export class JsImpactMarkdownReporter implements JsImpactReporter {
  report(report: JsImpactReport): void {
    console.error('Markdown reporter does not support console output. Use write() instead.');
  }

  async write(report: JsImpactReport, outputPath: string): Promise<void> {
    let md = `# JavaScript SEO Impact Report\n\n`;
    md += `**URL:** ${report.url}\n\n`;
    md += `**Generated:** ${report.checkedAt}\n\n`;

    // Score
    md += `## Overall Score: ${report.score.overall}/100\n\n`;
    md += `- Indexability: ${report.score.indexability}\n`;
    md += `- Content Parity: ${report.score.contentParity}\n`;
    md += `- Metadata Parity: ${report.score.metadataParity}\n`;
    md += `- Structured Data Parity: ${report.score.structuredDataParity}\n`;
    md += `- Crawlability: ${report.score.crawlability}\n\n`;

    // Render strategy
    md += `## Render Strategy\n\n`;
    md += `- Strategy: ${report.render.strategy.toUpperCase()}\n`;
    if (report.render.framework) {
      md += `- Detected Framework: ${report.render.framework}\n`;
    }
    md += `- Timings: Raw Fetch ${report.render.timings.rawFetchMs}ms, Render ${report.render.timings.renderTotalMs}ms\n`;
    md += `- Byte Delta: Raw ${report.render.bytes.raw}B → Rendered ${report.render.bytes.rendered}B (${report.render.bytes.deltaPct.toFixed(1)}%)\n\n`;

    // Summary counts
    md += `## Issues\n\n`;
    md += `- Critical: ${report.summary.critical}\n`;
    md += `- High: ${report.summary.high}\n`;
    md += `- Medium: ${report.summary.medium}\n`;
    md += `- Low: ${report.summary.low}\n\n`;

    // Diffs
    for (const diff of report.diffs) {
      md += `### ${diff.title} [${diff.severity.toUpperCase()}]\n\n`;
      md += `**Aspect:** ${diff.aspect}\n\n`;
      md += `${diff.description}\n\n`;
      if (diff.raw !== undefined) {
        md += `**Raw:** ${typeof diff.raw === 'number' ? diff.raw : (Array.isArray(diff.raw) ? diff.raw.join(', ') : diff.raw)}\n\n`;
      }
      if (diff.rendered !== undefined) {
        md += `**Rendered:** ${typeof diff.rendered === 'number' ? diff.rendered : (Array.isArray(diff.rendered) ? diff.rendered.join(', ') : diff.rendered)}\n\n`;
      }
      if (diff.delta !== undefined) {
        md += `**Delta:** ${diff.delta}\n\n`;
      }
      md += `**Evidence:**\n\n`;
      for (const e of diff.evidence) {
        md += `- ${e}\n`;
      }
      md += '\n';
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      md += `## Recommendations\n\n`;
      for (const rec of report.recommendations) {
        md += `### ${rec.title} (Priority ${rec.priority})\n\n`;
        md += `**Rationale:** ${rec.rationale}\n\n`;
        md += `**Action:** ${rec.action}\n\n`;
        if (rec.frameworkSpecific) {
          md += `**Framework-specific:** ${rec.frameworkSpecific}\n\n`;
        }
      }
    }

    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, md, 'utf8');
  }
}
