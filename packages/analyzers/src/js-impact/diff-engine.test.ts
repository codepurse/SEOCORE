import { describe, it, expect } from 'vitest';
import { runDiffEngine } from './diff-engine.js';
import { extractSurface } from './surface-extractor.js';
import type { DiffContext } from './types.js';

const BASE_URL = 'https://example.com';

function ctx(): DiffContext {
  return { url: BASE_URL, rawHeaders: {} };
}

describe('diff-engine', () => {
  it('returns empty diffs for identical surfaces', () => {
    const html = '<html><head><title>Same</title></head><body><h1>Hello</h1></body></html>';
    const raw = extractSurface(html, BASE_URL);
    const rendered = extractSurface(html, BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    expect(diffs).toHaveLength(0);
  });

  it('detects canonical injection', () => {
    const raw = extractSurface('<html><head><title>T</title></head><body></body></html>', BASE_URL);
    const rendered = extractSurface('<html><head><title>T</title><link rel="canonical" href="/page"></head><body></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const canonicalDiff = diffs.find(d => d.aspect === 'indexability.canonical');
    expect(canonicalDiff).toBeDefined();
    expect(canonicalDiff!.severity).toBe('critical');
  });

  it('detects noindex injection', () => {
    const raw = extractSurface('<html><head><title>T</title></head><body></body></html>', BASE_URL);
    const rendered = extractSurface('<html><head><title>T</title><meta name="robots" content="noindex"></head><body></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'indexability.metaRobots');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('critical');
  });

  it('detects title change', () => {
    const raw = extractSurface('<html><head><title>Old</title></head><body></body></html>', BASE_URL);
    const rendered = extractSurface('<html><head><title>New</title></head><body></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'metadata.title');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('high');
  });

  it('detects word count drop', () => {
    const raw = extractSurface('<html><body><main><p>one two three four five six seven eight nine ten</p></main></body></html>', BASE_URL);
    const rendered = extractSurface('<html><body><main><p>one two three</p></main></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'content.wordCount');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('critical');
  });

  it('detects main text hydration', () => {
    const raw = extractSurface('<html><body><div id="root"></div></body></html>', BASE_URL);
    const rendered = extractSurface('<html><body><div id="root"><main><p>' + 'word '.repeat(150) + '</p></main></div></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'content.mainTextMissing');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('critical');
  });

  it('detects JSON-LD only in rendered', () => {
    const raw = extractSurface('<html><head><title>T</title></head><body></body></html>', BASE_URL);
    const rendered = extractSurface('<html><head><title>T</title><script type="application/ld+json">{"@type":"Organization"}</script></head><body></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'structuredData.jsonLd');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('high');
  });

  it('detects hreflang injection', () => {
    const raw = extractSurface('<html><head><title>T</title></head><body></body></html>', BASE_URL);
    const rendered = extractSurface('<html><head><title>T</title><link rel="alternate" hreflang="fr" href="/fr"></head><body></body></html>', BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'hreflang');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('high');
  });

  it('sorts by severity then aspect order', () => {
    const raw = extractSurface('<html><head><title>Old</title></head><body></body></html>', BASE_URL);
    const rendered = extractSurface(
      '<html><head><title>New</title><meta name="robots" content="noindex"><link rel="canonical" href="/page"></head><body></body></html>',
      BASE_URL
    );
    const diffs = runDiffEngine(raw, rendered, ctx());
    expect(diffs[0].severity).toBe('critical');
    expect(diffs[0].aspect).toBe('indexability.canonical');
    expect(diffs[1].severity).toBe('critical');
    expect(diffs[1].aspect).toBe('indexability.metaRobots');
    expect(diffs[2].severity).toBe('high');
    expect(diffs[2].aspect).toBe('metadata.title');
  });

  it('caps evidence to 5 items', () => {
    const raw = extractSurface('<html><head><title>T</title></head><body></body></html>', BASE_URL);
    const renderedHtml = '<html><head><title>T</title></head><body>' +
      Array.from({ length: 10 }, (_, i) => `<a href="/page${i}">Link ${i}</a>`).join('') +
      '</body></html>';
    const rendered = extractSurface(renderedHtml, BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx());
    const diff = diffs.find(d => d.aspect === 'links.onlyInRendered');
    expect(diff).toBeDefined();
    expect(diff!.evidence.length).toBeLessThanOrEqual(5);
  });

  it('handles js errors option', () => {
    const html = '<html><head><title>T</title></head><body></body></html>';
    const raw = extractSurface(html, BASE_URL);
    const rendered = extractSurface(html, BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx(), {
      consoleMessages: [{ level: 'error', text: 'Uncaught Error: oops' }],
    });
    const diff = diffs.find(d => d.aspect === 'jsErrors');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('high');
  });

  it('handles blocked resources option', () => {
    const html = '<html><head><title>T</title></head><body></body></html>';
    const raw = extractSurface(html, BASE_URL);
    const rendered = extractSurface(html, BASE_URL);
    const diffs = runDiffEngine(raw, rendered, ctx(), {
      blockedResources: [{ url: 'https://example.com/app.js', reason: 'robots.txt', impact: 'critical' }],
    });
    const diff = diffs.find(d => d.aspect === 'resourceBlocked');
    expect(diff).toBeDefined();
    expect(diff!.severity).toBe('critical');
  });
});
