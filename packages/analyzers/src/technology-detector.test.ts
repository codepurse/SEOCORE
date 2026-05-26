import { describe, expect, it } from 'vitest';
import type { NormalizedPage } from '@seocore/sdk';
import { TechnologyDetector } from './technology-detector.js';

function makePage(overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url: 'https://example.com',
    statusCode: 200,
    loadTimeMs: 120,
    contentType: 'text/html; charset=utf-8',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    ...overrides
  };
}

describe('TechnologyDetector', () => {
  it('detects richer ecosystem categories from public evidence', () => {
    const page = makePage({
      headers: {
        'x-powered-by': 'Next.js',
        'x-vercel-id': 'sin1::abc123',
        'x-vercel-cache': 'HIT'
      },
      html: `
        <!doctype html>
        <html>
          <head>
            <link rel="preconnect" href="https://fonts.gstatic.com">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">
            <script src="/_next/static/chunks/main.js"></script>
            <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST"></script>
            <script src="https://js.stripe.com/v3"></script>
            <script>self.__next_f.push([]); window.webpackChunk_N_E = window.webpackChunk_N_E || [];</script>
            <script id="__NEXT_DATA__" type="application/json">{}</script>
          </head>
          <body>
            <main>${'Server rendered content '.repeat(20)}</main>
          </body>
        </html>
      `
    });

    const summary = TechnologyDetector.detect(page);

    expect(summary.frontendFramework.map(tech => tech.name)).toContain('Next.js');
    expect(summary.renderingStrategy.map(tech => tech.name)).toContain('Hybrid / SSR / SSG');
    expect(summary.hosting.map(tech => tech.name)).toContain('Vercel');
    expect(summary.analytics.map(tech => tech.name)).toContain('Google Tag Manager');
    expect(summary.buildTools.map(tech => tech.name)).toContain('Webpack');
    expect(summary.fonts.map(tech => tech.name)).toContain('Google Fonts');
    expect(summary.thirdPartyServices.map(tech => tech.name)).toContain('Stripe');
  });

  it('only emits backend signals when headers expose them', () => {
    const page = makePage({
      headers: {
        server: 'nginx',
        'x-powered-by': 'PHP/8.2.10'
      },
      html: '<html><body><h1>Plain page</h1></body></html>'
    });

    const summary = TechnologyDetector.detect(page);

    expect(summary.backend.map(tech => tech.name)).toEqual(['nginx', 'PHP']);
    expect(summary.undetectable).toEqual([]);
  });

  it('suppresses weak generic frontend guesses', () => {
    const page = makePage({
      html: `
        <html>
          <body>
            <div id="root"></div>
            <script src="/assets/app.js"></script>
          </body>
        </html>
      `
    });

    const summary = TechnologyDetector.detect(page);

    expect(summary.frontendFramework).toHaveLength(0);
    expect(summary.buildTools).toHaveLength(0);
    expect(summary.undetectable).toContain('No backend signals directly detectable from public headers or HTML.');
  });

  it('detects headless CMS and UI system markers when directly exposed', () => {
    const page = makePage({
      html: `
        <html>
          <head>
            <script src="https://images.ctfassets.net/space-id/hero.png"></script>
          </head>
          <body>
            <div data-emotion="mui">
              <button class="MuiButton-root MuiButton-contained">CTA</button>
            </div>
          </body>
        </html>
      `
    });

    const summary = TechnologyDetector.detect(page);

    expect(summary.cms.map(tech => tech.name)).toContain('Contentful');
    expect(summary.uiLibraries.map(tech => tech.name)).toContain('Material UI');
    expect(summary.uiLibraries.map(tech => tech.name)).not.toContain('Emotion');
  });
});
