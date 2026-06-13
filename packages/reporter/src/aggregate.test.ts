import { describe, it, expect } from 'vitest';
import { aggregateFindingsByIssue } from './index.js';
import type { Finding } from '@seocore/sdk';

function finding(partial: Partial<Finding>): Finding {
  return {
    id: 'x',
    ruleId: 'security-headers',
    subCheck: 'missing-csp',
    severity: 'error',
    category: 'security',
    url: 'https://example.com/',
    message: 'Page is missing Content-Security-Policy (CSP) header.',
    recommendation: 'Add a CSP header.',
    ...partial,
  } as Finding;
}

describe('aggregateFindingsByIssue', () => {
  it('collapses the same issue across pages into one entry listing every page', () => {
    const findings = [
      finding({ url: 'https://example.com/' }),
      finding({ url: 'https://example.com/about' }),
      finding({ url: 'https://example.com/contact' }),
    ];

    const aggregated = aggregateFindingsByIssue(findings);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].pages).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ]);
  });

  it('keeps distinct issues separate (different sub-check or message)', () => {
    const findings = [
      finding({ subCheck: 'missing-csp', message: 'Missing CSP.' }),
      finding({ subCheck: 'missing-hsts', message: 'Missing HSTS.' }),
      finding({ subCheck: 'missing-csp', message: 'Missing CSP.', url: 'https://example.com/about' }),
    ];

    const aggregated = aggregateFindingsByIssue(findings);

    expect(aggregated).toHaveLength(2);
    const csp = aggregated.find(a => a.finding.subCheck === 'missing-csp');
    expect(csp?.pages).toHaveLength(2);
  });

  it('deduplicates repeated page URLs for the same issue', () => {
    const findings = [
      finding({ url: 'https://example.com/' }),
      finding({ url: 'https://example.com/' }),
    ];
    const aggregated = aggregateFindingsByIssue(findings);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].pages).toEqual(['https://example.com/']);
  });
});
