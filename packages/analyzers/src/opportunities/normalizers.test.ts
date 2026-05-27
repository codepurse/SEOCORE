import { describe, expect, it } from 'vitest';
import { normalizeGscData, normalizeCruxData } from './normalizers.js';

describe('GSC Data Normalizer', () => {
  it('normalizes valid array of GSC metrics with various page URL keys', () => {
    const raw = [
      { page: 'https://example.com/page1', impressions: 100, clicks: 5, ctr: 0.05, position: 2 },
      { pageUrl: 'https://example.com/page2', impressions: '200', clicks: '10', ctr: '0.05', position: '3.5' },
      { url: 'https://example.com/page3', impressions: 300, clicks: 15, ctr: 0.05, position: 4 }
    ];

    const result = normalizeGscData(raw);
    expect(result.warningCount).toBe(0);
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual({
      url: 'https://example.com/page1',
      impressions: 100,
      clicks: 5,
      ctr: 0.05,
      position: 2
    });
    expect(result.data[1]).toEqual({
      url: 'https://example.com/page2',
      impressions: 200,
      clicks: 10,
      ctr: 0.05,
      position: 3.5
    });
  });

  it('skips malformed rows and tracks warning count', () => {
    const raw = [
      { page: 'https://example.com/page1', impressions: 100, clicks: 5, ctr: 0.05, position: 2 },
      { page: '', impressions: 100 }, // missing url
      { page: 'https://example.com/page2', impressions: 'invalid', clicks: 5 } // invalid number
    ];

    const result = normalizeGscData(raw);
    expect(result.warningCount).toBe(2);
    expect(result.data).toHaveLength(1);
  });
});

describe('CrUX Data Normalizer', () => {
  it('normalizes valid array of CrUX metrics', () => {
    const raw = [
      { url: 'https://example.com/page1', lcp: 1200, cls: 0.05, inp: 100 },
      { page: 'https://example.com/page2', lcp: 3000 } // partial ok
    ];

    const result = normalizeCruxData(raw);
    expect(result.warningCount).toBe(0);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      url: 'https://example.com/page1',
      lcp: 1200,
      cls: 0.05,
      inp: 100
    });
    expect(result.data[1]).toEqual({
      url: 'https://example.com/page2',
      lcp: 3000
    });
  });

  it('skips malformed rows and tracks warning count', () => {
    const raw = [
      { url: 'https://example.com/page1', lcp: 'invalid' }
    ];

    const result = normalizeCruxData(raw);
    expect(result.warningCount).toBe(1);
    expect(result.data).toHaveLength(0);
  });
});
