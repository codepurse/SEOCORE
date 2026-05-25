import { describe, it, expect, vi } from 'vitest';
import { discoverImagesFromHtml, resolveUrl } from './discovery.js';
import { checkIsCdn } from './fetcher.js';
import { decodeImageMetadata } from './decoder.js';
import { calculateScoringAndBudgets } from './scoring.js';
import { analyzeImages } from './analyzer.js';
import { ImageRecord } from './types.js';

describe('Image Audit Discovery', () => {
  it('should discover images from standard HTML tags', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="preload" as="image" href="/preload-img.webp" fetchpriority="high">
      </head>
      <body>
        <div style="background-image: url('/inline-bg.jpg');"></div>
        <img src="https://example.com/test-img.png" alt="Test image" loading="lazy" width="200" height="100">
        <picture>
          <source srcset="/picture-source-1.webp, /picture-source-2.webp 2x">
          <img src="/picture-fallback.png" alt="Picture fallback">
        </picture>
      </body>
      </html>
    `;
    const pageUrl = 'https://example.com/blog/page-1';
    const images = discoverImagesFromHtml(html, pageUrl);

    // Resolve assertions
    expect(images.some(img => img.src === 'https://example.com/preload-img.webp')).toBe(true);
    expect(images.some(img => img.src === 'https://example.com/inline-bg.jpg')).toBe(true);
    expect(images.some(img => img.src === 'https://example.com/test-img.png')).toBe(true);
    expect(images.some(img => img.src === 'https://example.com/picture-source-1.webp')).toBe(true);
    expect(images.some(img => img.src === 'https://example.com/picture-fallback.png')).toBe(true);
  });
});

describe('Image CDN Checker', () => {
  it('should correctly identify CDN server from headers', () => {
    const HeadersClass = class {
      private map = new Map<string, string>();
      constructor(init: Record<string, string>) {
        for (const [k, v] of Object.entries(init)) {
          this.map.set(k.toLowerCase(), v);
        }
      }
      has(k: string) { return this.map.has(k.toLowerCase()); }
      get(k: string) { return this.map.get(k.toLowerCase()) || null; }
    };

    const headers1 = new HeadersClass({ 'cf-ray': '1234abcd' }) as any;
    const headers2 = new HeadersClass({ 'server': 'Cloudflare' }) as any;
    const headers3 = new HeadersClass({ 'server': 'Apache' }) as any;

    expect(checkIsCdn(headers1)).toBe(true);
    expect(checkIsCdn(headers2)).toBe(true);
    expect(checkIsCdn(headers3)).toBe(false);
  });
});

describe('Image Decoder (Sharp Metadata)', () => {
  it('should decode a valid image buffer', async () => {
    // 1x1 transparent WebP base64
    const base64WebP = 'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAADABAJ0BKgEAAQADADQlpAADcAD+/gbQAA==';
    const buffer = Buffer.from(base64WebP, 'base64');

    const record: ImageRecord = {
      src: 'https://example.com/test.webp',
      originalSrc: '/test.webp',
      isPreload: false,
      pages: ['https://example.com/'],
      statusCode: 200,
      contentType: 'image/webp',
    };

    await decodeImageMetadata(record, buffer);

    expect(record.decodeFailed).toBeFalsy();
    expect(record.decodedFormat).toBe('webp');
    expect(record.decodedWidth).toBe(1);
    expect(record.decodedHeight).toBe(1);
  });
});

describe('Image Audit Rules Engine', () => {
  it('should evaluate rules and generate expected findings', () => {
    const images: ImageRecord[] = [
      {
        src: 'https://example.com/large.jpg',
        originalSrc: '/large.jpg',
        isPreload: false,
        pages: ['https://example.com/'],
        statusCode: 200,
        bytes: 600 * 1024, // 600KB
        decodedFormat: 'jpeg',
        decodedWidth: 1200,
        decodedHeight: 800,
      },
      {
        src: 'https://example.com/missing-alt.png',
        originalSrc: '/missing-alt.png',
        isPreload: false,
        pages: ['https://example.com/'],
        statusCode: 200,
        bytes: 10 * 1024,
        decodedFormat: 'png',
        // alt is missing
      },
      {
        src: 'https://example.com/cls-risk.png',
        originalSrc: '/cls-risk.png',
        isPreload: false,
        pages: ['https://example.com/'],
        statusCode: 200,
        bytes: 15 * 1024,
        decodedFormat: 'png',
        // width and height and aspect-ratio missing
      }
    ];

    const context = { thresholdKb: 200, playwright: false };
    const findings = analyzeImages(images, context);

    // Rule: weight
    expect(findings.some(f => f.ruleId === 'image-weight' && f.severity === 'critical')).toBe(true);

    // Rule: alt
    expect(findings.some(f => f.ruleId === 'image-alt' && f.severity === 'warning')).toBe(true);

    // Rule: cls (missing dimensions)
    expect(findings.some(f => f.ruleId === 'image-cls' && f.severity === 'error')).toBe(true);
  });
});

describe('Image Scoring and Budget Calculator', () => {
  it('should score images and verify budgets correctly', () => {
    const images: ImageRecord[] = [
      {
        src: 'https://example.com/image1.png',
        originalSrc: '/image1.png',
        isPreload: false,
        pages: ['https://example.com/'],
        statusCode: 200,
        bytes: 50 * 1024, // 50KB
        decodedFormat: 'png',
        decodedWidth: 100,
        decodedHeight: 100,
      }
    ];

    const findings = [
      {
        ruleId: 'image-alt',
        imageSrc: 'https://example.com/image1.png',
        severity: 'warning' as const,
        message: 'Missing alt text',
        recommendation: 'Add alt text',
      }
    ];

    const result = calculateScoringAndBudgets(images, findings, {
      url: 'https://example.com/',
      mode: 'single',
      playwright: false,
      thresholdKb: 200,
    });

    // Score deduction: 100 - warning(10) = 90
    expect(result.summary.score).toBe(90);
    expect(result.summary.totalImages).toBe(1);
    expect(result.summary.totalBytes).toBe(50 * 1024);
    expect(result.summary.budgets.mobileBudgetPassed).toBe(true);
  });
});
