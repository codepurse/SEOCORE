import { z } from 'zod';

// ==========================================
// JS IMPACT REPORT — CORE TYPES
// ==========================================

export type RenderStrategy = 'csr' | 'ssr' | 'ssg' | 'isr' | 'hybrid' | 'unknown';

export type JsImpactAspect =
  | 'indexability.canonical'
  | 'indexability.metaRobots'
  | 'indexability.xRobotsTag'
  | 'content.wordCount'
  | 'content.mainTextMissing'
  | 'metadata.title'
  | 'metadata.metaDescription'
  | 'metadata.openGraph'
  | 'metadata.twitter'
  | 'headings.h1'
  | 'headings.set'
  | 'links.internal'
  | 'links.external'
  | 'links.onlyInRendered'
  | 'images.src'
  | 'images.alt'
  | 'structuredData.jsonLd'
  | 'hreflang'
  | 'jsErrors'
  | 'resourceBlocked';

export interface ConsoleMessage {
  level: string;
  text: string;
  url?: string;
  line?: number;
}

export interface FailedRequest {
  url: string;
  method: string;
  status?: number;
  failure?: string;
  resourceType: string;
}

export interface BlockedResource {
  url: string;
  reason: 'robots.txt' | 'csp' | 'mixed-content' | 'cors' | 'other';
  impact: 'critical' | 'high' | 'medium' | 'low';
}

export interface JsImpactDiff {
  id: string;
  aspect: JsImpactAspect;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: 'certain' | 'likely' | 'cosmetic';
  title: string;
  description: string;
  raw?: string | number | string[];
  rendered?: string | number | string[];
  delta?: number;
  evidence: string[];
  fix?: string;
}

export interface Recommendation {
  id: string;
  priority: number;
  title: string;
  rationale: string;
  action: string;
  relatedAspects: JsImpactAspect[];
  frameworkSpecific?: string;
}

export interface JsImpactScore {
  overall: number;
  indexability: number;
  contentParity: number;
  metadataParity: number;
  structuredDataParity: number;
  crawlability: number;
  reasoning: string[];
}

export interface JsImpactSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface JsImpactRenderInfo {
  strategy: RenderStrategy;
  framework?: string;
  frameworkConfidence?: number;
  waitEvent: 'load' | 'domcontentloaded' | 'networkidle';
  waitExtraMs: number;
  timings: {
    rawFetchMs: number;
    renderTotalMs: number;
    domContentLoadedMs?: number;
    loadEventMs?: number;
    networkIdleMs?: number;
  };
  bytes: { raw: number; rendered: number; deltaPct: number };
  consoleMessages: ConsoleMessage[];
  failedRequests: FailedRequest[];
}

export interface JsImpactReport {
  url: string;
  checkedAt: string;
  render: JsImpactRenderInfo;
  diffs: JsImpactDiff[];
  blockedResources: BlockedResource[];
  score: JsImpactScore;
  summary: JsImpactSummary;
  recommendations: Recommendation[];
}

// ==========================================
// ZOD SCHEMAS
// ==========================================

export const ConsoleMessageSchema = z.object({
  level: z.string(),
  text: z.string(),
  url: z.string().optional(),
  line: z.number().optional(),
});

export const FailedRequestSchema = z.object({
  url: z.string(),
  method: z.string(),
  status: z.number().optional(),
  failure: z.string().optional(),
  resourceType: z.string(),
});

export const BlockedResourceSchema = z.object({
  url: z.string(),
  reason: z.enum(['robots.txt', 'csp', 'mixed-content', 'cors', 'other']),
  impact: z.enum(['critical', 'high', 'medium', 'low']),
});

export const JsImpactAspectSchema: z.ZodType<JsImpactAspect> = z.enum([
  'indexability.canonical',
  'indexability.metaRobots',
  'indexability.xRobotsTag',
  'content.wordCount',
  'content.mainTextMissing',
  'metadata.title',
  'metadata.metaDescription',
  'metadata.openGraph',
  'metadata.twitter',
  'headings.h1',
  'headings.set',
  'links.internal',
  'links.external',
  'links.onlyInRendered',
  'images.src',
  'images.alt',
  'structuredData.jsonLd',
  'hreflang',
  'jsErrors',
  'resourceBlocked',
]);

export const JsImpactDiffSchema = z.object({
  id: z.string(),
  aspect: JsImpactAspectSchema,
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  confidence: z.enum(['certain', 'likely', 'cosmetic']),
  title: z.string(),
  description: z.string(),
  raw: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
  rendered: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
  delta: z.number().optional(),
  evidence: z.array(z.string()),
  fix: z.string().optional(),
});

export const RecommendationSchema = z.object({
  id: z.string(),
  priority: z.number(),
  title: z.string(),
  rationale: z.string(),
  action: z.string(),
  relatedAspects: z.array(JsImpactAspectSchema),
  frameworkSpecific: z.string().optional(),
});

export const JsImpactScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  indexability: z.number().min(0).max(100),
  contentParity: z.number().min(0).max(100),
  metadataParity: z.number().min(0).max(100),
  structuredDataParity: z.number().min(0).max(100),
  crawlability: z.number().min(0).max(100),
  reasoning: z.array(z.string()),
});

export const JsImpactSummarySchema = z.object({
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
});

export const JsImpactRenderInfoSchema = z.object({
  strategy: z.enum(['csr', 'ssr', 'ssg', 'isr', 'hybrid', 'unknown']),
  framework: z.string().optional(),
  frameworkConfidence: z.number().min(0).max(100).optional(),
  waitEvent: z.enum(['load', 'domcontentloaded', 'networkidle']),
  waitExtraMs: z.number().int().min(0),
  timings: z.object({
    rawFetchMs: z.number().int().min(0),
    renderTotalMs: z.number().int().min(0),
    domContentLoadedMs: z.number().int().min(0).optional(),
    loadEventMs: z.number().int().min(0).optional(),
    networkIdleMs: z.number().int().min(0).optional(),
  }),
  bytes: z.object({
    raw: z.number().int().min(0),
    rendered: z.number().int().min(0),
    deltaPct: z.number(),
  }),
  consoleMessages: z.array(ConsoleMessageSchema),
  failedRequests: z.array(FailedRequestSchema),
});

export const JsImpactReportSchema = z.object({
  url: z.string().url(),
  checkedAt: z.string().datetime(),
  render: JsImpactRenderInfoSchema,
  diffs: z.array(JsImpactDiffSchema),
  blockedResources: z.array(BlockedResourceSchema),
  score: JsImpactScoreSchema,
  summary: JsImpactSummarySchema,
  recommendations: z.array(RecommendationSchema),
});

// ==========================================
// CRAWLER TYPES
// ==========================================

export interface RenderTimings {
  rawFetchMs: number;
  renderTotalMs: number;
  domContentLoadedMs?: number;
  loadEventMs?: number;
  networkIdleMs?: number;
}

export interface RedirectHop {
  url: string;
  statusCode: number;
}

export interface RenderedFetchResult {
  url: string;
  finalUrl: string;
  rawHtml: string;
  renderedHtml: string;
  statusCode: number;
  rawHeaders: Record<string, string>;
  bytes: { raw: number; rendered: number };
  timings: RenderTimings;
  consoleMessages: ConsoleMessage[];
  failedRequests: FailedRequest[];
  blockedRequests: BlockedResource[];
  redirectChain: RedirectHop[];
}

export interface RenderedCrawlOptions {
  userAgent?: string;
  viewport?: { width: number; height: number };
  waitEvent?: 'load' | 'domcontentloaded' | 'networkidle';
  waitExtraMs?: number;
  timeoutMs?: number;
  blockPatterns?: string[];
  extraHttpHeaders?: Record<string, string>;
  ignoreSslErrors?: boolean;
}

// ==========================================
// CONFIG TYPES
// ==========================================

export interface JsImpactConfig {
  waitEvent?: 'load' | 'domcontentloaded' | 'networkidle';
  waitExtraMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
  blockPatterns?: string[];
  cache?: { enabled?: boolean; ttlMs?: number };
  wordCountDeltaThresholds?: { high: number; critical: number };
}
