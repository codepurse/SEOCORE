import type { JsImpactDiff, Recommendation, JsImpactAspect } from '@seocore/sdk';

interface TipRule {
  id: string;
  priority: number;
  title: string;
  rationale: string;
  action: string;
  triggers: JsImpactAspect[];
  frameworkSpecific?: Record<string, string>;
}

const TIPS: TipRule[] = [
  {
    id: 'canonical-ssr',
    priority: 1,
    title: 'Serve canonical link in SSR/SSG',
    rationale: 'Canonical links should be present in the raw HTML so search engines can read them without executing JavaScript.',
    action: 'Ensure canonical links are rendered on the server and included in the initial HTML payload.',
    triggers: ['indexability.canonical'],
    frameworkSpecific: {
      react: 'Use React Helmet Async or Next.js next/head with SSR.',
      vue: 'Use vue-meta with SSR or Nuxt.js head config.',
      angular: 'Use Angular Universal and Meta service.',
      nextjs: 'Use next/head or the metadata API in Next.js 13+.',
      nuxtjs: 'Use useHead or head() in Nuxt 3.',
      sveltekit: 'Use svelte:head in SvelteKit server components.',
    },
  },
  {
    id: 'noindex-raw',
    priority: 1,
    title: 'Include noindex in raw HTML when needed',
    rationale: 'If a page should not be indexed, include the noindex directive in the raw HTML to ensure search engines see it immediately.',
    action: 'Add noindex in raw HTML, not only via client-side JavaScript.',
    triggers: ['indexability.metaRobots', 'indexability.xRobotsTag'],
    frameworkSpecific: {
      nextjs: 'Use the robots metadata option or response headers.',
      nuxtjs: 'Use useHead with robots or nuxt.config headers.',
    },
  },
  {
    id: 'content-ssr',
    priority: 1,
    title: 'Render main content on the server',
    rationale: 'Search engines prioritize content in the raw HTML. If your main content is injected client-side, it may not be indexed well.',
    action: 'Adopt SSR, SSG, or ISR to include main content in the initial payload.',
    triggers: ['content.wordCount', 'content.mainTextMissing'],
    frameworkSpecific: {
      react: 'Use Next.js (App Router or Pages Router) with SSR/SSG.',
      vue: 'Use Nuxt.js with SSR/SSG.',
      angular: 'Use Angular Universal.',
      svelte: 'Use SvelteKit with server-side rendering.',
    },
  },
  {
    id: 'metadata-ssr',
    priority: 2,
    title: 'Serve title and description via SSR',
    rationale: 'Social sharing and search snippets rely on raw meta tags. Client-side changes may not be picked up by all crawlers.',
    action: 'Ensure title and meta description are rendered in the raw HTML.',
    triggers: ['metadata.title', 'metadata.metaDescription'],
    frameworkSpecific: {
      nextjs: 'Use generateMetadata or metadata API in App Router.',
      nuxtjs: 'Use useHead or useSeoMeta in Nuxt.',
    },
  },
  {
    id: 'og-twitter-raw',
    priority: 2,
    title: 'Include OpenGraph and Twitter tags in raw HTML',
    rationale: 'Social platforms (Facebook, Twitter/X, LinkedIn) do not execute JavaScript when generating link previews.',
    action: 'Ensure OpenGraph and Twitter Card tags are present in the raw HTML.',
    triggers: ['metadata.openGraph', 'metadata.twitter'],
  },
  {
    id: 'headings-ssr',
    priority: 2,
    title: 'Render heading structure on server',
    rationale: 'Heading hierarchy is important for SEO. If H1 and subheadings are only in the rendered DOM, search engines may miss them.',
    action: 'Ensure H1-H6 headings are present in the raw HTML.',
    triggers: ['headings.h1', 'headings.set'],
  },
  {
    id: 'links-internal-raw',
    priority: 2,
    title: 'Include internal links in raw HTML',
    rationale: 'Internal links help search engines discover and crawl your site. Links only present after JS may not be followed.',
    action: 'Ensure important internal navigation links are in the raw HTML.',
    triggers: ['links.internal', 'links.onlyInRendered'],
  },
  {
    id: 'structured-data-ssr',
    priority: 2,
    title: 'Serve JSON-LD in raw HTML',
    rationale: 'Rich snippets rely on structured data. JSON-LD injected after hydration may be ignored by some crawlers.',
    action: 'Include JSON-LD in the raw HTML on the server.',
    triggers: ['structuredData.jsonLd'],
    frameworkSpecific: {
      nextjs: 'Use next-schema or render JSON-LD in server components.',
      nuxtjs: 'Use nuxt-schema-org or render JSON-LD with useHead.',
    },
  },
  {
    id: 'hreflang-raw',
    priority: 2,
    title: 'Include hreflang tags in raw HTML',
    rationale: 'hreflang annotations tell search engines which language/region version to serve. They need to be in raw HTML.',
    action: 'Ensure hreflang tags are present in the raw HTML.',
    triggers: ['hreflang'],
  },
  {
    id: 'fix-js-errors',
    priority: 2,
    title: 'Fix JavaScript errors during hydration',
    rationale: 'Uncaught JS errors can break hydration and prevent your app from rendering fully for search engines.',
    action: 'Investigate and fix console errors and failed network requests.',
    triggers: ['jsErrors'],
  },
  {
    id: 'unblock-resources',
    priority: 1,
    title: 'Allow Googlebot to fetch critical resources',
    rationale: 'If Googlebot cannot fetch your JS/CSS, it may not render your page correctly, affecting indexing.',
    action: 'Update robots.txt and CSP to allow Googlebot to fetch critical assets.',
    triggers: ['resourceBlocked'],
  },
];

export function generateRecommendations(
  diffs: JsImpactDiff[],
  framework?: string
): Recommendation[] {
  const matchingRules = new Map<string, TipRule>();

  for (const diff of diffs) {
    for (const tip of TIPS) {
      if (tip.triggers.includes(diff.aspect)) {
        if (!matchingRules.has(tip.id)) {
          matchingRules.set(tip.id, tip);
        }
      }
    }
  }

  return Array.from(matchingRules.values())
    .sort((a, b) => a.priority - b.priority)
    .map((rule): Recommendation => {
      let frameworkSpecificText: string | undefined;
      if (framework && rule.frameworkSpecific) {
        frameworkSpecificText = rule.frameworkSpecific[framework];
      }
      return {
        id: rule.id,
        priority: rule.priority,
        title: rule.title,
        rationale: rule.rationale,
        action: rule.action,
        relatedAspects: rule.triggers,
        frameworkSpecific: frameworkSpecificText,
      };
    });
}

export function detectFrameworkHint(rawHtml: string, renderedHtml?: string): string | undefined {
  const html = renderedHtml || rawHtml;

  // Check more specific frameworks first
  const orderedPatterns: Array<{ framework: string; pattern: RegExp }> = [
    { framework: 'nextjs', pattern: /__NEXT_DATA__|_next\/static/ },
    { framework: 'nuxtjs', pattern: /__NUXT__|_nuxt\// },
    { framework: 'sveltekit', pattern: /__sveltekit_/ },
    { framework: 'gatsby', pattern: /___gatsby|gatsby-plugin/ },
    { framework: 'remix', pattern: /__remix|remix-run/ },
    { framework: 'angular', pattern: /<app-root|<ng-/, },
    { framework: 'react', pattern: /<div[^>]*id="(root|__next)"|<script[^>]*src=".*react/, },
    { framework: 'vue', pattern: /<div[^>]*id="app"|<script[^>]*src=".*vue/, },
  ];

  for (const { framework, pattern } of orderedPatterns) {
    if (pattern.test(html)) {
      return framework;
    }
  }

  return undefined;
}
