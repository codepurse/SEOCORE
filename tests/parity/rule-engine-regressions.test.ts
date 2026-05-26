import { describe, expect, it } from 'vitest';
import { TIER_PRESETS } from '../../packages/sdk/src/index.ts';
import { collectCanonicalFindings } from './fixture-utils.ts';

describe('Phase 3 rule engine regressions', () => {
  it('applies findingSeverityOverrides across core, performance, mobile, ai, and security modules', async () => {
    const findings = await collectCanonicalFindings({
      ruleOverrides: {
        'social-meta': {
          findingSeverityOverrides: {
            'social-meta:missing-og': 'critical',
          },
        },
        'lcp-metric': {
          findingSeverityOverrides: {
            'lcp-metric:poor': 'critical',
          },
        },
        'mobile-usability': {
          findingSeverityOverrides: {
            'mobile-usability:missing-viewport': 'error',
          },
        },
        'ai-authority-signals': {
          findingSeverityOverrides: {
            'ai-authority-signals:missing-authorship': 'error',
          },
        },
        'security-headers': {
          findingSeverityOverrides: {
            'security-headers:missing-csp': 'error',
          },
        },
      },
    });

    expect(findings.find((finding) => finding.ruleId === 'social-meta' && finding.subCheck === 'missing-og')?.severity).toBe('critical');
    expect(findings.find((finding) => finding.ruleId === 'lcp-metric' && finding.subCheck === 'poor')?.severity).toBe('critical');
    expect(findings.find((finding) => finding.ruleId === 'mobile-usability' && finding.subCheck === 'missing-viewport')?.severity).toBe('error');
    expect(findings.find((finding) => finding.ruleId === 'ai-authority-signals' && finding.subCheck === 'missing-authorship')?.severity).toBe('error');
    expect(findings.find((finding) => finding.ruleId === 'security-headers' && finding.subCheck === 'missing-csp')?.severity).toBe('error');
  });

  it('suppresses disabled module findings at rule-engine level', async () => {
    const tierConfig = {
      ...TIER_PRESETS.enterprise,
      modules: {
        ...TIER_PRESETS.enterprise.modules,
        performance: false,
        mobile: false,
        aiVisibility: false,
        security: false,
        hreflang: false,
        backlinks: false,
      },
    };

    const findings = await collectCanonicalFindings({}, tierConfig);

    expect(findings.filter((finding) => finding.category === 'performance')).toEqual([]);
    expect(findings.filter((finding) => finding.category === 'mobile_seo')).toEqual([]);
    expect(findings.filter((finding) => finding.category === 'ai_visibility')).toEqual([]);
    expect(findings.filter((finding) => finding.category === 'security')).toEqual([]);
  });
});
