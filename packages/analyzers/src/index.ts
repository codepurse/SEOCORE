import * as cheerio from 'cheerio';
import { CrawlResult, NormalizedPage } from '@seocore/sdk';

export class PageNormalizer {
  static normalize(result: CrawlResult): NormalizedPage {
    const { url, html, statusCode, loadTimeMs, contentType, redirectChain } = result;

    const normalized: NormalizedPage = {
      url,
      statusCode,
      loadTimeMs,
      contentType,
      html, // Store raw html for deep rule engine scanning
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      redirectChain,
    };

    if (result.lighthouse) {
      normalized.coreWebVitals = result.lighthouse.coreWebVitals;
      normalized.performanceScore = Math.round(result.lighthouse.score * 100);
    }

    if (!html || !contentType.includes('text/html')) {
      return normalized;
    }

    try {
      const $ = cheerio.load(html);

      // 1. Title
      const titleText = $('title').first().text();
      if (titleText) {
        normalized.title = titleText.trim();
      }

      // 2. Meta Description
      const descText = $('meta[name="description"]').first().attr('content');
      if (descText) {
        normalized.metaDescription = descText.trim();
      }

      // 3. Canonical
      const canonicalHref = $('link[rel="canonical"]').first().attr('href');
      if (canonicalHref) {
        normalized.canonical = this.resolveUrl(canonicalHref, url);
      }

      // 4. Robots Meta
      const robotsContent = $('meta[name="robots"]').first().attr('content');
      if (robotsContent) {
        normalized.robotsMeta = robotsContent.trim();
      }

      // Viewport Meta
      const viewportContent = $('meta[name="viewport"]').first().attr('content');
      if (viewportContent) {
        normalized.viewport = viewportContent.trim();
      }

      // 5. Headings (H1, H2, H3)
      $('h1').each((_, el) => {
        const text = $(el).text().trim();
        if (text) normalized.headings.h1.push(text);
      });
      $('h2').each((_, el) => {
        const text = $(el).text().trim();
        if (text) normalized.headings.h2.push(text);
      });
      $('h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text) normalized.headings.h3.push(text);
      });

      // 6. Links
      const baseUrl = new URL(url);
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (!href) return;

        // Skip anchor hash only links, javascript, mailto, tel
        const trimmedHref = href.trim();
        if (
          trimmedHref.startsWith('#') ||
          trimmedHref.startsWith('javascript:') ||
          trimmedHref.startsWith('mailto:') ||
          trimmedHref.startsWith('tel:')
        ) {
          return;
        }

        const resolvedUrl = this.resolveUrl(trimmedHref, url);
        if (resolvedUrl) {
          let isInternal = false;
          try {
            const parsedResolved = new URL(resolvedUrl);
            isInternal = parsedResolved.hostname === baseUrl.hostname;
          } catch {
            // ignore
          }

          normalized.links.push({
            url: resolvedUrl,
            text: text || '[Empty Link Text]',
            isInternal,
          });
        }
      });

      // 7. Images
      $('img').each((_, el) => {
        const src = $(el).attr('src');
        const alt = $(el).attr('alt');
        if (src) {
          const resolvedSrc = this.resolveUrl(src, url);
          if (resolvedSrc) {
            normalized.images.push({
              src: resolvedSrc,
              alt: alt !== undefined ? alt.trim() : undefined,
            });
          }
        }
      });

      // 8. Hreflang
      $('link[rel="alternate"][hreflang]').each((_, el) => {
        const hreflang = $(el).attr('hreflang');
        const href = $(el).attr('href');
        if (hreflang && href) {
          const resolvedHref = this.resolveUrl(href, url);
          if (resolvedHref) {
            normalized.hreflang.push({
              lang: hreflang.trim(),
              url: resolvedHref,
            });
          }
        }
      });

      // 9. Structured Data (JSON-LD)
      $('script[type="application/ld+json"]').each((_, el) => {
        const rawJson = $(el).html();
        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson.trim());
            normalized.structuredData.push(parsed);
          } catch {
            // Push invalid JSON as-is or null for the rules engine to flag
            normalized.structuredData.push({ __error: 'Invalid JSON-LD syntax', raw: rawJson });
          }
        }
      });

      // 10. OpenGraph
      const openGraph: Record<string, string> = {};
      $('meta[property^="og:"]').each((_, el) => {
        const property = $(el).attr('property');
        const content = $(el).attr('content');
        if (property && content) {
          const key = property.replace('og:', '');
          openGraph[key] = content.trim();
        }
      });
      if (Object.keys(openGraph).length > 0) {
        normalized.openGraph = openGraph;
      }

      // 11. Twitter Card
      const twitterCard: Record<string, string> = {};
      $('meta[name^="twitter:"]').each((_, el) => {
        const name = $(el).attr('name');
        const content = $(el).attr('content');
        if (name && content) {
          const key = name.replace('twitter:', '');
          twitterCard[key] = content.trim();
        }
      });
      if (Object.keys(twitterCard).length > 0) {
        normalized.twitterCard = twitterCard;
      }

      // 10. Performance & Resources Extraction
      let scriptCount = 0;
      let stylesheetCount = 0;
      let unDimensionedImages = 0;

      $('script').each((_, el) => {
        if ($(el).attr('src')) {
          scriptCount++;
        }
      });

      $('link[rel="stylesheet"]').each((_, el) => {
        stylesheetCount++;
      });

      $('img').each((_, el) => {
        const w = $(el).attr('width');
        const h = $(el).attr('height');
        if (!w || !h) {
          unDimensionedImages++;
        }
      });

      const resources = result.resources || {
        pageSizeBytes: html ? Buffer.byteLength(html, 'utf8') : 0,
        jsSizeBytes: scriptCount * 35000,
        cssSizeBytes: stylesheetCount * 15000,
        imageSizeBytes: normalized.images.length * 60000,
        otherSizeBytes: 0,
        jsRequests: scriptCount,
        cssRequests: stylesheetCount,
        imageRequests: normalized.images.length,
        totalRequests: 1 + scriptCount + stylesheetCount + normalized.images.length,
      };

      normalized.resources = resources;

      // Use real Lighthouse data if available, otherwise simulate
      if (result.lighthouse) {
        normalized.coreWebVitals = result.lighthouse.coreWebVitals;
        normalized.performanceScore = Math.round(result.lighthouse.score * 100);
      } else {
        // Simulated/Extracted Core Web Vitals
        const lcp = Math.round(loadTimeMs * (1.1 + (resources.jsRequests * 0.1) + (resources.imageRequests * 0.02)));
        const cls = Math.round(Math.min(0.5, unDimensionedImages * 0.03) * 100) / 100;
        const inp = Math.round(80 + (resources.jsRequests * 15) + Math.min(300, resources.jsSizeBytes / 5000));

        normalized.coreWebVitals = { lcp, cls, inp };

        // Performance Score (0-100)
        let lcpScore = 100;
        if (lcp > 2500) lcpScore = Math.max(0, 100 - ((lcp - 2500) / 15));
        if (lcp > 4000) lcpScore = Math.max(0, 50 - ((lcp - 4000) / 50));

        let clsScore = 100;
        if (cls > 0.1) clsScore = Math.max(0, 100 - ((cls - 0.1) * 333));

        let inpScore = 100;
        if (inp > 200) inpScore = Math.max(0, 100 - ((inp - 200) / 3));

        normalized.performanceScore = Math.max(0, Math.min(100, Math.round(
          (lcpScore * 0.4) + (clsScore * 0.3) + (inpScore * 0.3)
        )));
      }

    } catch (err: any) {
      console.error(`[Normalizer] Error normalizing page HTML for ${url}:`, err.message);
    }

    return normalized;
  }

  private static resolveUrl(href: string, base: string): string | undefined {
    try {
      return new URL(href, base).href;
    } catch {
      return undefined;
    }
  }
}
