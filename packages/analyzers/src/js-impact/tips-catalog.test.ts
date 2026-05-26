import { describe, it, expect } from 'vitest';
import { generateRecommendations, detectFrameworkHint } from './tips-catalog.js';
import type { JsImpactDiff } from './types.js';

describe('generateRecommendations', () => {
  it('returns no recommendations when there are no diffs', () => {
    const recs = generateRecommendations([]);
    expect(recs).toHaveLength(0);
  });

  it('returns recommendations matching diff aspects', () => {
    const diffs: JsImpactDiff[] = [
      { id: '1', aspect: 'indexability.canonical', severity: 'critical', confidence: 'certain', title: 'Canonical injected', description: '', evidence: [] },
      { id: '2', aspect: 'content.wordCount', severity: 'high', confidence: 'certain', title: 'Word count drop', description: '', evidence: [] },
    ];
    const recs = generateRecommendations(diffs);
    expect(recs.length).toBeGreaterThanOrEqual(2);
    expect(recs.map(r => r.id)).toContain('canonical-ssr');
    expect(recs.map(r => r.id)).toContain('content-ssr');
  });

  it('dedupes recommendations for multiple diffs triggering same tip', () => {
    const diffs: JsImpactDiff[] = [
      { id: '1', aspect: 'metadata.title', severity: 'high', confidence: 'certain', title: 'Title changed', description: '', evidence: [] },
      { id: '2', aspect: 'metadata.metaDescription', severity: 'high', confidence: 'certain', title: 'Desc changed', description: '', evidence: [] },
    ];
    const recs = generateRecommendations(diffs);
    const metadataRec = recs.find(r => r.id === 'metadata-ssr');
    expect(metadataRec).toBeDefined();
    // should only appear once
    expect(recs.filter(r => r.id === 'metadata-ssr')).toHaveLength(1);
  });

  it('includes framework-specific advice when framework is provided', () => {
    const diffs: JsImpactDiff[] = [
      { id: '1', aspect: 'indexability.canonical', severity: 'critical', confidence: 'certain', title: 'Canonical injected', description: '', evidence: [] },
    ];
    const recs = generateRecommendations(diffs, 'nextjs');
    const rec = recs.find(r => r.id === 'canonical-ssr');
    expect(rec).toBeDefined();
    expect(rec!.frameworkSpecific).toContain('Next.js');
  });

  it('sorts recommendations by priority', () => {
    const diffs: JsImpactDiff[] = [
      { id: '1', aspect: 'metadata.title', severity: 'high', confidence: 'certain', title: '', description: '', evidence: [] }, // priority 2
      { id: '2', aspect: 'indexability.canonical', severity: 'critical', confidence: 'certain', title: '', description: '', evidence: [] }, // priority 1
    ];
    const recs = generateRecommendations(diffs);
    expect(recs[0].priority).toBe(1);
  });
});

describe('detectFrameworkHint', () => {
  it('detects Next.js', () => {
    const html = '<html><body><div id="__next"></div><script>__NEXT_DATA__ = {}</script></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBe('nextjs');
  });

  it('detects Nuxt.js', () => {
    const html = '<html><body><div id="__nuxt"></div><script>__NUXT__ = {}</script></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBe('nuxtjs');
  });

  it('detects React', () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBe('react');
  });

  it('detects Vue', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBe('vue');
  });

  it('detects Angular', () => {
    const html = '<html><body><app-root></app-root></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBe('angular');
  });

  it('detects SvelteKit', () => {
    const html = '<html><body><script id="__sveltekit_"></script></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBe('sveltekit');
  });

  it('returns undefined when no framework detected', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const framework = detectFrameworkHint(html);
    expect(framework).toBeUndefined();
  });

  it('uses renderedHtml when provided', () => {
    const rawHtml = '<html><body><div id="app"></div></body></html>';
    const renderedHtml = '<html><body><div id="__next"></div><script>__NEXT_DATA__ = {}</script></body></html>';
    const framework = detectFrameworkHint(rawHtml, renderedHtml);
    expect(framework).toBe('nextjs');
  });
});
