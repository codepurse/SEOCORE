import { describe, it, expect } from 'vitest';
import { inferAnchorTheme, inferAnchorText } from './anchors.js';

describe('inferAnchorTheme', () => {
  it('uses title when available', () => {
    expect(inferAnchorTheme('https://example.com/page', 'Best SEO Tips')).toBe('Best SEO Tips');
  });

  it('limits to 4 words', () => {
    expect(inferAnchorTheme('https://example.com/page', 'One Two Three Four Five Six')).toBe('One Two Three Four');
  });

  it('falls back to URL segment', () => {
    expect(inferAnchorTheme('https://example.com/seo-tips-guide')).toBe('seo tips guide');
  });

  it('returns Learn more as last resort', () => {
    expect(inferAnchorTheme('https://example.com/')).toBe('example');
  });
});

describe('inferAnchorText', () => {
  it('uses title when reasonable length', () => {
    expect(inferAnchorText('https://example.com/page', 'SEO Guide')).toBe('SEO Guide');
  });

  it('falls back to URL segment', () => {
    expect(inferAnchorText('https://example.com/seo-guide')).toBe('Seo guide');
  });

  it('returns domain name for root URLs', () => {
    expect(inferAnchorText('https://example.com/')).toBe('Example');
  });
});
