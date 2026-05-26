import type { NormalizedPage, RuleDefinition, RuleEvaluationContext, SeoConfig, Severity } from '@seocore/sdk';

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
  findingSeverityOverrides?: Record<string, Severity>;
}

export function getRuleSettings(def: RuleDefinition, config: { ruleOverrides?: Record<string, Partial<RuleSettings>> }): RuleSettings {
  const override = config.ruleOverrides?.[def.id];
  return {
    enabled: override?.enabled !== false,
    severity: override?.severity || def.defaultSeverity,
    weight: override?.weight ?? def.defaultWeight,
    findingSeverityOverrides: override?.findingSeverityOverrides,
  };
}

export function hasConfiguredBacklinkSources(config: SeoConfig): boolean {
  const backlinks = config.backlinks;
  if (!backlinks?.provider) {
    return false;
  }

  const hasBing = backlinks.bing?.enabled !== false && !!backlinks.bing?.apiKey;
  const hasGsc = backlinks.gsc?.enabled !== false && !!backlinks.gsc?.exportPath;
  const hasLogs = backlinks.logs?.enabled !== false && (backlinks.logs?.paths?.length ?? 0) > 0;

  return hasBing || hasGsc || hasLogs;
}

export function getPrimaryBacklinkPage(page: NormalizedPage, context: RuleEvaluationContext): boolean {
  const allPageUrls = Object.keys(context.allPages);
  return page.url === allPageUrls[0];
}
