import pc from 'picocolors';
import { AuditResult, Category, Finding, Severity, BacklinkIntelligenceData } from '@seocore/sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface ComparisonReport {
  overallWinner: 'siteA' | 'siteB' | 'tie';
  winnerReason: string;
  scoreDifferentials: {
    overall: { siteA: number; siteB: number; gap: number };
    categories: Record<Category, { siteA: number; siteB: number; gap: number }>;
  };
  structuralDifferences: {
    maxDepth: { siteA?: number; siteB?: number; gap?: number };
    orphanCount: { siteA?: number; siteB?: number; gap?: number };
    pagesAudited: { siteA: number; siteB: number; gap: number };
  };
  contentDifferences: {
    // Simplified - in real usage we'd parse AI visibility metrics
    aiVisibility: { siteA: number; siteB: number; gap: number };
  };
  technicalDifferences: {
    performance: { siteA: number; siteB: number; gap: number };
    indexing: { siteA: number; siteB: number; gap: number };
    accessibility: { siteA: number; siteB: number; gap: number };
    findingsCount: {
      siteA: Record<Severity, number>;
      siteB: Record<Severity, number>;
    };
  };
  backlinkDifferences: { 
    available: boolean;
    siteA?: BacklinkIntelligenceData;
    siteB?: BacklinkIntelligenceData;
  };
  keyGaps: Finding[]; // Gaps in siteB compared to siteA
  opportunities: Finding[]; // High-impact opportunities for siteB
  competitiveTakeaway: string;
}

export class CompareEngine {
  static compare(siteA: AuditResult, siteB: AuditResult): ComparisonReport {
    // 1. Overall Winner
    let overallWinner: 'siteA' | 'siteB' | 'tie' = 'tie';
    let winnerReason = '';
    if (siteA.score > siteB.score) {
      overallWinner = 'siteA';
      winnerReason = `Site A has higher overall SEO score (${siteA.score} vs ${siteB.score})`;
    } else if (siteB.score > siteA.score) {
      overallWinner = 'siteB';
      winnerReason = `Site B has higher overall SEO score (${siteB.score} vs ${siteA.score})`;
    } else {
      winnerReason = 'Both sites have identical overall SEO scores';
    }

    // 2. Score Differentials
    const scoreDifferentials: ComparisonReport['scoreDifferentials'] = {
      overall: {
        siteA: siteA.score,
        siteB: siteB.score,
        gap: siteA.score - siteB.score
      },
      categories: {} as any
    };

    const allCategories: Category[] = [
      'indexing', 'metadata', 'links', 'seo', 'ai_visibility',
      'accessibility', 'performance', 'mobile_seo', 'backlink_intelligence'
    ];

    for (const cat of allCategories) {
      const aScore = siteA.categories[cat]?.score ?? 0;
      const bScore = siteB.categories[cat]?.score ?? 0;
      scoreDifferentials.categories[cat] = {
        siteA: aScore,
        siteB: bScore,
        gap: aScore - bScore
      };
    }

    // 3. Structural Differences
    const structuralDifferences: ComparisonReport['structuralDifferences'] = {
      maxDepth: {
        siteA: siteA.crawlGraph?.metrics.maxDepth,
        siteB: siteB.crawlGraph?.metrics.maxDepth,
        gap: siteA.crawlGraph?.metrics.maxDepth && siteB.crawlGraph?.metrics.maxDepth
          ? siteA.crawlGraph.metrics.maxDepth - siteB.crawlGraph.metrics.maxDepth
          : undefined
      },
      orphanCount: {
        siteA: siteA.crawlGraph?.metrics.orphanCount,
        siteB: siteB.crawlGraph?.metrics.orphanCount,
        gap: siteA.crawlGraph?.metrics.orphanCount !== undefined && siteB.crawlGraph?.metrics.orphanCount !== undefined
          ? siteA.crawlGraph.metrics.orphanCount - siteB.crawlGraph.metrics.orphanCount
          : undefined
      },
      pagesAudited: {
        siteA: siteA.pagesAudited,
        siteB: siteB.pagesAudited,
        gap: siteA.pagesAudited - siteB.pagesAudited
      }
    };

    // 4. Content Differences (simplified)
    const contentDifferences: ComparisonReport['contentDifferences'] = {
      aiVisibility: {
        siteA: siteA.categories.ai_visibility?.score ?? 0,
        siteB: siteB.categories.ai_visibility?.score ?? 0,
        gap: (siteA.categories.ai_visibility?.score ?? 0) - (siteB.categories.ai_visibility?.score ?? 0)
      }
    };

    // 5. Technical Differences
    const countFindingsBySeverity = (result: AuditResult): Record<Severity, number> => {
      const counts = { critical: 0, error: 0, warning: 0, info: 0 };
      for (const f of result.findings) {
        counts[f.severity]++;
      }
      return counts;
    };

    const technicalDifferences: ComparisonReport['technicalDifferences'] = {
      performance: {
        siteA: siteA.categories.performance?.score ?? 0,
        siteB: siteB.categories.performance?.score ?? 0,
        gap: (siteA.categories.performance?.score ?? 0) - (siteB.categories.performance?.score ?? 0)
      },
      indexing: {
        siteA: siteA.categories.indexing?.score ?? 0,
        siteB: siteB.categories.indexing?.score ?? 0,
        gap: (siteA.categories.indexing?.score ?? 0) - (siteB.categories.indexing?.score ?? 0)
      },
      accessibility: {
        siteA: siteA.categories.accessibility?.score ?? 0,
        siteB: siteB.categories.accessibility?.score ?? 0,
        gap: (siteA.categories.accessibility?.score ?? 0) - (siteB.categories.accessibility?.score ?? 0)
      },
      findingsCount: {
        siteA: countFindingsBySeverity(siteA),
        siteB: countFindingsBySeverity(siteB)
      }
    };

    // 6. Backlink Differences
    const backlinkDifferences: ComparisonReport['backlinkDifferences'] = {
      available: !!(siteA.backlinkData && siteB.backlinkData),
      siteA: siteA.backlinkData,
      siteB: siteB.backlinkData
    };

    // 7. Key Gaps (siteB weaknesses)
    const keyGaps: Finding[] = [];
    // Check categories where siteA is much stronger
    for (const cat of allCategories) {
      const aScore = siteA.categories[cat]?.score ?? 0;
      const bScore = siteB.categories[cat]?.score ?? 0;
      if (aScore - bScore >= 20) { // Significant gap threshold
        // Add critical/error findings from siteB in this category
        const bCriticalErrors = siteB.findings.filter(
          f => f.category === cat && (f.severity === 'critical' || f.severity === 'error')
        ).slice(0, 5);
        keyGaps.push(...bCriticalErrors);
      }
    }

    // 8. Opportunities
    const opportunities: Finding[] = siteB.findings
      .filter(f => f.severity === 'critical' || f.severity === 'error')
      .slice(0, 10);

    // 9. Placeholder competitive takeaway - will be replaced in report()
    let competitiveTakeaway = '';
    if (overallWinner === 'siteA') {
      const strongCats = allCategories.filter(cat => 
        (siteA.categories[cat]?.score ?? 0) - (siteB.categories[cat]?.score ?? 0) >= 15
      );
      competitiveTakeaway = strongCats.length > 0 ? strongCats.join(', ') : 'multiple areas';
    } else if (overallWinner === 'siteB') {
      // Just leave as empty for now
    } else {
      competitiveTakeaway = 'Both sites have identical overall scores. Check category breakdowns for detailed differences.';
    }

    return {
      overallWinner,
      winnerReason,
      scoreDifferentials,
      structuralDifferences,
      contentDifferences,
      technicalDifferences,
      backlinkDifferences,
      keyGaps,
      opportunities,
      competitiveTakeaway
    };
  }

  static report(siteA: AuditResult, siteB: AuditResult, options: { siteAName?: string; siteBName?: string; focus?: 'technical' | 'content' | 'ai-visibility' | 'backlinks' | 'mobile' } = {}): void {
    const comparison = this.compare(siteA, siteB);
    
    // Extract hostname from URL by default
    const getHostname = (url: string): string => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'Site';
      }
    };
    
    const nameA = options.siteAName || getHostname(siteA.url);
    const nameB = options.siteBName || getHostname(siteB.url);
    const focus = options.focus;

    // 1. Header
    let title = '  SEO COMPARISON REPORT  ';
    if (focus) {
      title = `  SEO COMPARISON REPORT (${focus.toUpperCase()})  `;
    }
    console.log('\n' + pc.bold(pc.bgMagenta(pc.white(title))));
    console.log(`${pc.gray('Comparing:')} ${pc.cyan(nameA)} (${siteA.url}) vs ${pc.cyan(nameB)} (${siteB.url})`);
    console.log(`${pc.gray('Generated:')} ${new Date().toISOString()}\n`);

    // 2. Overall Winner
    let displayWinnerReason = comparison.winnerReason;
    if (comparison.overallWinner === 'siteA') {
      displayWinnerReason = `${nameA} has higher overall SEO score (${siteA.score} vs ${siteB.score})`;
    } else if (comparison.overallWinner === 'siteB') {
      displayWinnerReason = `${nameB} has higher overall SEO score (${siteB.score} vs ${siteA.score})`;
    }
    
    console.log(pc.bold('OVERALL WINNER:'));
    if (comparison.overallWinner === 'siteA') {
      console.log(`  ${pc.green(nameA)} - ${displayWinnerReason}`);
    } else if (comparison.overallWinner === 'siteB') {
      console.log(`  ${pc.green(nameB)} - ${displayWinnerReason}`);
    } else {
      console.log(`  ${pc.yellow('TIE')} - ${comparison.winnerReason}`);
    }
    console.log();

    // Define category groups for focus
    const categoryGroups: Record<string, Category[]> = {
      'technical': ['performance', 'indexing', 'accessibility', 'mobile_seo'],
      'content': ['metadata', 'seo', 'links'],
      'ai-visibility': ['ai_visibility'],
      'backlinks': ['backlink_intelligence'],
      'mobile': ['mobile_seo', 'performance']
    };

    // Get relevant categories based on focus
    let relevantCategories = Object.keys(comparison.scoreDifferentials.categories) as Category[];
    if (focus && categoryGroups[focus]) {
      relevantCategories = categoryGroups[focus] as Category[];
    }

    // Helper to truncate long strings
    const truncate = (str: string, maxLength: number): string => {
      if (str.length <= maxLength) return str;
      return str.slice(0, maxLength - 3) + '...';
    };
    
    const maxNameLength = 10;
    const displayNameA = truncate(nameA, maxNameLength);
    const displayNameB = truncate(nameB, maxNameLength);
    
    // 3. Score Differentials with ASCII chart
    console.log(pc.bold('SCORE DIFFERENTIALS:'));
    this.printScoreChart(comparison, nameA, nameB, relevantCategories, maxNameLength);
    console.log();

    // Backlinks focus section
    if (focus === 'backlinks' || !focus) {
      if (comparison.backlinkDifferences.available) {
        this.printBacklinkComparison(comparison, nameA, nameB);
      } else if (focus === 'backlinks') {
        console.log(pc.yellow('⚠️ Backlink data not available for one or both sites.'));
        console.log();
      }
    }

    // Filter findings based on focus
    const filterFindingsByFocus = (findings: Finding[]): Finding[] => {
      if (!focus) return findings;
      if (focus === 'technical') {
        return findings.filter(f => ['performance', 'indexing', 'accessibility', 'mobile_seo'].includes(f.category));
      }
      if (focus === 'content') {
        return findings.filter(f => ['metadata', 'seo', 'links'].includes(f.category));
      }
      if (focus === 'ai-visibility') {
        return findings.filter(f => f.category === 'ai_visibility');
      }
      if (focus === 'mobile') {
        return findings.filter(f => ['mobile_seo', 'performance'].includes(f.category));
      }
      if (focus === 'backlinks') {
        return findings.filter(f => f.category === 'backlink_intelligence');
      }
      return findings;
    };

    const filteredKeyGaps = filterFindingsByFocus(comparison.keyGaps);
    const filteredOpportunities = filterFindingsByFocus(comparison.opportunities);

    // Skip structural differences for content/backlinks/mobile focus
    if (focus !== 'content' && focus !== 'backlinks' && focus !== 'mobile') {
      // 4. Structural Differences
      console.log(pc.bold('STRUCTURAL SEO DIFFERENCES:'));
      const struct = comparison.structuralDifferences;
      console.log(`  Pages Audited:  ${displayNameA}: ${struct.pagesAudited.siteA} | ${displayNameB}: ${struct.pagesAudited.siteB} | Gap: ${struct.pagesAudited.gap}`);
      if (struct.maxDepth.siteA !== undefined && struct.maxDepth.siteB !== undefined) {
        console.log(`  Max Depth:      ${displayNameA}: ${struct.maxDepth.siteA} | ${displayNameB}: ${struct.maxDepth.siteB} | Gap: ${struct.maxDepth.gap}`);
      }
      if (struct.orphanCount.siteA !== undefined && struct.orphanCount.siteB !== undefined) {
        const aOrphanColor = struct.orphanCount.siteA > 0 ? pc.red : pc.green;
        const bOrphanColor = struct.orphanCount.siteB > 0 ? pc.red : pc.green;
        console.log(`  Orphan Pages:   ${displayNameA}: ${aOrphanColor(struct.orphanCount.siteA)} | ${displayNameB}: ${bOrphanColor(struct.orphanCount.siteB)} | Gap: ${struct.orphanCount.gap}`);
      }
      console.log();
    }

    // 5. Key Gaps (Second site weaknesses)
    console.log(pc.bold(pc.red('KEY GAPS FOR ' + nameB.toUpperCase() + ':')));
    if (filteredKeyGaps.length > 0) {
      filteredKeyGaps.slice(0, 10).forEach((f, i) => {
        const sevColor = f.severity === 'critical' ? pc.bgRed : pc.bgYellow;
        console.log(`  ${i + 1}. ${sevColor(pc.white(` ${f.severity.toUpperCase()} `))} ${pc.white(f.message)}`);
        console.log(`     ${pc.gray('URL:')} ${pc.cyan(f.url)}`);
        console.log(`     ${pc.gray('Fix:')} ${pc.green(f.recommendation)}`);
      });
      if (filteredKeyGaps.length > 10) {
        console.log(`  ${pc.gray(`... and ${filteredKeyGaps.length - 10} more issues.`)}`);
      }
    } else {
      console.log(`  ${pc.green('No major gaps found! ' + nameB + ' is competitive with ' + nameA + '.')}`);
    }
    console.log();

    // 6. Opportunities
    console.log(pc.bold(pc.green('⚡ PRIORITY OPPORTUNITIES FOR ' + nameB.toUpperCase() + ':')));
    if (filteredOpportunities.length > 0) {
      filteredOpportunities.slice(0, 8).forEach((f, i) => {
        const sevColor = f.severity === 'critical' ? pc.bgRed : pc.bgYellow;
        console.log(`  ${i + 1}. ${sevColor(pc.white(` ${f.severity.toUpperCase()} `))} ${pc.white(f.message)}`);
        console.log(`     ${pc.gray('Action:')} ${pc.green(f.recommendation)}`);
      });
    } else {
      console.log(`  ${pc.green('No critical errors found. Great job!')}`);
    }
    console.log();

    // 7. Competitive Takeaway
    let displayCompetitiveTakeaway = comparison.competitiveTakeaway;
    if (comparison.overallWinner === 'siteA') {
      displayCompetitiveTakeaway = `${nameA} (${siteA.url}) outperforms ${nameB} (${siteB.url}) with a score of ${siteA.score} vs ${siteB.score}. Key strengths for ${nameA} include ${comparison.competitiveTakeaway}. ${nameB} should prioritize fixing critical errors to close the gap.`;
    } else if (comparison.overallWinner === 'siteB') {
      displayCompetitiveTakeaway = `${nameB} (${siteB.url}) outperforms ${nameA} (${siteA.url}) with a score of ${siteB.score} vs ${siteA.score}.`;
    }
    
    console.log(pc.bold(pc.cyan('COMPETITIVE TAKEAWAY:')));
    console.log(`  ${displayCompetitiveTakeaway}`);
    console.log();
  }

  // Export comparison report to JSON
  static exportJson(siteA: AuditResult, siteB: AuditResult, outputPath: string, options: { siteAName?: string; siteBName?: string } = {}): string {
    const comparison = this.compare(siteA, siteB);
    const report = {
      generatedAt: new Date().toISOString(),
      siteA: {
        name: options.siteAName || siteA.url,
        url: siteA.url,
        score: siteA.score,
        audit: siteA
      },
      siteB: {
        name: options.siteBName || siteB.url,
        url: siteB.url,
        score: siteB.score,
        audit: siteB
      },
      comparison
    };
    
    const absolutePath = path.resolve(outputPath);
    fs.writeFileSync(absolutePath, JSON.stringify(report, null, 2), 'utf8');
    return absolutePath;
  }

  // Export comparison report to HTML
  static exportHtml(siteA: AuditResult, siteB: AuditResult, outputPath: string, options: { siteAName?: string; siteBName?: string } = {}): string {
    const comparison = this.compare(siteA, siteB);
    
    // Generate HTML
    const nameA = options.siteAName || siteA.url;
    const nameB = options.siteBName || siteB.url;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEO Comparison Report - ${nameA} vs ${nameB}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 20px; border-radius: 8px; }
        .winner { background: #10b981; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 1.2em; font-weight: bold; }
        .tie { background: #f59e0b; color: white; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; }
        .score-high { color: #10b981; font-weight: bold; }
        .score-medium { color: #f59e0b; font-weight: bold; }
        .score-low { color: #ef4444; font-weight: bold; }
        .gap-positive { color: #10b981; }
        .gap-negative { color: #ef4444; }
        .critical { background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin: 10px 0; border-radius: 4px; }
        .error { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 10px 0; border-radius: 4px; }
        .section { margin: 30px 0; }
        .section-title { font-size: 1.3em; font-weight: 600; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 SEO Comparison Report</h1>
        <p><strong>Comparing:</strong> ${nameA} (${siteA.url}) vs ${nameB} (${siteB.url})</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        
        <div class="winner ${comparison.overallWinner === 'tie' ? 'tie' : ''}">
            🏆 Winner: ${comparison.overallWinner === 'siteA' ? nameA : comparison.overallWinner === 'siteB' ? nameB : 'TIE'} - ${comparison.winnerReason}
        </div>

        <div class="section">
            <div class="section-title">Score Differentials</div>
            <table>
                <tr><th>Category</th><th>${nameA}</th><th>${nameB}</th><th>Gap</th></tr>
                <tr>
                    <td><strong>Overall</strong></td>
                    <td class="${comparison.scoreDifferentials.overall.siteA >= 90 ? 'score-high' : comparison.scoreDifferentials.overall.siteA >= 50 ? 'score-medium' : 'score-low'}">${comparison.scoreDifferentials.overall.siteA}</td>
                    <td class="${comparison.scoreDifferentials.overall.siteB >= 90 ? 'score-high' : comparison.scoreDifferentials.overall.siteB >= 50 ? 'score-medium' : 'score-low'}">${comparison.scoreDifferentials.overall.siteB}</td>
                    <td class="${comparison.scoreDifferentials.overall.gap > 0 ? 'gap-positive' : comparison.scoreDifferentials.overall.gap < 0 ? 'gap-negative' : ''}">${comparison.scoreDifferentials.overall.gap > 0 ? '+' : ''}${comparison.scoreDifferentials.overall.gap}</td>
                </tr>
                ${Object.entries(comparison.scoreDifferentials.categories).map(([cat, scores]) => `
                    <tr>
                        <td>${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}</td>
                        <td class="${scores.siteA >= 90 ? 'score-high' : scores.siteA >= 50 ? 'score-medium' : 'score-low'}">${scores.siteA}</td>
                        <td class="${scores.siteB >= 90 ? 'score-high' : scores.siteB >= 50 ? 'score-medium' : 'score-low'}">${scores.siteB}</td>
                        <td class="${scores.gap > 0 ? 'gap-positive' : scores.gap < 0 ? 'gap-negative' : ''}">${scores.gap > 0 ? '+' : ''}${scores.gap}</td>
                    </tr>
                `).join('')}
            </table>
        </div>

        ${comparison.keyGaps.length > 0 ? `
        <div class="section">
            <div class="section-title">Key Gaps for ${nameB}</div>
            ${comparison.keyGaps.slice(0, 10).map(f => `
                <div class="${f.severity}">
                    <strong>${f.severity.toUpperCase()}: ${f.message}</strong><br>
                    URL: <a href="${f.url}" target="_blank">${f.url}</a><br>
                    Fix: ${f.recommendation}
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${comparison.opportunities.length > 0 ? `
        <div class="section">
            <div class="section-title">Priority Opportunities for ${nameB}</div>
            ${comparison.opportunities.slice(0, 8).map(f => `
                <div class="${f.severity}">
                    <strong>${f.severity.toUpperCase()}: ${f.message}</strong><br>
                    URL: <a href="${f.url}" target="_blank">${f.url}</a><br>
                    Action: ${f.recommendation}
                </div>
            `).join('')}
        </div>
        ` : ''}
    </div>
</body>
</html>`;
    
    const absolutePath = path.resolve(outputPath);
    fs.writeFileSync(absolutePath, html, 'utf8');
    return absolutePath;
  }

  private static printScoreChart(comparison: ComparisonReport, nameA: string, nameB: string, categories: Category[], maxNameLength: number): void {
    const truncate = (str: string, max: number): string => str.length <= max ? str : str.slice(0, max - 3) + '...';
    const displayNameA = truncate(nameA, maxNameLength);
    const displayNameB = truncate(nameB, maxNameLength);

    console.log(pc.gray('┌──────────────────────────────────────────────────────────────┐'));
    console.log(pc.gray('│') + `  ${'Category'.padEnd(20)}  ${displayNameA.padEnd(maxNameLength)}  ${displayNameB.padEnd(maxNameLength)}  Gap      ` + pc.gray('│'));
    console.log(pc.gray('├──────────────────────────────────────────────────────────────┤'));

    const overallDiff = comparison.scoreDifferentials.overall;
    this.printScoreChartRow('Overall', overallDiff.siteA, overallDiff.siteB, overallDiff.gap, maxNameLength);

    for (const catName of categories) {
      const catDiff = comparison.scoreDifferentials.categories[catName];
      if (catDiff) {
        const formattedCat = catName.charAt(0).toUpperCase() + catName.slice(1).replace(/_/g, ' ');
        this.printScoreChartRow(formattedCat, catDiff.siteA, catDiff.siteB, catDiff.gap, maxNameLength);
      }
    }
    console.log(pc.gray('└──────────────────────────────────────────────────────────────┘'));
  }

  private static printScoreChartRow(label: string, a: number, b: number, gap: number, maxNameLength: number): void {
    const aColor = a >= 90 ? pc.green : a >= 50 ? pc.yellow : pc.red;
    const bColor = b >= 90 ? pc.green : b >= 50 ? pc.yellow : pc.red;
    const gapColor = gap > 0 ? pc.green : gap < 0 ? pc.red : pc.gray;
    const gapStr = gap > 0 ? `+${gap}` : `${gap}`;
    
    const paddedLabel = label.padEnd(20);
    const paddedA = aColor(String(a).padStart(maxNameLength));
    const paddedB = bColor(String(b).padStart(maxNameLength));
    const paddedGap = gapColor(gapStr.padStart(6));

    console.log(
      pc.gray('│') + `  ${paddedLabel}  ${paddedA}  ${paddedB}  ${paddedGap}  ` + pc.gray('│')
    );
  }

  private static printBacklinkComparison(comparison: ComparisonReport, nameA: string, nameB: string): void {
    if (!comparison.backlinkDifferences.siteA || !comparison.backlinkDifferences.siteB) return;
    
    const aData = comparison.backlinkDifferences.siteA;
    const bData = comparison.backlinkDifferences.siteB;
    
    console.log(pc.bold('🔗 BACKLINK COMPARISON:'));
    
    // Domain metrics
    const aMetrics = aData.domainMetrics;
    const bMetrics = bData.domainMetrics;
    
    const metricRows = [
      { label: 'Total Backlinks', a: aMetrics.totalBacklinks, b: bMetrics.totalBacklinks },
      { label: 'Referring Domains', a: aMetrics.referringDomains, b: bMetrics.referringDomains },
      { label: 'Domain Authority', a: aMetrics.domainAuthority, b: bMetrics.domainAuthority },
      { label: 'Spam Score', a: aMetrics.spamScore, b: bMetrics.spamScore }
    ];
    
    for (const row of metricRows) {
      if (row.a !== undefined && row.b !== undefined) {
        const gap = (row.a as number) - (row.b as number);
        const gapColor = gap > 0 ? pc.green : gap < 0 ? pc.red : pc.gray;
        const gapStr = gap > 0 ? `+${gap}` : `${gap}`;
        console.log(`  ${row.label.padEnd(20)} ${nameA}: ${pc.cyan(String(row.a))} | ${nameB}: ${pc.cyan(String(row.b))} | Gap: ${gapColor(gapStr)}`);
      }
    }
    
    // Backlink gap analysis
    console.log();
    console.log(pc.bold('Backlink Gap Analysis:'));
    
    // Find unique referring domains for each site
    const aDomains = new Set(aData.backlinks.map(b => {
      try { return new URL(b.sourceUrl).hostname; } catch { return ''; }
    }).filter(Boolean));
    
    const bDomains = new Set(bData.backlinks.map(b => {
      try { return new URL(b.sourceUrl).hostname; } catch { return ''; }
    }).filter(Boolean));
    
    const uniqueToA = Array.from(aDomains).filter(d => !bDomains.has(d)).slice(0, 10);
    const uniqueToB = Array.from(bDomains).filter(d => !aDomains.has(d)).slice(0, 10);
    
    if (uniqueToA.length > 0) {
      console.log(`  ${pc.green('✓')} Domains linking only to ${nameA} (${uniqueToA.length}+):`);
      uniqueToA.forEach(d => console.log(`    • ${d}`));
    }
    
    if (uniqueToB.length > 0) {
      console.log();
      console.log(`  ${pc.yellow('⚠')} Domains linking only to ${nameB} (${uniqueToB.length}+):`);
      uniqueToB.forEach(d => console.log(`    • ${d}`));
    }
    
    console.log();
  }

  private static printScoreRow(label: string, a: number, b: number, gap: number, maxNameLength: number = 10): void {
    const aColor = a >= 90 ? pc.green : a >= 50 ? pc.yellow : pc.red;
    const bColor = b >= 90 ? pc.green : b >= 50 ? pc.yellow : pc.red;
    const gapColor = gap > 0 ? pc.green : gap < 0 ? pc.red : pc.gray;
    const gapStr = gap > 0 ? `+${gap}` : `${gap}`;
    
    const paddedLabel = label.padEnd(21);
    const paddedA = aColor(String(a).padStart(maxNameLength));
    const paddedB = bColor(String(b).padStart(maxNameLength));
    const paddedGap = gapColor(gapStr.padStart(6));

    console.log(
      pc.gray('│') + ` ${paddedLabel} ` +
      pc.gray('│') + ` ${paddedA} ` +
      pc.gray('│') + ` ${paddedB} ` +
      pc.gray('│') + ` ${paddedGap}   ` +
      pc.gray('│')
    );
  }
}
