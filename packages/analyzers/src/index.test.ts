import { describe, it, expect } from 'vitest';
import { PageNormalizer } from './index';
import { CrawlResult } from '@seocore/sdk';

describe('PageNormalizer', () => {
  it('should parse metadata, links, and structured data correctly', () => {
    const mockCrawl: CrawlResult = {
      url: 'https://example.com/blog',
      statusCode: 200,
      loadTimeMs: 150,
      contentType: 'text/html; charset=utf-8',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>My Awesome Blog</title>
            <meta name="description" content="Welcome to my amazing blog.">
            <link rel="canonical" href="https://example.com/blog">
            <link rel="alternate" hreflang="es" href="https://example.com/es/blog">
          </head>
          <body>
            <h1>Main Topic</h1>
            <h2>Sub Topic</h2>
            <a href="/about">About Us</a>
            <a href="https://google.com" target="_blank">Google</a>
            <img src="/assets/hero.jpg" alt="Hero banner" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "headline": "Main Topic"
              }
            </script>
          </body>
        </html>
      `
    };

    const normalized = PageNormalizer.normalize(mockCrawl);

    expect(normalized.title).toBe('My Awesome Blog');
    expect(normalized.metaDescription).toBe('Welcome to my amazing blog.');
    expect(normalized.canonical).toBe('https://example.com/blog');
    expect(normalized.headings.h1).toEqual(['Main Topic']);
    expect(normalized.headings.h2).toEqual(['Sub Topic']);
    expect(normalized.links).toEqual([
      { url: 'https://example.com/about', text: 'About Us', isInternal: true },
      { url: 'https://google.com/', text: 'Google', isInternal: false }
    ]);
    expect(normalized.images).toEqual([
      { src: 'https://example.com/assets/hero.jpg', alt: 'Hero banner' }
    ]);
    expect(normalized.hreflang).toEqual([
      { lang: 'es', url: 'https://example.com/es/blog' }
    ]);
    expect(normalized.structuredData.length).toBe(1);
    expect(normalized.structuredData[0].headline).toBe('Main Topic');
  });
});