import { TechnologySummary, DetectedTechnology } from '@seocore/analyzers';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';

interface ReporterOptions {
  verbose?: boolean;
  format?: 'terminal' | 'json' | 'html';
  output?: string;
}

interface ReporterSection {
  label: string;
  techs: DetectedTechnology[];
  emptyMessage: string;
}

export class TechnologyReporter {
  static report(summary: TechnologySummary, url: string, options: ReporterOptions) {
    if (options.format === 'json') {
      this.reportJson(summary, url, options.output);
    } else if (options.format === 'html') {
      this.reportHtml(summary, url, options.output);
    } else {
      this.reportTerminal(summary, url, options.verbose);
    }
  }

  private static getConfidenceColor(confidence: number) {
    return confidence >= 80 ? pc.green : pc.yellow;
  }

  private static getConfidenceLabel(tech: DetectedTechnology) {
    return tech.confidenceLevel === 'high' ? 'high confidence' : 'medium confidence';
  }

  private static renderTechHtml(tech: DetectedTechnology, getConfidenceClass: (confidence: number) => string) {
    const evidenceHtml = tech.evidence.map(evidence => `<div class="evidence">- ${evidence}</div>`).join('');
    const confidenceClass = getConfidenceClass(tech.confidence);
    const confidenceLabel = this.getConfidenceLabel(tech);
    return `<li class="tech-item">${tech.name} <span class="confidence ${confidenceClass}">(${confidenceLabel})</span>${evidenceHtml}</li>`;
  }

  private static renderSectionHtml(section: ReporterSection, getConfidenceClass: (confidence: number) => string) {
    if (section.techs.length === 0) {
      return `<h3>${section.label}</h3><p class="undetectable">${section.emptyMessage}</p>`;
    }

    const itemsHtml = section.techs.map(tech => this.renderTechHtml(tech, getConfidenceClass)).join('');
    return `<h3>${section.label}</h3><ul>${itemsHtml}</ul>`;
  }

  private static getSections(summary: TechnologySummary): ReporterSection[] {
    const cdnAndEdge = [...summary.hosting, ...summary.cdn].sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      return left.name.localeCompare(right.name);
    });

    return [
      {
        label: 'Frontend Framework / App Stack',
        techs: summary.frontendFramework,
        emptyMessage: 'No framework confidently detected from public HTML/assets.'
      },
      {
        label: 'Rendering Strategy',
        techs: summary.renderingStrategy,
        emptyMessage: 'Rendering mode unclear from public HTML.'
      },
      {
        label: 'CDN / Edge Network',
        techs: cdnAndEdge,
        emptyMessage: 'No CDN or edge provider confidently detected.'
      },
      {
        label: 'Backend Signals (ONLY if detectable)',
        techs: summary.backend,
        emptyMessage: 'No backend signals directly exposed by public headers/HTML.'
      },
      {
        label: 'CMS / Headless CMS',
        techs: summary.cms,
        emptyMessage: 'No CMS or headless CMS confidently detected.'
      },
      {
        label: 'Analytics / Tracking Tools',
        techs: summary.analytics,
        emptyMessage: 'No analytics or tracking tools confidently detected.'
      },
      {
        label: 'UI Libraries / Styling Systems',
        techs: summary.uiLibraries,
        emptyMessage: 'No UI library or styling system confidently detected.'
      },
      {
        label: 'Build Tools / Bundlers',
        techs: summary.buildTools,
        emptyMessage: 'No build tool or bundler confidently detected from shipped runtime.'
      },
      {
        label: 'Fonts / Asset Delivery',
        techs: summary.fonts,
        emptyMessage: 'No font provider or asset delivery service confidently detected.'
      },
      {
        label: 'Third-party Services',
        techs: summary.thirdPartyServices,
        emptyMessage: 'No third-party service confidently detected.'
      }
    ];
  }

  private static reportTerminal(summary: TechnologySummary, url: string, verbose?: boolean) {
    const urlLine = `URL: ${url}`;
    console.log(`\n${pc.bold('TECHNOLOGY DETECTION REPORT')}`);
    console.log(`${pc.dim(urlLine)}\n`);

    console.log(pc.bold('TECH STACK SUMMARY:'));
    for (const section of this.getSections(summary)) {
      console.log(`\n  ${section.label}:`);
      if (section.techs.length === 0) {
        console.log(`    ${pc.dim(section.emptyMessage)}`);
        continue;
      }

      for (const tech of section.techs) {
        const color = this.getConfidenceColor(tech.confidence);
        let techLine = `    • ${tech.name} (${color(this.getConfidenceLabel(tech))})`;
        if (verbose) {
          const confidenceScore = `[${tech.confidence}/100]`;
          techLine += ` ${pc.dim(confidenceScore)}`;
          for (const evidence of tech.evidence) {
            techLine += `\n      - ${evidence}`;
          }
        }
        console.log(techLine);
      }
    }

    if (summary.undetectable.length > 0) {
      console.log(`\n${pc.bold('DETECTION NOTES:')}`);
      for (const note of summary.undetectable) {
        console.log(`  - ${pc.dim(note)}`);
      }
    }

    console.log(`\n${pc.dim('Detection scope: public HTML, shipped assets, inline scripts, and response headers only.')}\n`);
  }

  private static reportJson(summary: TechnologySummary, url: string, output?: string) {
    const result = {
      url,
      checkedAt: new Date().toISOString(),
      summary
    };
    const jsonStr = JSON.stringify(result, null, 2);
    if (output) {
      fs.writeFileSync(path.resolve(output), jsonStr, 'utf8');
      console.log(pc.green(`\n✓ JSON report saved to ${pc.bold(output)}`));
    } else {
      console.log(jsonStr);
    }
  }

  private static reportHtml(summary: TechnologySummary, url: string, output?: string) {
    const getConfidenceClass = (confidence: number) => {
      return confidence >= 80 ? 'high' : 'medium';
    };
    const checkedAt = new Date().toLocaleString();
    const sectionsHtml = this.getSections(summary)
      .map(section => this.renderSectionHtml(section, getConfidenceClass))
      .join('');
    const noteItemsHtml = summary.undetectable.map(note => `<li>${note}</li>`).join('');
    const notesHtml = summary.undetectable.length > 0
      ? `<div class="undetectable"><strong>Detection Notes:</strong><ul>${noteItemsHtml}</ul></div>`
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Technology Detection - ${url}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1, h2, h3 { color: #1a202c; }
    .tech-item { margin: 0.5rem 0; }
    .confidence { font-weight: bold; }
    .confidence.high { color: #2f855a; }
    .confidence.medium { color: #d69e2e; }
    .confidence.low { color: #c53030; }
    .undetectable { color: #718096; }
    .evidence { font-size: 0.875rem; color: #4a5568; margin-left: 1.5rem; }
  </style>
</head>
<body>
  <h1>Technology Detection Report</h1>
  <p><strong>URL:</strong> ${url}</p>
  <p><strong>Checked:</strong> ${checkedAt}</p>
  
  <h2>Tech Stack Summary</h2>
  ${sectionsHtml}
  ${notesHtml}
</body>
</html>
    `.trim();
    const outputPath = output || './seocore-technology-report.html';
    fs.writeFileSync(path.resolve(outputPath), html, 'utf8');
    console.log(pc.green(`\n✓ HTML report saved to ${pc.bold(outputPath)}`));
  }
}
