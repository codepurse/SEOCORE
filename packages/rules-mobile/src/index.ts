import type {
  Finding,
  NormalizedPage,
  Rule,
  RuleDefinition,
  RuleEvaluationContext,
  Severity,
} from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';
import * as cheerio from 'cheerio';
import {
  MOBILE_INDEXING_READINESS_SUBCHECKS,
  MOBILE_PERFORMANCE_SUBCHECKS,
  MOBILE_RESPONSIVE_DESIGN_SUBCHECKS,
  MOBILE_SUBCHECKS,
  MOBILE_USABILITY_SUBCHECKS,
  type MobileSubCheck,
} from './sub-checks.js';

function createMobileFinding(
  definition: RuleDefinition,
  url: string,
  subCheck: MobileSubCheck,
  severity: Severity,
  message: string,
  recommendation: string,
  evidence?: string,
): Finding {
  return {
    id: createFindingId(definition.id, url, subCheck),
    ruleId: definition.id,
    subCheck,
    severity,
    category: definition.category,
    url,
    message,
    recommendation,
    evidence,
    documentationLink: definition.documentationLink,
  };
}

export class MobileUsabilityRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-usability',
    name: 'Mobile Usability Evaluation',
    description: 'Evaluates the mobile usability parameters including viewport configuration, layout responsiveness, navigation usability, and interactive elements tap targets.',
    category: 'mobile_seo',
    module: 'mobile',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-usability',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const $ = page.html ? cheerio.load(page.html) : null;

    if (!page.viewport) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_USABILITY_SUBCHECKS.MISSING_VIEWPORT,
          'critical',
          'Viewport meta tag is missing from the page.',
          'Add a <meta name="viewport" content="width=device-width, initial-scale=1.0"> tag inside the <head> element to ensure proper layout scale on mobile devices.',
        ),
      );
    } else {
      const viewport = page.viewport.toLowerCase();
      if (!viewport.includes('width=device-width') && !viewport.includes('initial-scale=')) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_USABILITY_SUBCHECKS.INVALID_VIEWPORT,
            'warning',
            `Viewport meta tag exists but may be invalid or restrictive: "${page.viewport}".`,
            'Configure viewport setting to use "width=device-width, initial-scale=1" for flexible responsiveness without restricting user zoom.',
            `Current viewport: "${page.viewport}"`,
          ),
        );
      }
    }

    if ($) {
      const largeFixedElements: string[] = [];
      let inlineStylesCount = 0;

      $('[style]').each((_, el) => {
        inlineStylesCount += 1;
        const style = $(el).attr('style') || '';
        const widthMatch = style.match(/width:\s*(\d+)px/);
        if (!widthMatch) {
          return;
        }

        const widthVal = parseInt(widthMatch[1], 10);
        if (widthVal > 480) {
          largeFixedElements.push(`${el.name}[style*="width: ${widthVal}px"]`);
        }
      });

      if (inlineStylesCount === 0) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_USABILITY_SUBCHECKS.NO_INLINE_STYLES,
            'warning',
            'No inline styles found — layout sub-checks score 0, mark UNVERIFIABLE',
            'Add inline styles or CSS elements to verify layout responsiveness.',
          ),
        );
      } else if (largeFixedElements.length > 0) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_USABILITY_SUBCHECKS.FIXED_WIDTH,
            'warning',
            `Responsive layout hazard: Page contains ${largeFixedElements.length} elements with fixed pixel widths larger than typical mobile viewports (>480px).`,
            'Replace fixed-width styles with relative units (e.g. 100%, max-width: 100%, or vw) to avoid content overflows and horizontal scrolling on mobile viewports.',
            `Found elements: ${largeFixedElements.slice(0, 3).join(', ')}`,
          ),
        );
      }

      const hasNavElement = $('nav, [class*="nav"], [id*="nav"], [class*="menu"], [id*="menu"]').length > 0;
      if (!hasNavElement) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_USABILITY_SUBCHECKS.NO_NAV_ELEMENT,
            'warning',
            'No nav element found — nav sub-checks score 0',
            'Ensure structural navigation tags (<nav> or navigation classes) are present on mobile devices.',
          ),
        );
      } else {
        const linkCount = page.links.length;
        if (linkCount > 10) {
          const navHtml = $('body').html() || '';
          const hasMobileNavKeyword = /hamburger|menu-toggle|mobile-nav|nav-toggle|btn-menu|drawer|toggle-menu/i.test(navHtml);
          if (!hasMobileNavKeyword) {
            findings.push(
              createMobileFinding(
                this.definition,
                page.url,
                MOBILE_USABILITY_SUBCHECKS.POOR_NAVIGATION,
                'warning',
                'Navigation may be difficult to use on small viewports (no mobile-responsive navigation toggle detected).',
                'Implement a mobile-friendly collapsing navigation menu (hamburger menu / drawer) for viewports below 768px.',
                `Page has ${linkCount} links but lacks visible responsive menu keywords.`,
              ),
            );
          }
        }
      }

      let tinyTapTargets = 0;
      let totalInteractiveElements = 0;
      $('button, a').each((_, el) => {
        totalInteractiveElements += 1;
        const style = $(el).attr('style') || '';
        if (/padding:\s*0px|padding:\s*0(?!\d)|padding-top:\s*0|padding-bottom:\s*0/i.test(style)) {
          tinyTapTargets += 1;
        }
      });

      if (totalInteractiveElements === 0) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_USABILITY_SUBCHECKS.NO_TAP_TARGETS,
            'warning',
            'No interactive tap targets found — usability sub-checks score 0, mark UNVERIFIABLE',
            'Ensure standard interactive components exist to verify tap spacing.',
          ),
        );
      } else if (tinyTapTargets > 3) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_USABILITY_SUBCHECKS.TAP_TARGET,
            'warning',
            `Found multiple tiny or cramped interactive tap targets (${tinyTapTargets} elements with zero padding).`,
            'Ensure all interactive elements (buttons, links, form inputs) are at least 48x48px in size, or have sufficient padding/spacing to prevent accidental taps.',
            `Detected ${tinyTapTargets} links/buttons with zero/minimal padding styles.`,
          ),
        );
      }
    } else {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_USABILITY_SUBCHECKS.UNVERIFIABLE_USABILITY,
          'warning',
          'Unverifiable from static crawl — scored 0',
          'Ensure page HTML is valid and readable.',
        ),
      );
    }

    return findings;
  }
}

export class MobilePerformanceRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-performance',
    name: 'Mobile Core Web Vitals & Performance',
    description: 'Evaluates simulated Core Web Vitals (LCP, CLS) and page resources weight scaled for mobile conditions.',
    category: 'mobile_seo',
    module: 'mobile',
    defaultSeverity: 'warning',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-performance',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const isVerifiable = context.config.playwrightEnabled;

    if (!isVerifiable) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_LCP,
          'warning',
          'LCP/FID/INP metrics: Unverifiable from static crawl — scored 0',
          'Enable Playwright crawl to gather real-time performance data and Core Web Vitals.',
        ),
      );
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_CLS,
          'warning',
          'Layout shift behavior: Unverifiable from static crawl — scored 0',
          'Enable Playwright crawl to inspect real Cumulative Layout Shift.',
        ),
      );
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_JS_EXECUTION,
          'warning',
          'JS execution time: Unverifiable from static crawl — scored 0',
          'Enable Playwright crawl to measure main thread JS execution CPU times.',
        ),
      );
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_PERFORMANCE_SUBCHECKS.UNVERIFIABLE_IMAGE_LOAD,
          'warning',
          'Real image load performance: Unverifiable from static crawl — scored 0',
          'Enable Playwright crawl to check image network load performance.',
        ),
      );
    } else if (page.coreWebVitals) {
      const mobileLcp = page.coreWebVitals.lcp * 1.5;
      if (mobileLcp > 4000) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.POOR_LCP,
            'error',
            `Slow Largest Contentful Paint under mobile conditions: ${(mobileLcp / 1000).toFixed(2)}s (Threshold: <2.5s).`,
            'Optimize your mobile critical rendering path: minimize render-blocking resources, defer non-essential JS, compress and size hero images, and leverage server-side caching.',
            `Simulated Mobile LCP: ${Math.round(mobileLcp)}ms (derived from raw load time ${page.loadTimeMs}ms)`,
          ),
        );
      } else if (mobileLcp > 2500) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.NEEDS_IMPROVEMENT_LCP,
            'warning',
            `Largest Contentful Paint under mobile conditions needs improvement: ${(mobileLcp / 1000).toFixed(2)}s (Threshold: <2.5s).`,
            'Optimize hero element loading speed. Preload primary images and avoid loading heavy stylesheets before the main content is parsed.',
            `Simulated Mobile LCP: ${Math.round(mobileLcp)}ms`,
          ),
        );
      }

      const cls = page.coreWebVitals.cls;
      if (cls > 0.25) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.POOR_CLS,
            'error',
            `Poor Cumulative Layout Shift (CLS) on mobile viewports: ${cls} (Threshold: <0.10).`,
            'Always reserve static space for images, advertisements, and interactive widgets. Specify explicit width and height attributes or use CSS aspect-ratio properties.',
            `Mobile CLS: ${cls}`,
          ),
        );
      } else if (cls > 0.1) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.NEEDS_IMPROVEMENT_CLS,
            'warning',
            `Cumulative Layout Shift (CLS) on mobile viewports needs improvement: ${cls} (Threshold: <0.10).`,
            'Avoid inserting dynamic components (banners, dialogs) above existing content after page load unless triggered by user interaction.',
            `Mobile CLS: ${cls}`,
          ),
        );
      }
    }

    if (!page.images || page.images.length === 0) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_PERFORMANCE_SUBCHECKS.NO_IMAGES_FOUND,
          'warning',
          'No images detected to evaluate',
          'Include relevant images on your mobile page to evaluate optimization.',
        ),
      );
    }

    if (page.resources) {
      const { jsSizeBytes, imageSizeBytes, jsRequests, cssRequests } = page.resources;

      if (jsSizeBytes > 1000000) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.EXCESSIVE_JS,
            'error',
            `Excessive JavaScript payload size for mobile CPUs: ${(jsSizeBytes / 1024).toFixed(1)}KB.`,
            'Reduce code bloat. Strip unused third-party libraries, configure code-splitting, lazy-load JS bundles, and use modern lightweight alternatives where possible.',
            `JS total payload: ${jsSizeBytes} bytes`,
          ),
        );
      } else if (jsSizeBytes > 500000) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.HEAVY_JS,
            'warning',
            `Heavy JavaScript payload size for mobile viewports: ${(jsSizeBytes / 1024).toFixed(1)}KB.`,
            'Optimize bundle size and run performance profiling to minimize mobile main-thread CPU blockages.',
            `JS total payload: ${jsSizeBytes} bytes`,
          ),
        );
      }

      if (page.images && page.images.length > 0 && imageSizeBytes > 1500000 && page.images.length > 5) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.HEAVY_IMAGES,
            'warning',
            `Heavy image payload size for mobile networks: ${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB.`,
            'Serve modern responsive images. Compress assets and use next-gen formats (WebP, AVIF), and specify srcset to deliver appropriately sized images for mobile viewports.',
            `Images total payload: ${imageSizeBytes} bytes for ${page.images.length} assets`,
          ),
        );
      }

      const renderBlockingCount = jsRequests + cssRequests;
      if (renderBlockingCount > 15) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_PERFORMANCE_SUBCHECKS.RENDER_BLOCKING,
            'warning',
            `High count of critical render-blocking styles/scripts: ${renderBlockingCount} files loaded.`,
            'Consolidate multiple small CSS/JS files, inline critical styles, and add async/defer tags to non-essential JavaScript to unblock rendering on mobile devices.',
            `${cssRequests} stylesheet(s) and ${jsRequests} script(s) requested`,
          ),
        );
      }
    }

    return findings;
  }
}

export class MobileResponsiveDesignRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-responsive',
    name: 'Responsive Design Quality',
    description: 'Evaluates responsive styles, media queries, fluid layouts, and mobile breakpoints.',
    category: 'mobile_seo',
    module: 'mobile',
    defaultSeverity: 'warning',
    defaultWeight: 5,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-responsive',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled || !page.html) return [];

    const findings: Finding[] = [];
    const $ = cheerio.load(page.html);
    const isVerifiable = context.config.playwrightEnabled;

    if (!isVerifiable) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.UNVERIFIABLE_BREAKPOINTS,
          'warning',
          'Actual breakpoint rendering: Unverifiable from static crawl — scored 0',
          'Enable Playwright crawl to perform actual mobile viewport breakpoint rendering validation.',
        ),
      );
    }

    let styleBlockContent = '';
    $('style').each((_, el) => {
      styleBlockContent += $(el).html() || '';
    });

    const hasMediaQueries = /@media/i.test(styleBlockContent);
    let hasResponsiveLink = false;
    $('link[rel="stylesheet"]').each((_, el) => {
      const media = $(el).attr('media');
      if (media && /screen|width/i.test(media)) {
        hasResponsiveLink = true;
      }
    });

    if (!hasMediaQueries && !hasResponsiveLink) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.MISSING_MEDIA_QUERIES,
          'error',
          'No CSS media queries detected on the page structure.',
          'Implement CSS media queries (e.g. @media (max-width: 768px)) to adjust layout styles dynamically depending on device screen sizes.',
          'Zero @media queries or responsive link media tags found in page HTML.',
        ),
      );
    }

    const hasFixedContainers = /body\s*\{\s*width:\s*\d{3,}px|#container\s*\{\s*width:\s*\d{3,}px|\.wrapper\s*\{\s*width:\s*\d{3,}px/i.test(styleBlockContent);
    if (hasFixedContainers) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.FIXED_LAYOUT,
          'warning',
          'Detected fixed-width declarations for primary body/container wrappers in style blocks.',
          'Migrate layout containers to fluid dimensions (e.g. width: 100%, max-width: 1200px) instead of fixed widths.',
          'Detected pixel-based fixed layout container patterns in style blocks.',
        ),
      );
    }

    if (hasMediaQueries) {
      const hasStandardBreakpoints = /768|480|320|600/i.test(styleBlockContent);
      if (!hasStandardBreakpoints) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_RESPONSIVE_DESIGN_SUBCHECKS.MISSING_BREAKPOINTS,
            'warning',
            'Media queries exist but lack common mobile-responsive breakpoints (e.g., 320px, 480px, 768px).',
            'Ensure media queries cover common mobile target device widths (320px for small mobile, 480px for landscape mobile, 768px for tablet).',
            'Custom breakpoints do not align with standard mobile viewport targets.',
          ),
        );
      }
    }

    return findings;
  }
}

export class MobileIndexingReadinessRule implements Rule {
  definition: RuleDefinition = {
    id: 'mobile-indexing',
    name: 'Mobile-First Indexing Readiness',
    description: 'Ensures structured data, canonical settings, and critical page content are indexable and consistent on mobile.',
    category: 'mobile_seo',
    module: 'mobile',
    defaultSeverity: 'warning',
    defaultWeight: 3,
    documentationLink: 'https://seocore.dev/docs/rules/mobile-indexing',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled } = getRuleSettings(this.definition, context.config);
    if (!enabled) return [];

    const findings: Finding[] = [];
    const $ = page.html ? cheerio.load(page.html) : null;

    if ($) {
      let hiddenCriticalContent = 0;
      $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        if (/display:\s*none/i.test(style)) {
          const textLength = $(el).text().trim().length;
          if (textLength > 200) {
            hiddenCriticalContent += 1;
          }
        }
      });

      if (hiddenCriticalContent > 0) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_INDEXING_READINESS_SUBCHECKS.HIDDEN_CONTENT,
            'warning',
            'Large blocks of content are hidden via "display: none" inline styles.',
            'Ensure critical content is consistent across mobile and desktop. Avoid hiding important information on mobile, as search engines index pages based on mobile-first rendering.',
            `Found ${hiddenCriticalContent} element(s) with display:none containing >200 characters.`,
          ),
        );
      }
    }

    const hasSyntaxError = page.structuredData.some((sd) => sd.__error !== undefined);
    if (!page.structuredData || page.structuredData.length === 0 || hasSyntaxError) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_INDEXING_READINESS_SUBCHECKS.MISSING_SCHEMA,
          'warning',
          'Structured schema markup is missing or invalid on mobile.',
          'Google indexing is entirely mobile-first. Schema.org structured data (JSON-LD) must be present and syntactically valid on the mobile rendering to appear in mobile search results.',
          page.structuredData.length === 0 ? 'No structured data' : 'Syntax error in structured data',
        ),
      );
    }

    if (!page.canonical) {
      findings.push(
        createMobileFinding(
          this.definition,
          page.url,
          MOBILE_INDEXING_READINESS_SUBCHECKS.MISSING_CANONICAL,
          'warning',
          'Missing canonical URL link element.',
          'Add a self-referential <link rel="canonical" href="..."> to prevent duplicate indexing across desktop and mobile URL versions.',
        ),
      );
    } else {
      const pageUrlClean = page.url.replace(/\/$/, '').toLowerCase();
      const canonicalUrlClean = page.canonical.replace(/\/$/, '').toLowerCase();
      if (pageUrlClean !== canonicalUrlClean) {
        findings.push(
          createMobileFinding(
            this.definition,
            page.url,
            MOBILE_INDEXING_READINESS_SUBCHECKS.CANONICAL_MISMATCH,
            'warning',
            `Non-self-referential canonical detected: canonical points to "${page.canonical}".`,
            'Ensure the mobile and desktop URLs are correctly canonicalized. For responsive design, the canonical URL should point to itself.',
            `URL: ${page.url} vs Canonical: ${page.canonical}`,
          ),
        );
      }
    }

    return findings;
  }
}

export function getMobileRules(): Rule[] {
  return [
    new MobileUsabilityRule(),
    new MobilePerformanceRule(),
    new MobileResponsiveDesignRule(),
    new MobileIndexingReadinessRule(),
  ];
}

export { MOBILE_SUBCHECKS };
export * from './sub-checks.js';
