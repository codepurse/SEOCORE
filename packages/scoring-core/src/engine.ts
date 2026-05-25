import type { Category, CategoryScore, Finding, SeoConfig, Severity, RuleDefinition } from '@seocore/sdk';
import type { ExecutionTierConfig } from '@seocore/sdk';
import { DEFAULT_CATEGORY_WEIGHTS, DEFAULT_FLOOR_SCORES } from '@seocore/sdk';

const SEVERITY_MULTIPLIERS: Record<Severity, number> = {
  critical: 1.5,
  error: 1.0,
  warning: 0.4,
  info: 0.05,
};

export interface ScoringInput {
  findings: Finding[];
  pagesAudited: number;
  config: SeoConfig;
  tierConfig: ExecutionTierConfig;
  ruleDefinitions: RuleDefinition[];
}

export interface ScoringResult {
  score: number;
  categories: Record<Category, CategoryScore>;
}

export class ScoringEngine {
  static calculate(input: ScoringInput): ScoringResult {
    const { findings, pagesAudited, config, tierConfig, ruleDefinitions } = input;

    const categories = this.initCategories();
    const categoryDeductions = this.initCategoryDeductions();

    // Count findings by severity per category
    for (const finding of findings) {
      const catScore = categories[finding.category];
      if (catScore) {
        catScore.findingsCount[finding.severity]++;
      }
    }

    // Map rule definitions for weight lookup
    const ruleWeights = new Map<string, number>();
    for (const rDef of ruleDefinitions) {
      const override = config.ruleOverrides?.[rDef.id];
      ruleWeights.set(rDef.id, override?.weight ?? rDef.defaultWeight);
    }

    // Calculate deductions
    for (const finding of findings) {
      const ruleWeight = ruleWeights.get(finding.ruleId) ?? 5;
      const multiplier = SEVERITY_MULTIPLIERS[finding.severity];
      const rawDeduction = ruleWeight * multiplier;
      const normalizedDeduction = pagesAudited > 1
        ? rawDeduction / Math.log10(pagesAudited + 9)
        : rawDeduction;
      categoryDeductions[finding.category] += normalizedDeduction;
    }

    // Apply category scores with floor limits
    const weights = tierConfig.scoring.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS;
    const floors = tierConfig.scoring.floorScores ?? DEFAULT_FLOOR_SCORES;

    for (const cat of Object.keys(categories) as Category[]) {
      const rawScore = 100 - categoryDeductions[cat];
      categories[cat].totalDeductions = Math.round(categoryDeductions[cat] * 10) / 10;
      categories[cat].score = Math.max(floors[cat] ?? 0, Math.min(100, Math.round(rawScore)));
    }

    // Calculate total weighted score
    let weightedSum = 0;
    let weightTotal = 0;

    for (const cat of Object.keys(categories) as Category[]) {
      const catWeight = weights[cat] ?? DEFAULT_CATEGORY_WEIGHTS[cat];
      weightedSum += categories[cat].score * catWeight;
      weightTotal += catWeight;
    }

    const totalScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 100;

    return {
      score: totalScore,
      categories,
    };
  }

  private static initCategories(): Record<Category, CategoryScore> {
    const cats: Category[] = ['seo', 'performance', 'accessibility', 'indexing', 'links', 'metadata', 'ai_visibility', 'mobile_seo', 'backlink_intelligence'];
    const result = {} as Record<Category, CategoryScore>;
    for (const cat of cats) {
      result[cat] = {
        category: cat,
        score: 100,
        totalDeductions: 0,
        findingsCount: { critical: 0, error: 0, warning: 0, info: 0 },
      };
    }
    return result;
  }

  private static initCategoryDeductions(): Record<Category, number> {
    return {
      seo: 0, performance: 0, accessibility: 0, indexing: 0,
      links: 0, metadata: 0, ai_visibility: 0, mobile_seo: 0, backlink_intelligence: 0,
    };
  }
}
