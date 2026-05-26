import { TechnologyContext } from './technology-context.js';
import { TechnologyCategory } from './technology-detector.js';

export interface WeightedEvidence {
  detail: string;
  weight: number;
}

export interface TechSignature {
  technology: string;
  category: TechnologyCategory;
  suppresses?: string[];
  minimumConfidence?: number;
  match(context: TechnologyContext): WeightedEvidence[];
}

const signal = (detail: string, weight: number): WeightedEvidence => ({ detail, weight });

const headerContains = (ctx: TechnologyContext, header: string, value: string): boolean =>
  (ctx.headers[header] || '').toLowerCase().includes(value.toLowerCase());

const anyUrlIncludes = (urls: string[], fragments: string[]): string | undefined => {
  const lowerFragments = fragments.map(fragment => fragment.toLowerCase());
  return urls.find(url => lowerFragments.some(fragment => url.toLowerCase().includes(fragment)));
};

const anyTextIncludes = (texts: string[], fragments: string[]): string | undefined => {
  const lowerFragments = fragments.map(fragment => fragment.toLowerCase());
  return texts.find(text => lowerFragments.some(fragment => text.toLowerCase().includes(fragment)));
};

const htmlIncludes = (ctx: TechnologyContext, fragment: string): boolean =>
  ctx.htmlLower.includes(fragment.toLowerCase());

const htmlMatches = (ctx: TechnologyContext, pattern: RegExp): boolean => pattern.test(ctx.html);

const generatorIncludes = (ctx: TechnologyContext, value: string): boolean =>
  (ctx.metaGenerator || '').toLowerCase().includes(value.toLowerCase());

export const techSignatures: TechSignature[] = [
  {
    technology: 'Next.js',
    category: 'frontendFramework',
    suppresses: ['React'],
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, '__next_data__')) evidence.push(signal('Found `__NEXT_DATA__` bootstrap payload', 60));
      if (anyUrlIncludes(ctx.assetUrls, ['/_next/static/', '/_next/image'])) evidence.push(signal('Found Next.js asset path (`/_next/...`)', 45));
      if (headerContains(ctx, 'x-powered-by', 'next.js')) evidence.push(signal('Header `x-powered-by` reports Next.js', 55));
      if (htmlIncludes(ctx, 'self.__next_f.push')) evidence.push(signal('Found App Router stream marker `self.__next_f.push`', 45));
      return evidence;
    }
  },
  {
    technology: 'Nuxt',
    category: 'frontendFramework',
    suppresses: ['Vue'],
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, '__nuxt__')) evidence.push(signal('Found `__NUXT__` payload', 60));
      if (htmlIncludes(ctx, 'id="__nuxt"')) evidence.push(signal('Found Nuxt root container `#__nuxt`', 40));
      if (anyUrlIncludes(ctx.assetUrls, ['/_nuxt/'])) evidence.push(signal('Found Nuxt asset path (`/_nuxt/...`)', 45));
      return evidence;
    }
  },
  {
    technology: 'Astro',
    category: 'frontendFramework',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, 'astro-island')) evidence.push(signal('Found `astro-island` component marker', 60));
      if (anyUrlIncludes(ctx.assetUrls, ['/_astro/'])) evidence.push(signal('Found Astro asset path (`/_astro/...`)', 35));
      return evidence;
    }
  },
  {
    technology: 'React',
    category: 'frontendFramework',
    minimumConfidence: 60,
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, 'data-reactroot')) evidence.push(signal('Found React hydration marker `data-reactroot`', 60));
      if (htmlIncludes(ctx, 'react-dom')) evidence.push(signal('Found `react-dom` reference in page source', 35));
      return evidence;
    }
  },
  {
    technology: 'Vue',
    category: 'frontendFramework',
    minimumConfidence: 60,
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, 'data-v-app')) evidence.push(signal('Found Vue app root marker `data-v-app`', 60));
      if (htmlMatches(ctx, /\b__vue(?:ParentComponent|App)?\b/)) evidence.push(signal('Found Vue runtime marker in page source', 45));
      if (anyTextIncludes(ctx.inlineScripts, ['createApp(', 'createSSRApp('])) evidence.push(signal('Found Vue bootstrap call in inline script', 35));
      return evidence;
    }
  },
  {
    technology: 'WordPress',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['/wp-content/', '/wp-includes/'])) evidence.push(signal('Found WordPress asset path', 45));
      if (generatorIncludes(ctx, 'wordpress')) evidence.push(signal('Generator meta reports WordPress', 55));
      if (htmlIncludes(ctx, 'wp-emoji-release.min.js')) evidence.push(signal('Found WordPress emoji script', 35));
      return evidence;
    }
  },
  {
    technology: 'Webflow',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['webflow.js'])) evidence.push(signal('Found `webflow.js` asset', 55));
      if (ctx.$?.('[data-wf-page]').length) evidence.push(signal('Found Webflow page marker `data-wf-page`', 45));
      if (ctx.$?.('[data-wf-site]').length) evidence.push(signal('Found Webflow site marker `data-wf-site`', 40));
      return evidence;
    }
  },
  {
    technology: 'Shopify',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['cdn.shopify.com', 'shopifycdn.net'])) evidence.push(signal('Found Shopify CDN asset host', 45));
      if (htmlIncludes(ctx, 'shopify.theme')) evidence.push(signal('Found `Shopify.theme` global', 55));
      if (htmlIncludes(ctx, 'shopify-section')) evidence.push(signal('Found Shopify section markup', 35));
      return evidence;
    }
  },
  {
    technology: 'Drupal',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (generatorIncludes(ctx, 'drupal')) evidence.push(signal('Generator meta reports Drupal', 55));
      if (anyUrlIncludes(ctx.assetUrls, ['/sites/default/files/', '/core/assets/'])) evidence.push(signal('Found Drupal asset path', 40));
      if (htmlMatches(ctx, /\bDrupal\s*=\s*\{/)) evidence.push(signal('Found Drupal JS bootstrap object', 35));
      return evidence;
    }
  },
  {
    technology: 'Wix',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (generatorIncludes(ctx, 'wix')) evidence.push(signal('Generator meta reports Wix', 55));
      if (anyUrlIncludes(ctx.assetUrls, ['wixstatic.com', 'static.parastorage.com'])) evidence.push(signal('Found Wix asset host', 40));
      if (htmlIncludes(ctx, 'wix-code-sdk')) evidence.push(signal('Found Wix code SDK marker', 35));
      return evidence;
    }
  },
  {
    technology: 'HubSpot CMS',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['js.hs-scripts.com', 'js.hsforms.net', 'hubspotusercontent'])) evidence.push(signal('Found HubSpot CMS asset host', 45));
      if (generatorIncludes(ctx, 'hubspot')) evidence.push(signal('Generator meta reports HubSpot', 55));
      if (htmlIncludes(ctx, 'hs-script-loader')) evidence.push(signal('Found HubSpot loader marker', 35));
      return evidence;
    }
  },
  {
    technology: 'Contentful',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['ctfassets.net', 'cdn.contentful.com'])) evidence.push(signal('Found Contentful asset/API host', 70));
      return evidence;
    }
  },
  {
    technology: 'Sanity',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['cdn.sanity.io'])) evidence.push(signal('Found Sanity CDN host', 70));
      return evidence;
    }
  },
  {
    technology: 'Prismic',
    category: 'cms',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['prismic.io', 'prismicusercontent.com'])) evidence.push(signal('Found Prismic asset/API host', 70));
      if (htmlIncludes(ctx, 'prismic-toolbar')) evidence.push(signal('Found Prismic toolbar marker', 35));
      return evidence;
    }
  },
  {
    technology: 'Cloudflare',
    category: 'cdn',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.headers['cf-ray']) evidence.push(signal('Found Cloudflare response header `cf-ray`', 55));
      if (headerContains(ctx, 'server', 'cloudflare')) evidence.push(signal('Server header reports Cloudflare', 45));
      if (anyUrlIncludes(ctx.assetUrls, ['/cdn-cgi/'])) evidence.push(signal('Found Cloudflare asset path (`/cdn-cgi/...`)', 35));
      return evidence;
    }
  },
  {
    technology: 'Vercel',
    category: 'hosting',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.headers['x-vercel-id']) evidence.push(signal('Found Vercel response header `x-vercel-id`', 55));
      if (ctx.headers['x-vercel-cache']) evidence.push(signal('Found Vercel cache header `x-vercel-cache`', 40));
      if (headerContains(ctx, 'server', 'vercel')) evidence.push(signal('Server header reports Vercel', 45));
      return evidence;
    }
  },
  {
    technology: 'Netlify',
    category: 'hosting',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.headers['x-nf-request-id']) evidence.push(signal('Found Netlify response header `x-nf-request-id`', 55));
      if (headerContains(ctx, 'server', 'netlify')) evidence.push(signal('Server header reports Netlify', 45));
      return evidence;
    }
  },
  {
    technology: 'Amazon CloudFront',
    category: 'cdn',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.headers['x-amz-cf-id']) evidence.push(signal('Found CloudFront response header `x-amz-cf-id`', 55));
      if (headerContains(ctx, 'server', 'cloudfront')) evidence.push(signal('Server header reports CloudFront', 45));
      return evidence;
    }
  },
  {
    technology: 'Fastly',
    category: 'cdn',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.headers['x-fastly-request-id']) evidence.push(signal('Found Fastly response header `x-fastly-request-id`', 55));
      if (headerContains(ctx, 'x-served-by', 'cache-')) evidence.push(signal('Found Fastly cache server marker in `x-served-by`', 35));
      return evidence;
    }
  },
  {
    technology: 'Akamai',
    category: 'cdn',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.headers['x-akamai-transformed']) evidence.push(signal('Found Akamai response header `x-akamai-transformed`', 55));
      if (headerContains(ctx, 'server-timing', 'cdn-cache')) evidence.push(signal('Found CDN cache timing marker typical of Akamai edge', 20));
      return evidence;
    }
  },
  {
    technology: 'PHP',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'x-powered-by', 'php')) evidence.push(signal('`x-powered-by` exposes PHP', 65));
      return evidence;
    }
  },
  {
    technology: 'Express',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'x-powered-by', 'express')) evidence.push(signal('`x-powered-by` exposes Express', 70));
      return evidence;
    }
  },
  {
    technology: 'ASP.NET',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'x-powered-by', 'asp.net')) evidence.push(signal('`x-powered-by` exposes ASP.NET', 65));
      if (ctx.headers['x-aspnet-version']) evidence.push(signal('Found `x-aspnet-version` header', 55));
      return evidence;
    }
  },
  {
    technology: 'nginx',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'server', 'nginx')) evidence.push(signal('Server header exposes nginx', 70));
      return evidence;
    }
  },
  {
    technology: 'Apache',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'server', 'apache')) evidence.push(signal('Server header exposes Apache', 70));
      return evidence;
    }
  },
  {
    technology: 'OpenResty',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'server', 'openresty')) evidence.push(signal('Server header exposes OpenResty', 70));
      return evidence;
    }
  },
  {
    technology: 'Caddy',
    category: 'backend',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (headerContains(ctx, 'server', 'caddy')) evidence.push(signal('Server header exposes Caddy', 70));
      return evidence;
    }
  },
  {
    technology: 'Google Tag Manager',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.scriptSrcs, ['googletagmanager.com/gtm.js'])) evidence.push(signal('Found GTM loader script', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['gtm.start', 'googletagmanager.com/gtm.js'])) evidence.push(signal('Found GTM bootstrap snippet', 30));
      return evidence;
    }
  },
  {
    technology: 'Google Analytics',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.scriptSrcs, ['googletagmanager.com/gtag/js', 'google-analytics.com'])) evidence.push(signal('Found Google Analytics loader script', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['gtag(', 'ga('])) evidence.push(signal('Found Google Analytics inline tracking call', 25));
      return evidence;
    }
  },
  {
    technology: 'Microsoft Clarity',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.scriptSrcs, ['clarity.ms'])) evidence.push(signal('Found Microsoft Clarity script host', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['clarity('])) evidence.push(signal('Found Clarity bootstrap call', 25));
      return evidence;
    }
  },
  {
    technology: 'Meta Pixel',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.scriptSrcs, ['connect.facebook.net', 'fbevents.js'])) evidence.push(signal('Found Meta Pixel loader script', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['fbq('])) evidence.push(signal('Found Meta Pixel tracking call', 25));
      return evidence;
    }
  },
  {
    technology: 'Hotjar',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['hotjar.com', 'static.hotjar.com'])) evidence.push(signal('Found Hotjar asset host', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['hjSettings', 'hotjar('])) evidence.push(signal('Found Hotjar bootstrap snippet', 25));
      return evidence;
    }
  },
  {
    technology: 'Segment',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['cdn.segment.com', 'analytics.next-integrations.com'])) evidence.push(signal('Found Segment asset host', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['analytics.load('])) evidence.push(signal('Found Segment bootstrap call', 25));
      return evidence;
    }
  },
  {
    technology: 'Plausible',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.scriptSrcs, ['plausible.io/js/script'])) evidence.push(signal('Found Plausible analytics script', 80));
      return evidence;
    }
  },
  {
    technology: 'Matomo',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['matomo.js', 'piwik.js'])) evidence.push(signal('Found Matomo script asset', 75));
      if (anyTextIncludes(ctx.inlineScripts, ['_paq.push'])) evidence.push(signal('Found Matomo tracking queue snippet', 25));
      return evidence;
    }
  },
  {
    technology: 'LinkedIn Insight Tag',
    category: 'analytics',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.scriptSrcs, ['snap.licdn.com/li.lms-analytics/insight.min.js'])) {
        evidence.push(signal('Found LinkedIn Insight Tag script', 80));
      }
      return evidence;
    }
  },
  {
    technology: 'Tailwind CSS',
    category: 'uiLibraries',
    minimumConfidence: 55,
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, '--tw-')) evidence.push(signal('Found Tailwind CSS runtime variable prefix `--tw-`', 45));
      if (htmlMatches(ctx, /\b(?:sm:|md:|lg:|xl:|2xl:|dark:|prose|line-clamp-)\S*/)) {
        evidence.push(signal('Found Tailwind-style utility class tokens', 20));
      }
      if (anyUrlIncludes(ctx.assetUrls, ['tailwind', 'tailwindcss'])) evidence.push(signal('Found Tailwind asset reference', 60));
      return evidence;
    }
  },
  {
    technology: 'Bootstrap',
    category: 'uiLibraries',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['bootstrap.min.css', 'bootstrap.min.js', '/bootstrap.css', '/bootstrap.js'])) {
        evidence.push(signal('Found Bootstrap asset reference', 75));
      }
      if (htmlMatches(ctx, /\bbtn-(?:primary|secondary|outline)|\bcontainer-fluid\b|\bnavbar\b/)) {
        evidence.push(signal('Found Bootstrap class pattern in markup', 20));
      }
      return evidence;
    }
  },
  {
    technology: 'Material UI',
    category: 'uiLibraries',
    suppresses: ['Emotion'],
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlMatches(ctx, /\bMui[A-Z][A-Za-z-]+-root\b/)) evidence.push(signal('Found Material UI class pattern', 40));
      if (htmlIncludes(ctx, 'data-emotion="mui')) evidence.push(signal('Found MUI emotion cache marker', 45));
      return evidence;
    }
  },
  {
    technology: 'Styled Components',
    category: 'uiLibraries',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, 'data-styled')) evidence.push(signal('Found styled-components marker `data-styled`', 75));
      return evidence;
    }
  },
  {
    technology: 'Emotion',
    category: 'uiLibraries',
    minimumConfidence: 60,
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, 'data-emotion=')) evidence.push(signal('Found Emotion style cache marker', 70));
      return evidence;
    }
  },
  {
    technology: 'Chakra UI',
    category: 'uiLibraries',
    minimumConfidence: 55,
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlMatches(ctx, /\bchakra-[\w-]+\b/)) evidence.push(signal('Found Chakra UI class prefix', 35));
      if (htmlIncludes(ctx, 'chakra-ui')) evidence.push(signal('Found Chakra UI package marker', 35));
      return evidence;
    }
  },
  {
    technology: 'Webpack',
    category: 'buildTools',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlMatches(ctx, /\b__webpack_require__\b|\bwebpackJsonp\b|\bwebpackChunk(?:_N_E)?\b/)) {
        evidence.push(signal('Found Webpack runtime marker', 80));
      }
      return evidence;
    }
  },
  {
    technology: 'Vite',
    category: 'buildTools',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['/@vite/client'])) evidence.push(signal('Found Vite client path', 80));
      if (htmlIncludes(ctx, '__vite__')) evidence.push(signal('Found Vite runtime marker `__vite__`', 70));
      return evidence;
    }
  },
  {
    technology: 'Parcel',
    category: 'buildTools',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (htmlIncludes(ctx, 'parcelrequire')) evidence.push(signal('Found Parcel runtime marker `parcelRequire`', 80));
      return evidence;
    }
  },
  {
    technology: 'Google Fonts',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.linkHrefs, ['fonts.googleapis.com'])) evidence.push(signal('Found Google Fonts stylesheet', 75));
      if (anyUrlIncludes(ctx.assetUrls, ['fonts.gstatic.com'])) evidence.push(signal('Found Google Fonts asset host', 25));
      return evidence;
    }
  },
  {
    technology: 'Adobe Fonts',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['use.typekit.net', 'p.typekit.net'])) evidence.push(signal('Found Adobe Fonts host', 80));
      return evidence;
    }
  },
  {
    technology: 'Bunny Fonts',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['fonts.bunny.net'])) evidence.push(signal('Found Bunny Fonts host', 80));
      return evidence;
    }
  },
  {
    technology: 'Font Awesome',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['fontawesome.com', 'fontawesome', 'use.fontawesome.com', 'kit.fontawesome.com'])) {
        evidence.push(signal('Found Font Awesome asset host', 75));
      }
      return evidence;
    }
  },
  {
    technology: 'Cloudinary',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['res.cloudinary.com'])) evidence.push(signal('Found Cloudinary asset host', 80));
      return evidence;
    }
  },
  {
    technology: 'Imgix',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.assetHosts.some(host => host.endsWith('.imgix.net') || host === 'imgix.net')) {
        evidence.push(signal('Found Imgix asset host', 80));
      }
      return evidence;
    }
  },
  {
    technology: 'ImageKit',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (ctx.assetHosts.some(host => host.includes('imagekit.io'))) evidence.push(signal('Found ImageKit asset host', 80));
      return evidence;
    }
  },
  {
    technology: 'jsDelivr',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['cdn.jsdelivr.net'])) evidence.push(signal('Found jsDelivr asset host', 75));
      return evidence;
    }
  },
  {
    technology: 'UNPKG',
    category: 'fonts',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['unpkg.com'])) evidence.push(signal('Found UNPKG asset host', 75));
      return evidence;
    }
  },
  {
    technology: 'Stripe',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['js.stripe.com'])) evidence.push(signal('Found Stripe.js asset host', 80));
      return evidence;
    }
  },
  {
    technology: 'reCAPTCHA',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['google.com/recaptcha', 'gstatic.com/recaptcha'])) {
        evidence.push(signal('Found reCAPTCHA asset host', 80));
      }
      return evidence;
    }
  },
  {
    technology: 'Intercom',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['widget.intercom.io', 'js.intercomcdn.com'])) {
        evidence.push(signal('Found Intercom widget asset host', 80));
      }
      return evidence;
    }
  },
  {
    technology: 'Zendesk',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['static.zdassets.com', 'zopim.com'])) {
        evidence.push(signal('Found Zendesk widget asset host', 80));
      }
      return evidence;
    }
  },
  {
    technology: 'HubSpot Forms / Chat',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['js.hsforms.net', 'js.usemessages.com', 'js.hs-banner.com'])) {
        evidence.push(signal('Found HubSpot forms/chat asset host', 75));
      }
      return evidence;
    }
  },
  {
    technology: 'Calendly',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['assets.calendly.com'])) evidence.push(signal('Found Calendly asset host', 80));
      return evidence;
    }
  },
  {
    technology: 'YouTube',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['youtube.com/embed', 'youtube-nocookie.com/embed', 'i.ytimg.com'])) {
        evidence.push(signal('Found YouTube embed/media host', 75));
      }
      return evidence;
    }
  },
  {
    technology: 'Vimeo',
    category: 'thirdPartyServices',
    match: (ctx) => {
      const evidence: WeightedEvidence[] = [];
      if (anyUrlIncludes(ctx.assetUrls, ['player.vimeo.com'])) evidence.push(signal('Found Vimeo player host', 75));
      return evidence;
    }
  }
];
