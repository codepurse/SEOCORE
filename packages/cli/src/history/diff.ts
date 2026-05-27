import { AuditResult, Finding, Severity, Category, CategoryScore } from '@seocore/sdk';

export type ChangeType = 'new' | 'fixed' | 'regression' | 'improvement' | 'unchanged';

export interface FindingDiff {
  type: ChangeType;
  finding: Finding;
  previousSeverity?: Severity;
}

export interface CategoryDiff {
  category: Category;
  previousScore: number;
  currentScore: number;
  delta: number;
  findingsDiff: FindingDiff[];
}

export interface ScoreDiff {
  previousScore: number;
  currentScore: number;
  delta: number;
}

export interface DiffResult {
  hasRegressions: boolean;
  hasImprovements: boolean;
  scoreDiff: ScoreDiff;
  categoryDiffs: CategoryDiff[];
  newFindings: Finding[];
  fixedFindings: Finding[];
  severityChanges: { finding: Finding; previousSeverity: Severity; newSeverity: Severity }[];
}

function severityToNumber(severity: Severity): number {
  const map: Record<Severity, number> = {
    critical: 4,
    error: 3,
    warning: 2,
    info: 1,
  };
  return map[severity];
}

function isRegressionSeverity(prev: Severity, curr: Severity): boolean {
  return severityToNumber(prev) < severityToNumber(curr);
}

function getFindingKey(finding: Finding): string {
  return `${finding.ruleId}:${finding.url}${finding.subCheck ? `:${finding.subCheck}` : ''}`;
}

function categorizeFindings(findings: Finding[]): Map<string, Finding> {
  const map = new Map<string, Finding>();
  for (const f of findings) {
    map.set(getFindingKey(f), f);
  }
  return map;
}

export function computeDiff(baseline: AuditResult, current: AuditResult): DiffResult {
  const baselineFindingsMap = categorizeFindings(baseline.findings);
  const currentFindingsMap = categorizeFindings(current.findings);
  
  const newFindings: Finding[] = [];
  const fixedFindings: Finding[] = [];
  const severityChanges: { finding: Finding; previousSeverity: Severity; newSeverity: Severity }[] = [];
  const categoryFindingsDiff: Map<Category, FindingDiff[]> = new Map();
  
  for (const [key, currentFinding] of currentFindingsMap) {
    const baselineFinding = baselineFindingsMap.get(key);
    
    if (!baselineFinding) {
      newFindings.push(currentFinding);
      
      const diff: FindingDiff = { type: 'new', finding: currentFinding };
      const catDiffs = categoryFindingsDiff.get(currentFinding.category) || [];
      catDiffs.push(diff);
      categoryFindingsDiff.set(currentFinding.category, catDiffs);
    } else if (baselineFinding.severity !== currentFinding.severity) {
      if (isRegressionSeverity(baselineFinding.severity, currentFinding.severity)) {
        severityChanges.push({
          finding: currentFinding,
          previousSeverity: baselineFinding.severity,
          newSeverity: currentFinding.severity,
        });
        
        const diff: FindingDiff = { 
          type: 'regression', 
          finding: currentFinding,
          previousSeverity: baselineFinding.severity,
        };
        const catDiffs = categoryFindingsDiff.get(currentFinding.category) || [];
        catDiffs.push(diff);
        categoryFindingsDiff.set(currentFinding.category, catDiffs);
      }
    }
  }
  
  for (const [key, baselineFinding] of baselineFindingsMap) {
    if (!currentFindingsMap.has(key)) {
      fixedFindings.push(baselineFinding);
      
      const diff: FindingDiff = { type: 'fixed', finding: baselineFinding };
      const catDiffs = categoryFindingsDiff.get(baselineFinding.category) || [];
      catDiffs.push(diff);
      categoryFindingsDiff.set(baselineFinding.category, catDiffs);
    }
  }
  
  const hasRegressions = newFindings.some(f => f.severity === 'critical' || f.severity === 'error') ||
    severityChanges.length > 0;
  
  const hasImprovements = fixedFindings.length > 0 ||
    severityChanges.some(c => isRegressionSeverity(c.newSeverity, c.previousSeverity));
  
  const scoreDiff: ScoreDiff = {
    previousScore: baseline.score,
    currentScore: current.score,
    delta: current.score - baseline.score,
  };
  
  const categoryDiffs: CategoryDiff[] = [];
  const allCategories = new Set([...Object.keys(baseline.categories), ...Object.keys(current.categories)]);
  
  for (const catName of allCategories) {
    const baselineCat = baseline.categories[catName as Category];
    const currentCat = current.categories[catName as Category];
    
    const previousScore = baselineCat?.score ?? 100;
    const currentScore = currentCat?.score ?? 100;
    const delta = currentScore - previousScore;
    
    const catDiffs = categoryFindingsDiff.get(catName as Category) || [];
    
    categoryDiffs.push({
      category: catName as Category,
      previousScore,
      currentScore,
      delta,
      findingsDiff: catDiffs,
    });
  }
  
  categoryDiffs.sort((a, b) => a.delta - b.delta);
  
  return {
    hasRegressions,
    hasImprovements,
    scoreDiff,
    categoryDiffs,
    newFindings,
    fixedFindings,
    severityChanges,
  };
}

export function hasCriticalRegressions(diff: DiffResult): boolean {
  if (diff.newFindings.some(f => f.severity === 'critical')) {
    return true;
  }
  
  if (diff.severityChanges.length > 0) {
    return true;
  }
  
  if (diff.scoreDiff.delta < 0) {
    return true;
  }
  
  for (const catDiff of diff.categoryDiffs) {
    if (catDiff.delta < 0) {
      return true;
    }
  }
  
  return false;
}
