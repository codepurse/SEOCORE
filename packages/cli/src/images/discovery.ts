import * as cheerio from 'cheerio';
import { ImageRecord } from './types.js';

// Helper to resolve URLs
export function resolveUrl(relativeUrl: string, baseUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

// Parses srcset string and returns absolute URLs
export function parseSrcset(srcset: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const parts = srcset.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const firstSpace = trimmed.indexOf(' ');
    const urlPart = firstSpace === -1 ? trimmed : trimmed.substring(0, firstSpace).trim();
    if (urlPart) {
      urls.push(resolveUrl(urlPart, baseUrl));
    }
  }
  return urls;
}

// Parses background-image inline styles
export function parseBackgroundStyles(styleAttr: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const regex = /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let match;
  while ((match = regex.exec(styleAttr)) !== null) {
    if (match[1] && !match[1].startsWith('data:')) {
      urls.push(resolveUrl(match[1], baseUrl));
    }
  }
  return urls;
}

export function discoverImagesFromHtml(html: string, pageUrl: string): ImageRecord[] {
  const $ = cheerio.load(html);
  const recordsMap = new Map<string, ImageRecord>();

  // Helper to add or merge records
  function addRecord(record: Partial<ImageRecord>) {
    if (!record.src) return;
    
    // Resolve absolute URL
    const absoluteSrc = resolveUrl(record.src, pageUrl);
    if (absoluteSrc.startsWith('data:')) return; // Ignore data URIs

    const existing = recordsMap.get(absoluteSrc);
    if (existing) {
      if (!existing.pages.includes(pageUrl)) {
        existing.pages.push(pageUrl);
      }
      // Preserve first-seen attributes if not already present
      if (record.alt && !existing.alt) existing.alt = record.alt;
      if (record.loading && !existing.loading) existing.loading = record.loading;
      if (record.decoding && !existing.decoding) existing.decoding = record.decoding;
      if (record.fetchpriority && !existing.fetchpriority) existing.fetchpriority = record.fetchpriority;
      if (record.width && !existing.width) existing.width = record.width;
      if (record.height && !existing.height) existing.height = record.height;
    } else {
      recordsMap.set(absoluteSrc, {
        src: absoluteSrc,
        originalSrc: record.src,
        alt: record.alt,
        loading: record.loading,
        decoding: record.decoding,
        fetchpriority: record.fetchpriority,
        width: record.width,
        height: record.height,
        hasAspectRatio: record.hasAspectRatio,
        isPreload: record.isPreload ?? false,
        pages: [pageUrl],
      });
    }
  }

  // 1. Extract <img> elements
  $('img').each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src');
    if (!src) return;

    const alt = $img.attr('alt');
    const loading = $img.attr('loading');
    const decoding = $img.attr('decoding');
    const fetchpriority = $img.attr('fetchpriority') || $img.attr('importance'); // handle older importance attr
    
    // Parse height/width attributes
    const widthAttr = $img.attr('width');
    const heightAttr = $img.attr('height');
    const width = widthAttr ? parseInt(widthAttr, 10) : undefined;
    const height = heightAttr ? parseInt(heightAttr, 10) : undefined;

    const style = $img.attr('style') || '';
    const hasAspectRatio = /aspect-ratio\s*:/gi.test(style);

    addRecord({
      src,
      alt,
      loading,
      decoding,
      fetchpriority,
      width: isNaN(width as any) ? undefined : width,
      height: isNaN(height as any) ? undefined : height,
      hasAspectRatio,
    });

    // Also extract images from <img> srcset if present
    const srcset = $img.attr('srcset');
    if (srcset) {
      const srcsetUrls = parseSrcset(srcset, pageUrl);
      for (const sUrl of srcsetUrls) {
        addRecord({
          src: sUrl,
          alt,
          loading,
          decoding,
          fetchpriority,
        });
      }
    }
  });

  // 2. Extract <picture><source> elements
  $('picture').each((_, el) => {
    const $pic = $(el);
    const $img = $pic.find('img');
    const alt = $img.attr('alt');
    const loading = $img.attr('loading');
    const decoding = $img.attr('decoding');
    const fetchpriority = $img.attr('fetchpriority');

    $pic.find('source').each((_, sourceEl) => {
      const $source = $(sourceEl);
      const srcset = $source.attr('srcset');
      if (srcset) {
        const srcsetUrls = parseSrcset(srcset, pageUrl);
        for (const sUrl of srcsetUrls) {
          addRecord({
            src: sUrl,
            alt,
            loading,
            decoding,
            fetchpriority,
          });
        }
      }
    });
  });

  // 3. Extract CSS background-image from inline style attributes
  $('[style]').each((_, el) => {
    const styleAttr = $(el).attr('style');
    if (styleAttr) {
      const bgUrls = parseBackgroundStyles(styleAttr, pageUrl);
      for (const bgUrl of bgUrls) {
        addRecord({
          src: bgUrl,
        });
      }
    }
  });

  // 4. Extract <link rel="preload" as="image"> elements
  $('link[rel="preload"][as="image"]').each((_, el) => {
    const $link = $(el);
    const href = $link.attr('href');
    const fetchpriority = $link.attr('fetchpriority');
    
    if (href) {
      addRecord({
        src: href,
        fetchpriority,
        isPreload: true,
      });
    }

    // Also check image srcset preload links
    const imagesrcset = $link.attr('imagesrcset');
    if (imagesrcset) {
      const srcsetUrls = parseSrcset(imagesrcset, pageUrl);
      for (const sUrl of srcsetUrls) {
        addRecord({
          src: sUrl,
          fetchpriority,
          isPreload: true,
        });
      }
    }
  });

  return Array.from(recordsMap.values());
}
