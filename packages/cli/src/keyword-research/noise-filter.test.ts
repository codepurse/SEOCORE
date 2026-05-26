import { describe, expect, it } from 'vitest';
import { applyNoiseFilter, keywordNoiseScore, normalizeAndDedupSuggestions } from './noise-filter.js';

describe('keyword noise filter', () => {
  it('hard-filters entity-heavy navigational junk for generic seeds', () => {
    const suggestions = normalizeAndDedupSuggestions([
      { keyword: 'behavioral health services', sourceType: 'direct', index: 0 },
      { keyword: 'acme behavioral health llc reviews', sourceType: 'semantic', index: 1 },
      { keyword: 'county behavioral health department address', sourceType: 'semantic', index: 2 },
      { keyword: 'highlands behavioral health reviews', sourceType: 'semantic', index: 3 },
    ]);

    const result = applyNoiseFilter(suggestions, 'behavioral health');

    expect(result.kept.map(entry => entry.keyword)).toContain('behavioral health services');
    expect(result.filtered.map(entry => entry.keyword)).toContain('acme behavioral health llc reviews');
    expect(result.filtered.map(entry => entry.keyword)).toContain('county behavioral health department address');
    expect(result.filtered.map(entry => entry.keyword)).toContain('highlands behavioral health reviews');
  });

  it('allowlists branded seeds when brand clearly belongs to intent', () => {
    const brandedScore = keywordNoiseScore('nike shoes reviews', 'nike shoes');
    const genericScore = keywordNoiseScore('county behavioral health department address', 'behavioral health');

    expect(brandedScore.allowlisted).toBe(true);
    expect(brandedScore.hardFiltered).toBe(false);
    expect(genericScore.hardFiltered).toBe(true);
  });
});
