import * as cheerio from 'cheerio';
import type { ParsedSurface, LinkInfo, ImageInfo } from './types.js';

const BLOCKLIST_SELECTORS = [
  'nav', 'footer', 'header', 'aside', 'script', 'style', 'noscript',
  '.menu', '.nav', '.footer', '.header', '.sidebar', '.advertisement', '.ad',
  '[role="navigation"]', '[role="complementary"]', '[role="contentinfo"]',
];

function extractReadableText($: cheerio.CheerioAPI): string {
  const main = $('main');
  if (main.length > 0) {
    const clone = main.clone();
    clone.find(BLOCKLIST_SELECTORS.join(', ')).remove();
    return clone.text().replace(/\s+/g, ' ').trim();
  }

  const article = $('article');
  if (article.length > 0) {
    const clone = article.clone();
    clone.find(BLOCKLIST_SELECTORS.join(', ')).remove();
    return clone.text().replace(/\s+/g, ' ').trim();
  }

  const body = $('body');
  if (body.length > 0) {
    const clone = body.clone();
    clone.find(BLOCKLIST_SELECTORS.join(', ')).remove();
    return clone.text().replace(/\s+/g, ' ').trim();
  }

  return $.text().replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count++;
    }
    return count;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

function resolveUrl(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}

export function extractSurface(html: string, baseUrl: string): ParsedSurface {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  const title = $('title').first().text().trim() || null;

  const metaDescription = $('meta[name="description"]').first().attr('content')?.trim() || null;

  const metaRobots = $('meta[name="robots"]').first().attr('content')?.trim() || null;

  const canonical = $('link[rel="canonical"]').first().attr('href')
    ? resolveUrl($('link[rel="canonical"]').first().attr('href')!, baseUrl) || null
    : null;

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property');
    const content = $(el).attr('content');
    if (property && content) {
      openGraph[property.replace('og:', '')] = content.trim();
    }
  });

  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content) {
      twitter[name.replace('twitter:', '')] = content.trim();
    }
  });

  const headings: ParsedSurface['headings'] = {
    h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  };
  for (let level = 1; level <= 6; level++) {
    $(`h${level}`).each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        (headings as any)[`h${level}`].push(text);
      }
    });
  }

  const links: { internal: LinkInfo[]; external: LinkInfo[] } = { internal: [], external: [] };
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const trimmed = href.trim();
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('mailto:') ||
      trimmed.startsWith('tel:')
    ) {
      return;
    }
    const resolved = resolveUrl(trimmed, baseUrl);
    if (!resolved) return;
    let isInternal = false;
    try {
      isInternal = new URL(resolved).hostname === base.hostname;
    } catch {
      // ignore
    }
    const info: LinkInfo = { url: resolved, text: $(el).text().trim() || '[Empty Link Text]', isInternal };
    if (isInternal) links.internal.push(info);
    else links.external.push(info);
  });

  const images: ImageInfo[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    const dataSrc = $(el).attr('data-src');
    const alt = $(el).attr('alt');
    const actualSrc = src || dataSrc;
    if (actualSrc) {
      const resolved = resolveUrl(actualSrc, baseUrl);
      if (resolved) {
        images.push({
          src: resolved,
          alt: alt !== undefined ? alt.trim() : undefined,
          isLazy: !src && !!dataSrc,
        });
      }
    }
  });

  const jsonLdRaw: string[] = [];
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (raw) {
      const trimmed = raw.trim();
      jsonLdRaw.push(trimmed);
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) jsonLd.push(...parsed);
        else if (parsed && parsed['@graph'] && Array.isArray(parsed['@graph'])) jsonLd.push(...parsed['@graph']);
        else jsonLd.push(parsed);
      } catch {
        jsonLd.push({ __error: 'Invalid JSON-LD syntax', raw: trimmed });
      }
    }
  });

  const hreflang: { hreflang: string; href: string }[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hl = $(el).attr('hreflang');
    const href = $(el).attr('href');
    if (hl && href) {
      const resolved = resolveUrl(href, baseUrl);
      if (resolved) {
        hreflang.push({ hreflang: hl.trim(), href: resolved });
      }
    }
  });

  const visibleText = extractReadableText($);
  const wordCount = countWords(visibleText);
  const bytes = Buffer.byteLength(html, 'utf8');

  return {
    title,
    metaDescription,
    metaRobots,
    canonical,
    openGraph,
    twitter,
    headings,
    links,
    images,
    jsonLd,
    jsonLdRaw,
    hreflang,
    visibleText,
    wordCount,
    bytes,
  };
}
