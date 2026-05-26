import type {
  Finding,
  NormalizedPage,
  Rule,
  RuleDefinition,
  RuleEvaluationContext,
  Severity,
} from '@seocore/sdk';
import { createFindingId, getRuleSettings, type RuleSettings } from './finding-helpers.js';

export interface PartialFinding {
  url: string;
  subCheck?: string;
  message: string;
  recommendation: string;
  evidence?: string;
  severity?: Severity;
}

export abstract class BaseRule implements Rule {
  abstract definition: RuleDefinition;

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const settings = getRuleSettings(this.definition, context.config);
    if (!settings.enabled) {
      return [];
    }

    const findings = await this.check(page, context, settings);
    return findings.map((finding) => this.finalizeFinding(finding, settings));
  }

  protected abstract check(
    page: NormalizedPage,
    context: RuleEvaluationContext,
    settings: RuleSettings,
  ): Promise<PartialFinding[]>;

  private finalizeFinding(finding: PartialFinding, settings: RuleSettings): Finding {
    const severity = this.resolveSeverity(finding, settings);

    return {
      id: createFindingId(this.definition.id, finding.url, finding.subCheck),
      ruleId: this.definition.id,
      subCheck: finding.subCheck,
      severity,
      category: this.definition.category,
      url: finding.url,
      message: finding.message,
      recommendation: finding.recommendation,
      evidence: finding.evidence,
      documentationLink: this.definition.documentationLink,
    };
  }

  private resolveSeverity(finding: PartialFinding, settings: RuleSettings): Severity {
    const subCheck = finding.subCheck;
    if (subCheck) {
      const scopedKey = `${this.definition.id}:${subCheck}`;
      const scopedSeverity = settings.findingSeverityOverrides?.[scopedKey];
      if (scopedSeverity) {
        return scopedSeverity;
      }

      const legacySeverity = settings.findingSeverityOverrides?.[subCheck];
      if (legacySeverity) {
        return legacySeverity;
      }
    }

    return finding.severity ?? settings.severity;
  }
}
