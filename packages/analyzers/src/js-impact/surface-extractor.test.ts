import { describe, it, expect } from 'vitest';
import { extractSurface } from './surface-extractor.js';

const BASE_URL = 'https://example.com';

describe('extractSurface', () => {
  it('extracts title', () => {
    const html = '<html><head><title>Hello World</title></head><body></body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.title).toBe('Hello World');
  });

  it('extracts meta description', () => {
    const html = '<html><head><meta name="description" content="A test page"></head><body></body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.metaDescription).toBe('A test page');
  });

  it('extracts meta robots', () => {
    const html = '<html><head><meta name="robots" content="noindex, nofollow"></head><body></body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.metaRobots).toBe('noindex, nofollow');
  });

  it('extracts canonical', () => {
    const html = '<html><head><link rel="canonical" href="/page"></head><body></body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.canonical).toBe('https://example.com/page');
  });

  it('extracts OpenGraph tags', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Desc">
      </head><body></body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.openGraph.title).toBe('OG Title');
    expect(s.openGraph.description).toBe('OG Desc');
  });

  it('extracts Twitter tags', () => {
    const html = `
      <html><head>
        <meta name="twitter:card" content="summary">
        <meta name="twitter:title" content="TW Title">
      </head><body></body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.twitter.card).toBe('summary');
    expect(s.twitter.title).toBe('TW Title');
  });

  it('extracts headings', () => {
    const html = `
      <html><body>
        <h1>First H1</h1>
        <h2>First H2</h2>
        <h2>Second H2</h2>
        <h3>An H3</h3>
      </body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.headings.h1).toEqual(['First H1']);
    expect(s.headings.h2).toEqual(['First H2', 'Second H2']);
    expect(s.headings.h3).toEqual(['An H3']);
    expect(s.headings.h4).toEqual([]);
  });

  it('extracts internal and external links', () => {
    const html = `
      <html><body>
        <a href="/internal">Internal</a>
        <a href="https://other.com/">External</a>
        <a href="#anchor">Anchor</a>
        <a href="mailto:test@example.com">Mail</a>
      </body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.links.internal).toHaveLength(1);
    expect(s.links.internal[0].url).toBe('https://example.com/internal');
    expect(s.links.external).toHaveLength(1);
    expect(s.links.external[0].url).toBe('https://other.com/');
  });

  it('extracts images and lazy-loaded images', () => {
    const html = `
      <html><body>
        <img src="/a.jpg" alt="A">
        <img data-src="/b.jpg" alt="B">
        <img src="/c.jpg">
      </body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.images).toHaveLength(3);
    expect(s.images[0].src).toBe('https://example.com/a.jpg');
    expect(s.images[0].alt).toBe('A');
    expect(s.images[0].isLazy).toBe(false);
    expect(s.images[1].src).toBe('https://example.com/b.jpg');
    expect(s.images[1].isLazy).toBe(true);
    expect(s.images[2].alt).toBeUndefined();
  });

  it('extracts JSON-LD', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      </head><body></body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.jsonLd).toHaveLength(1);
    expect((s.jsonLd[0] as any)['@type']).toBe('Organization');
    expect(s.jsonLdRaw).toHaveLength(1);
  });

  it('extracts hreflang', () => {
    const html = `
      <html><head>
        <link rel="alternate" hreflang="en" href="/en">
        <link rel="alternate" hreflang="fr" href="/fr">
      </head><body></body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.hreflang).toHaveLength(2);
    expect(s.hreflang[0].hreflang).toBe('en');
    expect(s.hreflang[0].href).toBe('https://example.com/en');
  });

  it('extracts visible text from main', () => {
    const html = `
      <html><body>
        <nav>Nav text</nav>
        <main><p>Main paragraph one.</p><p>Main paragraph two.</p></main>
        <footer>Footer text</footer>
      </body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.visibleText).toContain('Main paragraph one');
    expect(s.visibleText).toContain('Main paragraph two');
    expect(s.visibleText).not.toContain('Nav text');
    expect(s.visibleText).not.toContain('Footer text');
  });

  it('falls back to article when main absent', () => {
    const html = `
      <html><body>
        <article><p>Article content here.</p></article>
      </body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.visibleText).toContain('Article content here');
  });

  it('falls back to body minus blocklist', () => {
    const html = `
      <html><body>
        <header>Header</header>
        <p>Body content.</p>
        <footer>Footer</footer>
      </body></html>
    `;
    const s = extractSurface(html, BASE_URL);
    expect(s.visibleText).toContain('Body content');
    expect(s.visibleText).not.toContain('Header');
    expect(s.visibleText).not.toContain('Footer');
  });

  it('counts words correctly', () => {
    const html = '<html><body><main><p>Hello world this is a test.</p></main></body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.wordCount).toBe(6);
  });

  it('computes bytes', () => {
    const html = '<html><body>Hi</body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.bytes).toBe(Buffer.byteLength(html, 'utf8'));
  });

  it('handles empty HTML gracefully', () => {
    const s = extractSurface('', BASE_URL);
    expect(s.title).toBeNull();
    expect(s.wordCount).toBe(0);
    expect(s.links.internal).toEqual([]);
    expect(s.images).toEqual([]);
  });

  it('resolves relative URLs', () => {
    const html = '<html><body><a href="/path">Link</a><img src="img.png"></body></html>';
    const s = extractSurface(html, BASE_URL);
    expect(s.links.internal[0].url).toBe('https://example.com/path');
    expect(s.images[0].src).toBe('https://example.com/img.png');
  });
});
