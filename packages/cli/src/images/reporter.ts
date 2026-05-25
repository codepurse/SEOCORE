import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';
import { ImageAuditResult, ImageRecord, ImageFinding } from './types.js';

export class ImageReporter {
  static exportJson(result: ImageAuditResult, outputPath: string): string {
    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absolutePath, JSON.stringify(result, null, 2), 'utf8');
    return absolutePath;
  }

  static reportTerminal(result: ImageAuditResult): void {
    console.log();
    console.log(pc.cyan('='.repeat(80)));
    console.log(pc.cyan(pc.bold('                     IMAGE AUDIT SUMMARY REPORT')));
    console.log(pc.cyan('='.repeat(80)));
    console.log(`Target URL: ${pc.bold(result.url)}`);
    console.log(`Crawled At: ${result.crawledAt}`);
    console.log(`Mode:       ${result.mode.toUpperCase()} MODE`);
    console.log(`Playwright: ${result.playwright ? pc.green('ENABLED') : pc.gray('DISABLED')}`);
    console.log();

    // Overall Score
    const score = result.summary.score;
    let scoreColor = pc.green;
    if (score < 60) scoreColor = pc.red;
    else if (score < 80) scoreColor = pc.yellow;

    console.log(pc.bold('📊 AUDIT METRICS:'));
    console.log(`  • Overall Image Score:   ${scoreColor(`${score}/100`)}`);
    console.log(`  • Discovered Images:     ${pc.bold(result.summary.totalImages)}`);
    console.log(`  • Total Image Payload:   ${pc.bold((result.summary.totalBytes / 1024 / 1024).toFixed(2))} MB`);
    console.log(`  • Average Image Size:    ${pc.bold((result.summary.avgBytes / 1024).toFixed(1))} KB`);
    console.log();

    // Budget Violations
    console.log(pc.bold('🚧 BUDGET STATUS:'));
    const mobilePassed = result.summary.budgets.mobileBudgetPassed;
    console.log(`  • Mobile Payload Budget (1.5MB): ${mobilePassed ? pc.green('PASSED') : pc.red('FAILED')} (${(result.summary.totalBytes / 1024 / 1024).toFixed(2)}MB)`);
    
    const lcpImage = result.images.find(img => img.isLcp);
    if (lcpImage) {
      const lcpPassed = result.summary.budgets.lcpBudgetPassed;
      console.log(`  • LCP Image Weight (100KB):     ${lcpPassed ? pc.green('PASSED') : pc.red('FAILED')} (${(result.summary.budgets.lcpImageWeightBytes / 1024).toFixed(1)}KB)`);
    } else {
      console.log(`  • LCP Image Weight (100KB):     ${pc.gray('NO LCP IMAGE FOUND')}`);
    }
    console.log();

    // Top Findings
    if (result.findings.length > 0) {
      console.log(pc.bold('⚠️  TOP FINDINGS & ISSUES:'));
      // Sort findings by severity priority
      const severityPriority: Record<string, number> = { critical: 4, error: 3, warning: 2, info: 1 };
      const sortedFindings = [...result.findings].sort((a, b) => 
        (severityPriority[b.severity] || 0) - (severityPriority[a.severity] || 0)
      );

      sortedFindings.slice(0, 5).forEach((finding, idx) => {
        let sevIcon = '🔵';
        let sevColor = pc.blue;
        if (finding.severity === 'critical') {
          sevIcon = '🔴';
          sevColor = pc.red;
        } else if (finding.severity === 'error') {
          sevIcon = '🟠';
          sevColor = pc.red;
        } else if (finding.severity === 'warning') {
          sevIcon = '🟡';
          sevColor = pc.yellow;
        }

        console.log(`  ${idx + 1}. ${sevIcon} ${pc.bold(sevColor(finding.severity.toUpperCase()))} - [${finding.ruleId}]`);
        console.log(`     ${pc.white(finding.message)}`);
        console.log(`     ${pc.gray(`URL: ${finding.imageSrc.substring(0, 90)}${finding.imageSrc.length > 90 ? '...' : ''}`)}`);
        if (finding.evidence) {
          console.log(`     ${pc.gray(`Evidence: ${finding.evidence}`)}`);
        }
        console.log(`     ${pc.green(`Rec: ${finding.recommendation}`)}`);
        console.log();
      });

      if (result.findings.length > 5) {
        console.log(`  ... and ${result.findings.length - 5} more findings. Export to HTML or JSON for the full report.`);
      }
    } else {
      console.log(pc.green('🎉  Perfect score! No image optimization issues found.'));
    }
    console.log();
  }

  static exportHtml(result: ImageAuditResult, outputPath: string): string {
    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Helper functions for HTML rendering
    const scoreColorClass = (score: number) => {
      if (score >= 80) return 'score-good';
      if (score >= 60) return 'score-average';
      return 'score-poor';
    };

    const severityBadge = (severity: string) => {
      const uSev = severity.toUpperCase();
      return `<span class="badge badge-${severity}">${uSev}</span>`;
    };

    // Calculate stats
    const mobileBudgetBytes = 1.5 * 1024 * 1024;
    const totalImages = result.summary.totalImages;
    const totalBytes = result.summary.totalBytes;
    const avgBytes = result.summary.avgBytes;
    const score = result.summary.score;

    const modernCount = result.images.filter(img => {
      const f = img.decodedFormat?.toLowerCase() || '';
      return f === 'webp' || f === 'avif' || f === 'svg';
    }).length;
    const modernPercent = totalImages > 0 ? Math.round((modernCount / totalImages) * 100) : 0;

    const altCount = result.images.filter(img => img.alt !== undefined && img.alt.trim() !== '').length;
    const altPercent = totalImages > 0 ? Math.round((altCount / totalImages) * 100) : 0;

    const dimsCount = result.images.filter(img => img.width !== undefined && img.height !== undefined).length;
    const dimsPercent = totalImages > 0 ? Math.round((dimsCount / totalImages) * 100) : 0;

    // Worst offenders (Top 10 sorted by bytes)
    const worstOffenders = [...result.images]
      .filter(img => img.bytes !== undefined)
      .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
      .slice(0, 10);

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEOCORE - Image Audit Report</title>
  <style>
    :root {
      --primary: #1e293b;
      --primary-light: #f8fafc;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --info: #3b82f6;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: var(--text);
      background-color: #f1f5f9;
      line-height: 1.5;
    }
    header {
      background-color: var(--primary);
      color: white;
      padding: 2rem;
      border-bottom: 4px solid var(--success);
    }
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    .header-flex {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.5rem;
    }
    .header-details h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
    }
    .header-details p {
      margin: 0.5rem 0 0 0;
      color: var(--text-muted);
    }
    .header-meta {
      font-size: 0.9rem;
      background: rgba(255,255,255,0.1);
      padding: 0.75rem 1.25rem;
      border-radius: 6px;
    }
    .header-meta div {
      margin: 0.25rem 0;
    }
    .score-circle {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: #334155;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 2rem;
      font-weight: 800;
      border: 6px solid var(--border);
    }
    .score-good { border-color: var(--success); color: var(--success); }
    .score-average { border-color: var(--warning); color: var(--warning); }
    .score-poor { border-color: var(--error); color: var(--error); }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: white;
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 0;
      margin-bottom: 0.5rem;
    }
    .card-value {
      font-size: 2rem;
      font-weight: 800;
      margin: 0;
    }
    .card-subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      margin-bottom: 0;
    }
    .progress-bar-container {
      background: #e2e8f0;
      border-radius: 4px;
      height: 8px;
      width: 100%;
      margin-top: 0.5rem;
    }
    .progress-bar {
      border-radius: 4px;
      height: 100%;
      background-color: var(--success);
    }
    .progress-bar.warning { background-color: var(--warning); }
    .progress-bar.error { background-color: var(--error); }

    .tabs {
      display: flex;
      border-bottom: 2px solid var(--border);
      margin-bottom: 1.5rem;
      gap: 1rem;
    }
    .tab {
      padding: 0.75rem 1rem;
      cursor: pointer;
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
    }
    .tab.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      margin-bottom: 2rem;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: var(--primary-light);
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    tr:last-child td {
      border-bottom: none;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 800;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-critical { background: #fef2f2; color: var(--error); border: 1px solid #fee2e2; }
    .badge-error { background: #fff7ed; color: var(--warning); border: 1px solid #ffedd5; }
    .badge-warning { background: #fffbeb; color: var(--warning); border: 1px solid #fef3c7; }
    .badge-info { background: #eff6ff; color: var(--info); border: 1px solid #dbeafe; }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1.5rem;
    }
    .image-card {
      background: white;
      border-radius: 8px;
      border: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .image-preview-box {
      height: 140px;
      background: #f8fafc;
      display: flex;
      justify-content: center;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding: 0.5rem;
    }
    .image-preview-box img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 4px;
    }
    .image-card-body {
      padding: 1rem;
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .image-card-title {
      font-size: 0.85rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
      word-break: break-all;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .image-card-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .image-card-score {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }
    .image-score-badge {
      font-weight: 800;
      font-size: 0.9rem;
    }
    .image-score-badge.good { color: var(--success); }
    .image-score-badge.average { color: var(--warning); }
    .image-score-badge.poor { color: var(--error); }
  </style>
</head>
<body>
  <header>
    <div class="container header-flex">
      <div class="header-details">
        <h1>SEOCORE — Image Audit Report</h1>
        <p>Comprehensive image weight, format, delivery, LCP, and structural analysis</p>
      </div>
      <div style="display: flex; align-items: center; gap: 1.5rem;">
        <div class="header-meta">
          <div><strong>Target:</strong> ${result.url}</div>
          <div><strong>Date:</strong> ${result.crawledAt}</div>
          <div><strong>Mode:</strong> ${result.mode.toUpperCase()} MODE</div>
        </div>
        <div class="score-circle ${score >= 80 ? 'score-good' : score >= 60 ? 'score-average' : 'score-poor'}">
          ${score}
        </div>
      </div>
    </div>
  </header>

  <main class="container">
    <!-- Top summary cards -->
    <div class="grid">
      <div class="card">
        <p class="card-title">Discovered Images</p>
        <p class="card-value">${totalImages}</p>
        <p class="card-subtitle">Unique absolute assets found</p>
      </div>
      <div class="card">
        <p class="card-title">Total Payload Weight</p>
        <p class="card-value">${(totalBytes / 1024 / 1024).toFixed(2)} MB</p>
        <div class="progress-bar-container">
          <div class="progress-bar ${totalBytes > mobileBudgetBytes ? 'error' : 'success'}" style="width: ${Math.min(100, (totalBytes / mobileBudgetBytes) * 100)}%"></div>
        </div>
        <p class="card-subtitle">Budget: 1.50 MB | ${totalBytes <= mobileBudgetBytes ? 'Passed' : 'Exceeded'}</p>
      </div>
      <div class="card">
        <p class="card-title">Modern Formats (WebP/AVIF)</p>
        <p class="card-value">${modernPercent}%</p>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${modernPercent}%"></div>
        </div>
        <p class="card-subtitle">${modernCount} of ${totalImages} images optimized</p>
      </div>
      <div class="card">
        <p class="card-title">Accessibility & Dimensions</p>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
          <div>
            <span style="font-size: 1.25rem; font-weight: 800; color: var(--success);">${altPercent}%</span>
            <div class="card-subtitle">Alt Text</div>
          </div>
          <div style="border-left: 1px solid var(--border); padding-left: 1rem;">
            <span style="font-size: 1.25rem; font-weight: 800; color: var(--success);">${dimsPercent}%</span>
            <div class="card-subtitle">Dimensions</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Budget Violations Section -->
    ${result.budgetViolations.length > 0 ? `
    <h2>🚧 Budget Violations</h2>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Budget Limit</th>
          <th>Actual Value</th>
          <th>Severity</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        ${result.budgetViolations.map(bv => `
        <tr>
          <td><strong>${bv.metric.replace(/-/g, ' ').toUpperCase()}</strong></td>
          <td>${bv.limit}</td>
          <td class="text-danger">${bv.actual}</td>
          <td>${severityBadge(bv.severity)}</td>
          <td>${bv.message}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <!-- Findings Section -->
    <h2>🔍 Audit Findings (${result.findings.length})</h2>
    ${result.findings.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Rule</th>
          <th>Image Reference</th>
          <th>Description</th>
          <th>Remediation</th>
        </tr>
      </thead>
      <tbody>
        ${result.findings.map(f => `
        <tr>
          <td>${severityBadge(f.severity)}</td>
          <td><strong>${f.ruleId}</strong></td>
          <td><a href="${f.imageSrc}" target="_blank" style="word-break: break-all; font-size: 0.85rem; color: var(--info);">${f.imageSrc}</a></td>
          <td>${f.message} ${f.evidence ? `<br><small style="color: var(--text-muted)">Evidence: ${f.evidence}</small>` : ''}</td>
          <td style="color: var(--success); font-size: 0.9rem;">${f.recommendation}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : '<p style="color: var(--success); font-weight: 700;">🎉 No findings! All images conform perfectly to best practices.</p>'}

    <!-- Worst Offenders Section -->
    <h2>📉 Heavy Asset Standouts (Top 10 Heavyweight Images)</h2>
    <table>
      <thead>
        <tr>
          <th>Thumbnail</th>
          <th>Image URL</th>
          <th>File Size</th>
          <th>Format</th>
          <th>Dimensions (Intrinsic)</th>
          <th>Pages Discovered On</th>
        </tr>
      </thead>
      <tbody>
        ${worstOffenders.map(img => `
        <tr>
          <td style="width: 80px; text-align: center;">
            ${img.thumbnail ? `<img src="${img.thumbnail}" style="max-height: 50px; max-width: 60px; object-fit: contain; border-radius: 4px; border: 1px solid var(--border);">` : '<span style="color: var(--text-muted); font-size: 0.75rem;">N/A</span>'}
          </td>
          <td><a href="${img.src}" target="_blank" style="word-break: break-all; font-size: 0.85rem; color: var(--info);">${img.src}</a></td>
          <td><strong>${((img.bytes || 0) / 1024).toFixed(1)} KB</strong></td>
          <td>${(img.decodedFormat || img.contentType?.split('/')[1] || 'unknown').toUpperCase()}</td>
          <td>${img.decodedWidth && img.decodedHeight ? `${img.decodedWidth}x${img.decodedHeight}px` : 'Unknown'}</td>
          <td><small style="color: var(--text-muted)">${img.pages.join(', ')}</small></td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- All Discovered Images Grid -->
    <h2>🖼️ Discovered Assets Catalog</h2>
    <div class="image-grid">
      ${result.images.map(img => {
        const format = img.decodedFormat || img.contentType?.split('/')[1] || 'unknown';
        const imgScore = (img as any).score ?? 100;
        const scoreClass = imgScore >= 80 ? 'good' : imgScore >= 60 ? 'average' : 'poor';
        const filename = img.src.substring(img.src.lastIndexOf('/') + 1) || 'image';

        return `
        <div class="image-card">
          <div class="image-preview-box">
            ${img.thumbnail ? `<img src="${img.thumbnail}" alt="${img.alt || ''}">` : '<div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700;">No preview</div>'}
          </div>
          <div class="image-card-body">
            <div>
              <p class="image-card-title" title="${img.src}">${filename}</p>
              <div class="image-card-meta">
                <div>Format: <strong>${format.toUpperCase()}</strong></div>
                <div>Size: <strong>${img.bytes ? `${(img.bytes / 1024).toFixed(1)} KB` : 'Unknown'}</strong></div>
                <div>Intrinsic: <strong>${img.decodedWidth ? `${img.decodedWidth}x${img.decodedHeight}px` : 'Unknown'}</strong></div>
                ${img.renderedWidth ? `<div>Rendered: <strong>${img.renderedWidth}x${img.renderedHeight}px</strong></div>` : ''}
                ${img.isLcp ? `<div style="color: var(--error); font-weight: 800; margin-top: 0.25rem;">⚡ LCP Element</div>` : ''}
              </div>
            </div>
            <div class="image-card-score">
              <span style="font-size: 0.8rem; color: var(--text-muted);">Asset Score</span>
              <span class="image-score-badge ${scoreClass}">${imgScore}/100</span>
            </div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
  </main>
</body>
</html>
    `;

    fs.writeFileSync(absolutePath, htmlContent, 'utf8');
    return absolutePath;
  }
}
