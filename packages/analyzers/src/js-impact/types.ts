import type {
  JsImpactReport,
  JsImpactDiff,
  JsImpactAspect,
  Recommendation,
  RenderedFetchResult,
  RenderedCrawlOptions,
  JsImpactConfig,
  JsImpactScore,
  JsImpactSummary,
  JsImpactRenderInfo,
  ConsoleMessage,
  FailedRequest,
} from '@seocore/sdk';

export type {
  JsImpactReport,
  JsImpactDiff,
  JsImpactAspect,
  Recommendation,
  RenderedFetchResult,
  RenderedCrawlOptions,
  JsImpactConfig,
  JsImpactScore,
  JsImpactSummary,
  JsImpactRenderInfo,
  ConsoleMessage,
  FailedRequest,
};

export interface LinkInfo {
  url: string;
  text: string;
  isInternal: boolean;
}

export interface ImageInfo {
  src: string;
  alt?: string;
  isLazy?: boolean;
}

export interface ParsedSurface {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  headings: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] };
  links: { internal: LinkInfo[]; external: LinkInfo[] };
  images: ImageInfo[];
  jsonLd: unknown[];
  jsonLdRaw: string[];
  hreflang: { hreflang: string; href: string }[];
  visibleText: string;
  wordCount: number;
  bytes: number;
}

export interface DiffContext {
  url: string;
  rawHeaders: Record<string, string>;
  xRobotsTag?: string;
}

export type AspectCheck = (raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext) => JsImpactDiff[];
