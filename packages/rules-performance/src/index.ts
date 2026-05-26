import type { NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { BaseRule, type PartialFinding, type RuleSettings } from '@seocore/rule-utils';
import * as cheerio from 'cheerio';

export class LowPerformanceScoreRule extends BaseRule {
  definition: RuleDefinition = {
    id: 'low-performance-score',
    name: 'Low Performance Score',
    description: 'Checks if the simulated or real Lighthouse performance score is below 80.',
    category: 'performance',
    module: 'performance',
    requires: ['lighthouse'],
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/low-performance-score',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    if (page.performanceScore === undefined) {
      return [];
    }

    if (page.performanceScore < 50) {
      return [
        {
          url: page.url,
          subCheck: 'critical',
          severity: 'error',
          message: `Page performance score is critically low (${page.performanceScore}/100).`,
          recommendation: 'Optimize resource sizes, reduce unused JavaScript, and optimize image formatting.',
          evidence: `Performance score: ${page.performanceScore}`,
        },
      ];
    }

    if (page.performanceScore < 80) {
      return [
        {
          url: page.url,
          subCheck: 'warning',
          severity: 'warning',
          message: `Page performance score is low (${page.performanceScore}/100).`,
          recommendation: 'Look into caching, stylesheet minification, and modern web format image loading (WebP/AVIF).',
          evidence: `Performance score: ${page.performanceScore}`,
        },
      ];
    }

    return [];
  }
}

export class LcpMetricRule extends BaseRule {
  definition: RuleDefinition = {
    id: 'lcp-metric',
    name: 'Slow Largest Contentful Paint (LCP)',
    description: 'Verifies the Largest Contentful Paint is under 2.5 seconds.',
    category: 'performance',
    module: 'performance',
    requires: ['lighthouse'],
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/lcp-metric',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    if (!page.coreWebVitals) {
      return [];
    }

    const { lcp } = page.coreWebVitals;

    if (lcp > 4000) {
      return [
        {
          url: page.url,
          subCheck: 'poor',
          severity: 'error',
          message: `Largest Contentful Paint is poor: ${(lcp / 1000).toFixed(2)}s (Threshold: < 2.5s).`,
          recommendation: 'Speed up server response time (TTFB), optimize image files, and eliminate render-blocking JS/CSS.',
          evidence: `LCP: ${lcp}ms`,
        },
      ];
    }

    if (lcp > 2500) {
      return [
        {
          url: page.url,
          subCheck: 'needs-improvement',
          message: `Largest Contentful Paint needs improvement: ${(lcp / 1000).toFixed(2)}s (Threshold: < 2.5s).`,
          recommendation: 'Optimize your critical rendering path and defer non-essential scripts.',
          evidence: `LCP: ${lcp}ms`,
        },
      ];
    }

    return [];
  }
}

export class ClsMetricRule extends BaseRule {
  definition: RuleDefinition = {
    id: 'cls-metric',
    name: 'High Cumulative Layout Shift (CLS)',
    description: 'Verifies the Cumulative Layout Shift is under 0.1.',
    category: 'performance',
    module: 'performance',
    requires: ['lighthouse'],
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/cls-metric',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    if (!page.coreWebVitals) {
      return [];
    }

    const { cls } = page.coreWebVitals;

    if (cls > 0.25) {
      return [
        {
          url: page.url,
          subCheck: 'poor',
          severity: 'error',
          message: `Cumulative Layout Shift is poor: ${cls} (Threshold: < 0.1).`,
          recommendation: 'Ensure all <img>, <video>, and <iframe;> elements have explicit width and height attributes set.',
          evidence: `CLS: ${cls}`,
        },
      ];
    }

    if (cls > 0.1) {
      return [
        {
          url: page.url,
          subCheck: 'needs-improvement',
          message: `Cumulative Layout Shift needs improvement: ${cls} (Threshold: < 0.1).`,
          recommendation: 'Reserve static space for dynamic content like ads or sliders to avoid unexpected layout jumps.',
          evidence: `CLS: ${cls}`,
        },
      ];
    }

    return [];
  }
}

export class ResourceSizeRule extends BaseRule {
  definition: RuleDefinition = {
    id: 'heavy-resources',
    name: 'Heavy Page Resource Payload',
    description: 'Checks if page HTML size or total CSS/JS payload exceeds thresholds.',
    category: 'performance',
    module: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 4,
    documentationLink: 'https://seocore.dev/docs/rules/heavy-resources',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    if (!page.resources) {
      return [];
    }

    const { pageSizeBytes, jsSizeBytes, totalRequests } = page.resources;
    const findings: PartialFinding[] = [];

    if (pageSizeBytes > 150000) {
      findings.push({
        url: page.url,
        subCheck: 'html-size',
        severity: 'warning',
        message: `HTML page weight is heavy: ${(pageSizeBytes / 1024).toFixed(1)}KB.`,
        recommendation: 'Reduce DOM node count, eliminate inline scripts and CSS, and enable Gzip/Brotli compression.',
        evidence: `HTML size: ${pageSizeBytes} bytes`,
      });
    }

    if (jsSizeBytes > 500000) {
      findings.push({
        url: page.url,
        subCheck: 'js-size',
        severity: 'warning',
        message: `JavaScript weight is heavy: ${(jsSizeBytes / 1024).toFixed(1)}KB.`,
        recommendation: 'Audit third-party scripts, lazy-load non-critical bundles, and minify/compress production code.',
        evidence: `JS size: ${jsSizeBytes} bytes`,
      });
    }

    if (totalRequests > 50) {
      findings.push({
        url: page.url,
        subCheck: 'request-count',
        severity: 'info',
        message: `High subresource request count: ${totalRequests} files loaded.`,
        recommendation: 'Combine stylesheets/scripts, use sprite sheets, or lazy-load images to minimize roundtrips.',
        evidence: `Total requests: ${totalRequests}`,
      });
    }

    return findings;
  }
}

export class CachingHeadersRule extends BaseRule {
  definition: RuleDefinition = {
    id: 'caching-headers',
    name: 'Caching Headers Assessment',
    description: 'Checks for caching headers like Cache-Control and ETag to optimize performance.',
    category: 'performance',
    module: 'performance',
    defaultSeverity: 'info',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/caching-headers',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const findings: PartialFinding[] = [];
    const headerKeys = new Set(Object.keys(page.headers ?? {}).map((key) => key.toLowerCase()));

    if (!headerKeys.has('cache-control')) {
      findings.push({
        url: page.url,
        subCheck: 'missing-cache-control',
        message: 'Page is missing Cache-Control header.',
        recommendation: 'Add a Cache-Control header to optimize caching strategy.',
      });
    }

    if (!headerKeys.has('etag')) {
      findings.push({
        url: page.url,
        subCheck: 'missing-etag',
        message: 'Page is missing ETag header.',
        recommendation: 'Add an ETag header to enable efficient bandwidth usage with conditional requests.',
      });
    }

    return findings;
  }
}

export class ImageOptimizationRule extends BaseRule {
  definition: RuleDefinition = {
    id: 'image-optimization',
    name: 'Image Optimization Assessment',
    description: 'Checks images for missing dimensions, lazy loading, modern formats, srcset, and display size mismatch.',
    category: 'performance',
    module: 'performance',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/image-optimization',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    if (!page.html) {
      return [];
    }

    const findings: PartialFinding[] = [];
    const $ = cheerio.load(page.html);
    const images = $('img');

    if (images.length === 0) {
      return findings;
    }

    let missingDimensionsCount = 0;
    let noLazyLoadingCount = 0;
    let noModernFormatCount = 0;
    let missingSrcsetCount = 0;

    images.each((_, element) => {
      const src = $(element).attr('src') || '';
      const width = $(element).attr('width');
      const height = $(element).attr('height');
      const loading = $(element).attr('loading');
      const srcset = $(element).attr('srcset');

      if (!width || !height) {
        missingDimensionsCount++;
      }

      if (loading?.toLowerCase() !== 'lazy') {
        noLazyLoadingCount++;
      }

      if (!/\.(webp|avif)$/i.test(src)) {
        noModernFormatCount++;
      }

      if (!srcset) {
        missingSrcsetCount++;
      }
    });

    if (missingDimensionsCount > 0) {
      findings.push({
        url: page.url,
        subCheck: 'missing-dimensions',
        severity: 'warning',
        message: `${missingDimensionsCount} image(s) missing width/height attributes.`,
        recommendation: 'Add explicit width and height attributes to all images to prevent CLS.',
        evidence: `${missingDimensionsCount} images without dimensions`,
      });
    }

    if (noLazyLoadingCount > 0) {
      findings.push({
        url: page.url,
        subCheck: 'no-lazy-loading',
        severity: 'info',
        message: `${noLazyLoadingCount} image(s) missing loading="lazy" attribute.`,
        recommendation: 'Add loading="lazy" to offscreen images to improve page load times.',
        evidence: `${noLazyLoadingCount} images without lazy loading`,
      });
    }

    if (noModernFormatCount > 0) {
      findings.push({
        url: page.url,
        subCheck: 'no-modern-format',
        severity: 'info',
        message: `${noModernFormatCount} image(s) not using WebP or AVIF format.`,
        recommendation: 'Serve images in modern formats like WebP or AVIF for smaller file sizes.',
        evidence: `${noModernFormatCount} images in legacy formats`,
      });
    }

    if (missingSrcsetCount > 0) {
      findings.push({
        url: page.url,
        subCheck: 'missing-srcset',
        severity: 'info',
        message: `${missingSrcsetCount} image(s) missing srcset attribute.`,
        recommendation: 'Add srcset to serve appropriately sized images for different viewports.',
        evidence: `${missingSrcsetCount} images without srcset`,
      });
    }

    return findings;
  }
}

export function getPerformanceRules(): Rule[] {
  return [
    new LowPerformanceScoreRule(),
    new LcpMetricRule(),
    new ClsMetricRule(),
    new ResourceSizeRule(),
    new CachingHeadersRule(),
    new ImageOptimizationRule(),
  ];
}
