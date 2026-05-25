import type { Finding } from '@seocore/sdk';

export function calculateSecurityScore(findings: Finding[], pagesAudited: number, floors: Record<string, number>): number {
  const securityFindings = findings.filter(f => f.category === 'security');
  const scale = pagesAudited > 1 ? Math.log10(pagesAudited + 9) : 1;

  const getSubScore = (suffixesWithDeduction: Record<string, number>): number => {
    let rawDeductionSum = 0;
    const pagesWithFindings = new Map<string, number>();
    
    for (const finding of securityFindings) {
      for (const [suffix, deduction] of Object.entries(suffixesWithDeduction)) {
        if (finding.id.endsWith(`:${suffix}`) || finding.id.includes(`:${suffix}:`) || finding.ruleId === suffix) {
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

  const httpsScore = getSubScore({ 'not-https': 100 });
  const hstsScore = getSubScore({
    'missing-hsts': 100,
    'hsts-invalid': 60,
    'hsts-short-max-age': 40,
    'hsts-missing-subdomains': 30,
    'hsts-missing-preload': 10
  });
  const cspScore = getSubScore({
    'missing-csp': 100,
    'csp-report-only': 30,
    'csp-unsafe-inline-script': 50,
    'csp-unsafe-eval-script': 40,
    'csp-script-src-wildcard': 40,
    'csp-object-src-wildcard': 30,
    'csp-missing-object-src': 20,
    'csp-missing-default-src': 20,
    'csp-missing-frame-ancestors': 10
  });
  const xctoScore = getSubScore({
    'missing-x-content-type-options': 100,
    'invalid-x-content-type-options': 50
  });
  const xframeScore = getSubScore({ 'missing-x-frame-options': 100 });
  const referrerScore = getSubScore({ 'missing-referrer-policy': 100 });
  const permissionsScore = getSubScore({ 'missing-permissions-policy': 100 });
  const coopCoepCorpScore = getSubScore({
    'missing-coop': 35,
    'missing-coep': 35,
    'missing-corp': 30
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
