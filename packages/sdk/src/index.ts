// ==========================================
// CORE MODEL SCHEMA & TYPES
// ==========================================

export interface RedirectHop {
  url: string;
  statusCode: number;
}

export interface NormalizedPage {
  url: string;
  statusCode: number;
  loadTimeMs: number;
  contentType: string;
  html?: string; // Original HTML content for deep structural scanning
  title?: string;
  metaDescription?: string;
  canonical?: string;
  robotsMeta?: string;
  viewport?: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  links: {
    url: string;
    text: string;
    isInternal: boolean;
  }[];
  images: {
    src: string;
    alt?: string;
  }[];
  hreflang: {
    lang: string;
    url: string;
  }[];
  structuredData: any[];
  robotsTxtFound?: boolean;
  sitemapXmlFound?: boolean;
  redirectChain?: RedirectHop[];
  // Crawl Graph Engine additions
  depth?: number;
  inDegree?: number;
  outDegree?: number;
  isOrphan?: boolean;
  authorityScore?: number;
  // Lighthouse + Performance additions
  performanceScore?: number;
  coreWebVitals?: {
    lcp: number; // Largest Contentful Paint in ms
    cls: number; // Cumulative Layout Shift
    inp: number; // Interaction to Next Paint in ms
  };
  resources?: {
    pageSizeBytes: number;
    jsSizeBytes: number;
    cssSizeBytes: number;
    imageSizeBytes: number;
    otherSizeBytes: number;
    jsRequests: number;
    cssRequests: number;
    imageRequests: number;
    totalRequests: number;
  };
  // OpenGraph and Twitter Card
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
    [key: string]: string | undefined;
  };
  twitterCard?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
    site?: string;
    creator?: string;
    [key: string]: string | undefined;
  };
}

export type Severity = 'critical' | 'error' | 'warning' | 'info';
export type Category = 'seo' | 'performance' | 'accessibility' | 'indexing' | 'links' | 'metadata' | 'ai_visibility' | 'mobile_seo' | 'backlink_intelligence';

export interface Finding {
  id: string; // ruleId:url-hash
  ruleId: string;
  severity: Severity;
  category: Category;
  url: string;
  message: string;
  recommendation: string;
  evidence?: string;
  documentationLink?: string;
}

// ==========================================
// CONFIGURATION SCHEMA
// ==========================================

export type AuditPreset = 'quick' | 'standard' | 'deep' | 'enterprise';

export interface Backlink {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  isDofollow?: boolean;
  domainAuthority?: number;
  pageAuthority?: number;
  spamScore?: number;
  firstSeen?: Date;
  lastSeen?: Date;
}

export interface BingBacklinkSourceConfig {
  enabled?: boolean;
  apiKey?: string;
  siteUrl?: string;
  maxPages?: number;
}

export interface GscBacklinkSourceConfig {
  enabled?: boolean;
  exportPath?: string;
  maxRows?: number;
}

export interface LogBacklinkSourceConfig {
  enabled?: boolean;
  paths?: string[];
  maxRows?: number;
}

export interface BacklinkApiConfig {
  provider: 'bing' | 'custom';
  bing?: BingBacklinkSourceConfig;
  gsc?: GscBacklinkSourceConfig;
  logs?: LogBacklinkSourceConfig;
}

export interface BacklinkDomainMetrics {
  totalBacklinks?: number;
  referringDomains?: number;
  sourceCount?: number;
  authorityMetricsAvailable?: boolean;
  domainAuthority?: number;
  spamScore?: number;
  notes?: string[];
}

export interface BacklinkIntelligenceData {
  backlinks: Backlink[];
  domainMetrics: BacklinkDomainMetrics;
  sources: string[];
}

export interface SeoConfig {
  preset: AuditPreset;
  concurrency: number;
  maxDepth: number;
  maxPages: number;
  rateLimitMs: number;
  retryCount: number;
  playwrightEnabled: boolean;
  lighthouseEnabled: boolean;
  lighthouseSampleCount?: number;
  excludePatterns: string[];
  includePatterns: string[];
  ruleOverrides: Record<string, { enabled?: boolean; severity?: Severity; weight?: number }>;
  customRulesPath?: string;
  backlinks?: BacklinkApiConfig;
}

// ==========================================
// SCORING SCHEMA
// ==========================================

export interface CategoryScore {
  category: Category;
  score: number; // 0 to 100
  totalDeductions: number;
  findingsCount: Record<Severity, number>;
}

export interface CrawlGraphNode {
  url: string;
  depth: number;
  isOrphan: boolean;
  inDegree: number;
  outDegree: number;
  authorityScore: number;
}

export interface CrawlGraphEdge {
  source: string;
  target: string;
}

export interface CrawlGraph {
  nodes: CrawlGraphNode[];
  edges: CrawlGraphEdge[];
  metrics: {
    maxDepth: number;
    orphanCount: number;
    hubPages: { url: string; outDegree: number }[];
    authorityNodes: { url: string; inDegree: number }[];
  };
}

export interface AuditResult {
  url: string;
  timestamp: string;
  config: Partial<SeoConfig>;
  score: number; // 0 to 100
  categories: Record<Category, CategoryScore>;
  findings: Finding[];
  pagesAudited: number;
  totalLoadTimeMs: number;
  pages: Record<string, NormalizedPage>;
  crawlGraph?: CrawlGraph;
  backlinkData?: BacklinkIntelligenceData;
}

// ==========================================
// RULE INTERFACES
// ==========================================

export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  category: Category;
  defaultSeverity: Severity;
  defaultWeight: number; // 1-10 used for score calculation
  documentationLink?: string;
}

export interface Rule {
  definition: RuleDefinition;
  evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]>;
}

export interface RuleEvaluationContext {
  allPages: Record<string, NormalizedPage>;
  config: SeoConfig;
  backlinkData?: BacklinkIntelligenceData;
  backlinkError?: string;
}

// ==========================================
// CRAWLER CONTRACTS
// ==========================================

export interface CrawlResult {
  url: string;
  html?: string;
  statusCode: number;
  loadTimeMs: number;
  contentType: string;
  error?: string;
  redirectChain?: RedirectHop[];
  resources?: {
    pageSizeBytes: number;
    jsSizeBytes: number;
    cssSizeBytes: number;
    imageSizeBytes: number;
    otherSizeBytes: number;
    jsRequests: number;
    cssRequests: number;
    imageRequests: number;
    totalRequests: number;
  };
  lighthouse?: {
    score: number;
    coreWebVitals: {
      lcp: number;
      cls: number;
      inp: number;
    };
  };
}

export interface Crawler {
  crawl(url: string, config: SeoConfig): Promise<CrawlResult>;
}

// ==========================================
// PLUGIN SYSTEM CONTRACTS
// ==========================================

export interface PluginLifecycleHooks {
  onInit?(config: SeoConfig): Promise<void>;
  onBeforeCrawl?(url: string): Promise<string | void>; // can redirect / rewrite
  onPageCrawled?(result: CrawlResult, page: NormalizedPage): Promise<void>;
  onBeforeAnalysis?(pages: Record<string, NormalizedPage>): Promise<void>;
  onAfterAnalysis?(findings: Finding[]): Promise<Finding[] | void>; // can mutate findings
  onComplete?(result: AuditResult): Promise<void>;
}

export interface SeoPlugin {
  name: string;
  version: string;
  rules?: Rule[];
  lifecycle?: PluginLifecycleHooks;
}

// ==========================================
// EVENT SYSTEM
// ==========================================

export interface EventMap {
  'crawl:start': { startUrl: string; timestamp: string };
  'page:loaded': { url: string; statusCode: number; loadTimeMs: number };
  'dom:parsed': { url: string; page: NormalizedPage };
  'analyzer:completed': { url: string; findingsCount: number };
  'score:calculated': { score: number; categories: Record<Category, CategoryScore> };
  'report:generated': { path?: string; format: string };
  'audit:complete': { result: AuditResult };
}

export type EventCallback<T> = (data: T) => void | Promise<void>;

export class EventBus {
  private listeners: { [K in keyof EventMap]?: EventCallback<EventMap[K]>[] } = {};

  on<K extends keyof EventMap>(event: K, cb: EventCallback<EventMap[K]>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(cb);
  }

  async emit<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
    const list = this.listeners[event];
    if (list) {
      for (const cb of list) {
        try {
          await cb(data);
        } catch (err) {
          console.error(`[EventBus] Error in listener for ${event}:`, err);
        }
      }
    }
  }
}
