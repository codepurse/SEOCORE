import { Finding, Severity, Category, RuleDefinition } from '@seocore/sdk';

export function createFindingId(ruleId: string, url: string, details?: string): string {
  let suffix = '';
  if (details) {
    let hash = 0;
    for (let i = 0; i < details.length; i++) {
      hash = (hash << 5) - hash + details.charCodeAt(i);
      hash |= 0;
    }
    suffix = `:${Math.abs(hash).toString(36)}`;
  }
  const urlSafe = Buffer.from(url).toString('base64url').substring(0, 16);
  return `${ruleId}:${urlSafe}${suffix}`;
}

export interface RuleSettings {
  enabled: boolean;
  severity: Severity;
  weight: number;
}

export function getRuleSettings(def: RuleDefinition, config: { ruleOverrides?: Record<string, Partial<RuleSettings>> }): RuleSettings {
  const override = config.ruleOverrides?.[def.id];
  return {
    enabled: override?.enabled !== false,
    severity: override?.severity || def.defaultSeverity,
    weight: override?.weight ?? def.defaultWeight,
  };
}
