import type { Finding } from '@seocore/sdk';
import { SECURITY_SUBCHECKS } from '@seocore/rules-security';

export function calculateSecurityScore(findings: Finding[], pagesAudited: number, floors: Record<string, number>): number {
  const securityFindings = findings.filter(f => f.category === 'security');
  const scale = pagesAudited > 1 ? Math.log10(pagesAudited + 9) : 1;

  const getSubScore = (suffixesWithDeduction: Record<string, number>): number => {
    let rawDeductionSum = 0;
    const pagesWithFindings = new Map<string, number>();
    
    for (const finding of securityFindings) {
      for (const [suffix, deduction] of Object.entries(suffixesWithDeduction)) {
        if (finding.subCheck === suffix || finding.id.endsWith(`:${suffix}`) || finding.id.includes(`:${suffix}:`) || finding.ruleId === suffix) {
          const currentMax = pagesWithFindings.get(finding.url) || 0;
          pagesWithFindings.set(finding.url, Math.max(currentMax, deduction));
        }
      }
    }
    
    for (const maxDeduction of pagesWithFindings.values()) {
      rawDeductionSum += maxDeduction / pagesAudited;
    }
    
    const scaledDeduction = rawDeductionSum / scale;
    return Math.max(0, Math.min(100, 100 - scaledDeduction));
  };

  const httpsScore = getSubScore({ [SECURITY_SUBCHECKS.NOT_HTTPS]: 100 });
  const hstsScore = getSubScore({
    [SECURITY_SUBCHECKS.MISSING_HSTS]: 100,
    [SECURITY_SUBCHECKS.HSTS_INVALID]: 60,
    [SECURITY_SUBCHECKS.HSTS_SHORT_MAX_AGE]: 40,
    [SECURITY_SUBCHECKS.HSTS_MISSING_SUBDOMAINS]: 30,
    [SECURITY_SUBCHECKS.HSTS_MISSING_PRELOAD]: 10
  });
  const cspScore = getSubScore({
    [SECURITY_SUBCHECKS.MISSING_CSP]: 100,
    [SECURITY_SUBCHECKS.CSP_REPORT_ONLY]: 30,
    [SECURITY_SUBCHECKS.CSP_UNSAFE_INLINE_SCRIPT]: 50,
    [SECURITY_SUBCHECKS.CSP_UNSAFE_EVAL_SCRIPT]: 40,
    [SECURITY_SUBCHECKS.CSP_SCRIPT_SRC_WILDCARD]: 40,
    [SECURITY_SUBCHECKS.CSP_OBJECT_SRC_WILDCARD]: 30,
    [SECURITY_SUBCHECKS.CSP_MISSING_OBJECT_SRC]: 20,
    [SECURITY_SUBCHECKS.CSP_MISSING_DEFAULT_SRC]: 20,
    [SECURITY_SUBCHECKS.CSP_MISSING_FRAME_ANCESTORS]: 10
  });
  const xctoScore = getSubScore({
    [SECURITY_SUBCHECKS.MISSING_X_CONTENT_TYPE_OPTIONS]: 100,
    [SECURITY_SUBCHECKS.INVALID_X_CONTENT_TYPE_OPTIONS]: 50
  });
  const xframeScore = getSubScore({ [SECURITY_SUBCHECKS.MISSING_X_FRAME_OPTIONS]: 100 });
  const referrerScore = getSubScore({ [SECURITY_SUBCHECKS.MISSING_REFERRER_POLICY]: 100 });
  const permissionsScore = getSubScore({ [SECURITY_SUBCHECKS.MISSING_PERMISSIONS_POLICY]: 100 });
  const coopCoepCorpScore = getSubScore({
    [SECURITY_SUBCHECKS.MISSING_COOP]: 35,
    [SECURITY_SUBCHECKS.MISSING_COEP]: 35,
    [SECURITY_SUBCHECKS.MISSING_CORP]: 30
  });

  const calculatedSecurityScore = Math.round(
    (httpsScore * 0.20) +
    (hstsScore * 0.20) +
    (cspScore * 0.20) +
    (xctoScore * 0.10) +
    (xframeScore * 0.10) +
    (referrerScore * 0.10) +
    (permissionsScore * 0.05) +
    (coopCoepCorpScore * 0.05)
  );

  const floorLimit = floors.security ?? 0;
  return Math.max(floorLimit, calculatedSecurityScore);
}
