import type {
  Category,
  DataSource,
  ExecutionTierConfig,
  Finding,
  NormalizedPage,
  Rule,
  RuleEvaluationContext,
  RuleModule,
  SeoConfig,
  Severity,
} from '@seocore/sdk';
import { getRuleSettings } from '@seocore/rule-utils';
import {
  ContentQualityRule,
  DuplicateContentSimilarityRule,
  InternalLinkDistributionRule,
  InternalLinkingRule,
  PaginationHealthRule,
  SocialMetaRule,
} from './content-links.js';
import { EeatScoreRule } from './eeat.js';
import { BrokenLinksRule, MissingAltTextRule, MissingH1Rule, MultipleH1Rule } from './headings-links.js';
import {
  CanonicalIssuesRule,
  MissingRobotsTxtRule,
  MissingSitemapXmlRule,
  MissingStructuredDataRule,
  NoIndexRule,
  OrphanPageRule,
} from './indexing.js';
import { MissingMetaDescriptionRule } from './metadata/meta-description.js';
import { DuplicateTitleRule, MissingTitleRule } from './metadata/title.js';

const SEVERITY_ORDER: Severity[] = ['info', 'warning', 'error', 'critical'];

export interface RuleFilterOptions {
  modules?: RuleModule[];
  categories?: Category[];
  minSeverity?: Severity;
  tierConfig?: ExecutionTierConfig;
}

function getSeverityIndex(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

function getTierModuleState(moduleName: RuleModule, tierConfig: ExecutionTierConfig): boolean {
  switch (moduleName) {
    case 'core':
      return tierConfig.modules.core;
    case 'performance':
      return tierConfig.modules.performance;
    case 'mobile':
      return tierConfig.modules.mobile;
    case 'ai_visibility':
      return tierConfig.modules.aiVisibility;
    case 'security':
      return tierConfig.modules.security;
    case 'backlinks':
      return tierConfig.modules.backlinks;
    case 'hreflang':
      return tierConfig.modules.hreflang;
    default:
      return true;
  }
}

export function shouldRun(rule: Rule, config: SeoConfig, options: RuleFilterOptions = {}): boolean {
  const { enabled, severity } = getRuleSettings(rule.definition, config);
  if (!enabled) return false;

  const moduleName = rule.definition.module ?? 'core';
  if (options.modules && !options.modules.includes(moduleName)) {
    return false;
  }

  if (options.categories && !options.categories.includes(rule.definition.category)) {
    return false;
  }

  if (options.minSeverity && getSeverityIndex(severity) < getSeverityIndex(options.minSeverity)) {
    return false;
  }

  if (options.tierConfig) {
    if (!getTierModuleState(moduleName, options.tierConfig)) {
      return false;
    }

    const { categories, minSeverity } = options.tierConfig.ruleFilter;
    if (!categories.includes(rule.definition.category)) {
      return false;
    }

    if (getSeverityIndex(severity) < getSeverityIndex(minSeverity)) {
      return false;
    }
  }

  return true;
}

export function getCoreRules(): Rule[] {
  return [
    new MissingTitleRule(),
    new DuplicateTitleRule(),
    new MissingMetaDescriptionRule(),
    new MissingH1Rule(),
    new MultipleH1Rule(),
    new MissingAltTextRule(),
    new BrokenLinksRule(),
    new CanonicalIssuesRule(),
    new NoIndexRule(),
    new MissingStructuredDataRule(),
    new MissingRobotsTxtRule(),
    new MissingSitemapXmlRule(),
    new OrphanPageRule(),
    new SocialMetaRule(),
    new ContentQualityRule(),
    new EeatScoreRule(),
    new InternalLinkingRule(),
    new PaginationHealthRule(),
    new InternalLinkDistributionRule(),
    new DuplicateContentSimilarityRule(),
  ];
}

export function createDefaultRuleEngine(): RuleEngine {
  return new RuleEngine(getCoreRules());
}

export class RuleEngine {
  private readonly defaultRules: Rule[];
  private readonly customRules: Rule[] = [];

  constructor(rules: Rule[] = getCoreRules()) {
    this.defaultRules = [...rules];
  }

  registerRule(rule: Rule): void {
    this.customRules.push(rule);
  }

  registerRules(rules: Rule[]): void {
    this.customRules.push(...rules);
  }

  shouldRun(rule: Rule, config: SeoConfig, options: RuleFilterOptions = {}): boolean {
    return shouldRun(rule, config, options);
  }

  getRules(config: SeoConfig, tierConfig?: ExecutionTierConfig): Rule[] {
    const allRules = [...this.defaultRules, ...this.customRules];
    return allRules.filter(rule => this.shouldRun(rule, config, { tierConfig }));
  }

  async run(
    pages: Record<string, NormalizedPage>,
    config: SeoConfig,
    dataSources: Map<string, DataSource>,
    tierConfig?: ExecutionTierConfig,
    backlinkData?: RuleEvaluationContext['backlinkData'],
    backlinkError?: string
  ): Promise<Finding[]> {
    const activeRules = this.getRules(config, tierConfig);
    const allFindings: Finding[] = [];

    const context: RuleEvaluationContext = {
      allPages: pages,
      config,
      dataSources,
      backlinkData,
      backlinkError,
    };

    for (const page of Object.values(pages)) {
      for (const rule of activeRules) {
        try {
          const findings = await rule.evaluate(page, context);
          const settings = getRuleSettings(rule.definition, config);
          allFindings.push(...findings.map((finding) => this.applySeverityOverrides(rule, finding, settings.findingSeverityOverrides)));
        } catch (err: any) {
          console.error(`[RuleEngine] Error evaluating rule "${rule.definition.id}" on URL ${page.url}:`, err.message);
        }
      }
    }

    return allFindings;
  }

  private applySeverityOverrides(
    rule: Rule,
    finding: Finding,
    findingSeverityOverrides?: Record<string, Severity>,
  ): Finding {
    if (!finding.subCheck || !findingSeverityOverrides) {
      return finding;
    }

    const scopedKey = `${rule.definition.id}:${finding.subCheck}`;
    const scopedSeverity = findingSeverityOverrides[scopedKey];
    if (scopedSeverity) {
      return {
        ...finding,
        severity: scopedSeverity,
      };
    }

    const legacySeverity = findingSeverityOverrides[finding.subCheck];
    if (legacySeverity) {
      return {
        ...finding,
        severity: legacySeverity,
      };
    }

    return finding;
  }
}
