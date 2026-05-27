import pc from 'picocolors';
import { DiffResult, hasCriticalRegressions } from './diff.js';
import { Snapshot } from './snapshot-store.js';

export interface ReporterOptions {
  verbose?: boolean;
  ci?: boolean;
}

function compareConfigs(
  baselineConfig: Snapshot['metadata']['config'],
  currentConfig: Snapshot['metadata']['config']
): string[] {
  const differences: string[] = [];
  const allKeys = new Set([
    ...Object.keys(baselineConfig || {}),
    ...Object.keys(currentConfig || {}),
  ]);

  for (const key of allKeys) {
    const bVal = JSON.stringify(baselineConfig?.[key as keyof typeof baselineConfig]);
    const cVal = JSON.stringify(currentConfig?.[key as keyof typeof currentConfig]);
    if (bVal !== cVal) {
      differences.push(
        `${key}: baseline=${bVal || 'none'}, current=${cVal || 'none'}`
      );
    }
  }

  return differences;
}

export function reportDiff(
  baseline: Snapshot,
  current: Snapshot,
  diff: DiffResult,
  options: ReporterOptions = {}
): void {
  const { verbose = false, ci = false } = options;
  
  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                  AUDIT DIFF REPORT')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();
  
  console.log(pc.bold('BASELINE:'));
  console.log(`  URL:      ${pc.cyan(baseline.metadata.url)}`);
  console.log(`  Saved:    ${pc.gray(baseline.metadata.savedAt)}`);
  console.log();
  
  console.log(pc.bold('CURRENT:'));
  console.log(`  URL:      ${pc.cyan(current.metadata.url)}`);
  console.log(`  Run at:   ${pc.gray(current.result.timestamp)}`);

  // Check for config differences
  const configDifferences = compareConfigs(baseline.metadata.config, current.metadata.config);
  if (configDifferences.length > 0) {
    console.log();
    console.log(pc.yellow('⚠️ CONFIGURATION DIFFERENCES DETECTED BETWEEN RUNS:'));
    for (const diff of configDifferences) {
      console.log(`  • ${diff}`);
    }
    console.log();
  }
  console.log();
  
  console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
  console.log(pc.bold('SCORE DELTA'));
  console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
  
  const scoreColor = diff.scoreDiff.delta > 0 ? pc.green : diff.scoreDiff.delta < 0 ? pc.red : pc.gray;
  const scoreArrow = diff.scoreDiff.delta > 0 ? '↑' : diff.scoreDiff.delta < 0 ? '↓' : '→';
  console.log(`  Overall:  ${baseline.result.score} → ${current.result.score}  ${scoreColor(`${scoreArrow} ${Math.abs(diff.scoreDiff.delta)}`)}`);
  console.log();
  
  if (diff.categoryDiffs.length > 0) {
    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('CATEGORY DELTAS'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
    
    for (const catDiff of diff.categoryDiffs) {
      if (catDiff.delta === 0 && !verbose) continue;
      
      const catColor = catDiff.delta > 0 ? pc.green : catDiff.delta < 0 ? pc.red : pc.gray;
      const arrow = catDiff.delta > 0 ? '↑' : catDiff.delta < 0 ? '↓' : '→';
      const catName = catDiff.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      console.log(`  ${catName.padEnd(20)} ${String(catDiff.previousScore).padStart(3)} → ${String(catDiff.currentScore).padEnd(3)}  ${catColor(`${arrow} ${Math.abs(catDiff.delta)}`)}`);
    }
    console.log();
  }
  
  if (diff.newFindings.length > 0) {
    const criticalNew = diff.newFindings.filter(f => f.severity === 'critical' || f.severity === 'error');
    
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`NEW ISSUES (${diff.newFindings.length})`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));
    
    const displayFindings = verbose ? diff.newFindings : criticalNew.length > 0 ? criticalNew : diff.newFindings.slice(0, 5);
    
    for (const finding of displayFindings) {
      const sevBadge = finding.severity === 'critical' ? pc.bgRed(' CRITICAL ') : 
        finding.severity === 'error' ? pc.bgRed(' ERROR ') :
        finding.severity === 'warning' ? pc.bgYellow(' WARNING ') :
        pc.blue(' INFO ');
      console.log(`  ${sevBadge} ${pc.white(finding.message)}`);
      console.log(`    ${pc.gray('Rule:')} ${pc.cyan(finding.ruleId)}`);
      console.log(`    ${pc.gray('URL:')}  ${pc.cyan(finding.url)}`);
    }
    
    if (!verbose && diff.newFindings.length > displayFindings.length) {
      console.log(`  ${pc.italic(pc.gray(`... and ${diff.newFindings.length - displayFindings.length} more issues. Run with --verbose to see all.`))}`);
    }
    console.log();
  }
  
  if (diff.fixedFindings.length > 0) {
    console.log(pc.bold(pc.green('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.green(`FIXED ISSUES (${diff.fixedFindings.length})`)));
    console.log(pc.green('───────────────────────────────────────────────────────────────'));
    
    const displayFixed = verbose ? diff.fixedFindings : diff.fixedFindings.slice(0, 10);
    
    for (const finding of displayFixed) {
      const sevBadge = finding.severity === 'critical' ? pc.bgRed(' CRITICAL ') : 
        finding.severity === 'error' ? pc.bgRed(' ERROR ') :
        finding.severity === 'warning' ? pc.bgYellow(' WARNING ') :
        pc.blue(' INFO ');
      console.log(`  ${pc.green('✓')} ${pc.white(finding.message)} ${sevBadge}`);
      console.log(`    ${pc.gray('Was on:')} ${pc.cyan(finding.url)}`);
    }
    
    if (!verbose && diff.fixedFindings.length > displayFixed.length) {
      console.log(`  ${pc.italic(pc.gray(`... and ${diff.fixedFindings.length - displayFixed.length} more fixed issues.`))}`);
    }
    console.log();
  }
  
  if (diff.severityChanges.length > 0) {
    console.log(pc.bold(pc.yellow('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.yellow(`SEVERITY CHANGES (${diff.severityChanges.length})`)));
    console.log(pc.yellow('───────────────────────────────────────────────────────────────'));
    
    for (const change of diff.severityChanges) {
      const prevBadge = pc.bgYellow(` ${change.previousSeverity.toUpperCase()} `);
      const newBadge = pc.bgRed(` ${change.newSeverity.toUpperCase()} `);
      console.log(`  ${pc.white(change.finding.message)}`);
      console.log(`    ${prevBadge} → ${newBadge} on ${pc.cyan(change.finding.url)}`);
    }
    console.log();
  }
  
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold('SUMMARY'));
  console.log(pc.cyan('═══════════════════════════════════════════════════════════════'));
  console.log();
  
  const regressionsCount = diff.newFindings.filter(f => f.severity === 'critical' || f.severity === 'error').length + diff.severityChanges.length;
  const improvementsCount = diff.fixedFindings.length;
  
  if (regressionsCount > 0) {
    console.log(`  ${pc.red('✗')} ${pc.red(`${regressionsCount} regression(s) detected`)}`);
  } else {
    console.log(`  ${pc.green('✓')} ${pc.green('No critical regressions')}`);
  }
  
  if (improvementsCount > 0) {
    console.log(`  ${pc.green('✓')} ${pc.green(`${improvementsCount} issue(s) resolved`)}`);
  }
  
  if (diff.scoreDiff.delta > 0) {
    console.log(`  ${pc.green('↑')} ${pc.green(`Score improved by ${diff.scoreDiff.delta} points`)}`);
  } else if (diff.scoreDiff.delta < 0) {
    console.log(`  ${pc.red('↓')} ${pc.red(`Score decreased by ${Math.abs(diff.scoreDiff.delta)} points`)}`);
  }
  
  console.log();
  
  if (ci && hasCriticalRegressions(diff)) {
    console.log(pc.bold(pc.red('═══════════════════════════════════════════════════════════════')));
    console.log(pc.bold(pc.red('CI MODE: FAILING DUE TO CRITICAL REGRESSIONS')));
    console.log(pc.bold(pc.red('═══════════════════════════════════════════════════════════════')));
    console.log();
  } else if (ci) {
    console.log(pc.green('CI MODE: PASSED (no critical regressions)\n'));
  }
}
