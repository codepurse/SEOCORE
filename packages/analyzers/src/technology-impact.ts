import { TechnologySummary, DetectedTechnology } from './technology-detector.js';

export interface TechnologyImpactEntry {
  technology: string;
  category: string;
  seoImpact: string[];
  performanceImpact: string[];
  aiVisibilityImpact: string[];
}

export interface Score {
  overall: number;
  renderingQuality: number;
  crawlability: number;
  performance: number;
  reasoning: string[];
}

export interface AiVisibility {
  level: 'high' | 'medium' | 'low';
  reasoning: string[];
}

export interface TechnologyAnalysisResult {
  url: string;
  checkedAt: string;
  summary: TechnologySummary;
  impacts: TechnologyImpactEntry[];
  score: Score;
  aiVisibility: AiVisibility;
}

export class TechnologyImpactAnalyzer {
  static analyze(summary: TechnologySummary, url: string): TechnologyAnalysisResult {
    const impacts: TechnologyImpactEntry[] = [];
    const allTechnologies: DetectedTechnology[] = [
      ...summary.frontendFramework,
      ...summary.renderingStrategy,
      ...summary.hosting,
      ...summary.cdn,
      ...summary.backend,
      ...summary.cms,
      ...summary.analytics,
      ...summary.uiLibraries,
      ...summary.buildTools,
      ...summary.fonts,
      ...summary.thirdPartyServices
    ];

    for (const tech of allTechnologies) {
      impacts.push(this.getImpact(tech));
    }

    const score = this.calculateScore(summary);
    const aiVisibility = this.calculateAiVisibility(summary, score);

    return {
      url,
      checkedAt: new Date().toISOString(),
      summary,
      impacts,
      score,
      aiVisibility
    };
  }

  private static getImpact(tech: DetectedTechnology): TechnologyImpactEntry {
    const impacts: Record<string, Omit<TechnologyImpactEntry, 'technology' | 'category'>> = {
      'Next.js': {
        seoImpact: [
          'Supports SSR/SSG which improves crawlability and content extraction',
          'Client-side hydration may delay full content availability'
        ],
        performanceImpact: [
          'Code-splitting can reduce initial JS bundle size',
          'Hydration overhead may affect TTI/INP'
        ],
        aiVisibilityImpact: ['Generally high, especially with SSR/SSG']
      },
      'Nuxt': {
        seoImpact: ['Supports SSR/SSG for improved crawlability'],
        performanceImpact: ['Similar performance considerations to Vue-based apps'],
        aiVisibilityImpact: ['Good visibility with server-side rendering']
      },
      'React': {
        seoImpact: ['If CSR-only, content extraction may degrade; use SSR/SSG for best results'],
        performanceImpact: ['Heavy JS bundles can affect performance'],
        aiVisibilityImpact: ['Medium if CSR-only, high with SSR']
      },
      'Vue': {
        seoImpact: ['Similar to React; SSR improves crawlability'],
        performanceImpact: ['JS bundle size considerations apply'],
        aiVisibilityImpact: ['Medium if CSR-only, high with SSR']
      },
      'WordPress': {
        seoImpact: ['Good base SEO features; depends on theme/plugins used'],
        performanceImpact: ['Can be slow without caching/optimization plugins'],
        aiVisibilityImpact: ['Generally high with well-structured themes']
      },
      'Webflow': {
        seoImpact: ['Visual builder that produces clean HTML'],
        performanceImpact: ['Hosted solution with good performance defaults'],
        aiVisibilityImpact: ['High visibility']
      },
      'Shopify': {
        seoImpact: ['E-commerce optimized platform'],
        performanceImpact: ['Hosted platform with good performance'],
        aiVisibilityImpact: ['High visibility']
      },
      'Cloudflare': {
        seoImpact: ['CDN improves availability, but misconfig can block crawlers'],
        performanceImpact: ['Caching and edge compute improve performance'],
        aiVisibilityImpact: ['High visibility with proper bot settings']
      },
      'Vercel': {
        seoImpact: ['Optimized for Next.js, good edge network'],
        performanceImpact: ['Fast edge delivery'],
        aiVisibilityImpact: ['High visibility']
      },
      'PHP': {
        seoImpact: ['Server-rendered by default, good for crawlability'],
        performanceImpact: ['Depends on implementation and hosting'],
        aiVisibilityImpact: ['High visibility']
      },
      'Express': {
        seoImpact: ['Flexible backend; SEO depends on frontend implementation'],
        performanceImpact: ['Lightweight, but performance depends on app code'],
        aiVisibilityImpact: ['Depends on rendering strategy']
      },
      'ASP.NET': {
        seoImpact: ['Supports server-rendered content'],
        performanceImpact: ['Enterprise-grade performance'],
        aiVisibilityImpact: ['High visibility']
      },
      'Google Tag Manager': {
        seoImpact: ['Does not directly affect SEO; can slow down page if misused'],
        performanceImpact: ['Additional JS execution, but manageable'],
        aiVisibilityImpact: ['No negative impact']
      },
      'Google Analytics': {
        seoImpact: ['No direct SEO impact'],
        performanceImpact: ['Minor overhead from tracking scripts'],
        aiVisibilityImpact: ['No negative impact']
      },
      'Microsoft Clarity': {
        seoImpact: ['No direct SEO impact'],
        performanceImpact: ['Minor script overhead'],
        aiVisibilityImpact: ['No negative impact']
      }
    };

    const base = impacts[tech.name] || {
      seoImpact: ['Impact depends on implementation'],
      performanceImpact: ['Performance depends on configuration'],
      aiVisibilityImpact: ['Visibility depends on rendering strategy']
    };

    return {
      technology: tech.name,
      category: tech.category,
      ...base
    };
  }

  private static calculateScore(summary: TechnologySummary): Score {
    let renderingQuality = 40;
    let crawlability = 30;
    let performance = 30;
    const reasoning: string[] = [];

    // Rendering quality checks
    const hasNextOrNuxt = summary.frontendFramework.some(t => t.name === 'Next.js' || t.name === 'Nuxt');
    const hasGenericReactVue = summary.frontendFramework.some(t => t.name === 'React' || t.name === 'Vue');
    const hasServerCms = summary.cms.some(t => ['WordPress', 'Webflow', 'Shopify'].includes(t.name));

    if (hasNextOrNuxt) {
      reasoning.push('Next.js/Nuxt detected: good rendering defaults');
    } else if (hasGenericReactVue) {
      renderingQuality -= 15;
      reasoning.push('Generic React/Vue detected: check if using SSR');
    } else if (hasServerCms) {
      reasoning.push('Server-rendered CMS detected: good for rendering');
    }

    // Crawlability checks
    const hasCloudflare = [...summary.hosting, ...summary.cdn].some(t => t.name === 'Cloudflare');
    if (hasCloudflare) {
      reasoning.push('Cloudflare detected: ensure crawlers are allowed');
    }

    // Performance checks
    const hasCdn = summary.cdn.length > 0;
    if (hasCdn) {
      reasoning.push('CDN detected: potential performance benefit');
    }
    const hasManyAnalytics = summary.analytics.length >= 2;
    if (hasManyAnalytics) {
      performance -= 5;
      reasoning.push('Multiple analytics tools: minor performance impact');
    }

    // Calculate overall
    const overall = Math.max(0, Math.min(100, renderingQuality + crawlability + performance));

    return {
      overall,
      renderingQuality,
      crawlability,
      performance,
      reasoning
    };
  }

  private static calculateAiVisibility(summary: TechnologySummary, score: Score): AiVisibility {
    const reasoning: string[] = [];
    let level: 'high' | 'medium' | 'low' = 'medium';

    if (score.renderingQuality >= 35) {
      level = 'high';
      reasoning.push('Strong rendering quality score');
    } else if (score.renderingQuality <= 25) {
      level = 'low';
      reasoning.push('Low rendering quality score');
    }

    if (summary.undetectable.some(u => u.toLowerCase().includes('backend'))) {
      reasoning.push('Backend technology unknown');
    }

    return {
      level,
      reasoning
    };
  }
}
