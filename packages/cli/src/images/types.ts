import { Severity } from '@seocore/sdk';

export interface ImageRecord {
  src: string;               // Absolute resolved URL
  originalSrc: string;       // Raw src attribute value
  alt?: string;
  loading?: string;
  decoding?: string;
  fetchpriority?: string;
  width?: number;            // Intrinsic width attribute or inline style
  height?: number;           // Intrinsic height attribute or inline style
  hasAspectRatio?: boolean;  // aspect-ratio in inline style
  isPreload: boolean;
  pages: string[];           // Page URLs where this image was discovered
  
  // HTTP Fetch Data
  statusCode?: number;
  bytes?: number;            // Content-Length or actual chunk size
  contentType?: string;
  cacheControl?: string;
  isCdn?: boolean;
  headers?: Record<string, string>;
  fetchFailed?: boolean;
  fetchError?: string;

  // Sharp Decode Data
  decodedFormat?: string;
  decodedWidth?: number;
  decodedHeight?: number;
  isAnimated?: boolean;
  hasAlpha?: boolean;
  estimatedQuality?: number;
  decodeFailed?: boolean;
  decodeError?: string;
  thumbnail?: string;        // Base64 thumbnail data URI

  // Playwright Runtime Data
  renderedWidth?: number;
  renderedHeight?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  inViewport?: boolean;
  isLcp?: boolean;
  lcpSelector?: string;
}

export interface ImageFinding {
  ruleId: string;
  imageSrc: string;
  severity: Severity;
  message: string;
  recommendation: string;
  evidence?: string;
}

export interface BudgetViolation {
  metric: string;
  limit: string | number;
  actual: string | number;
  severity: Severity;
  message: string;
}

export interface ImageAuditResult {
  url: string;
  crawledAt: string;
  mode: 'single' | 'crawl';
  playwright: boolean;
  summary: {
    totalImages: number;
    totalBytes: number;
    avgBytes: number;
    score: number;
    budgets: {
      totalPayloadBytes: number;
      mobileBudgetBytes: number;
      mobileBudgetPassed: boolean;
      lcpImageWeightBytes: number;
      lcpBudgetBytes: number;
      lcpBudgetPassed: boolean;
      oversizedCount: number;
    };
  };
  images: ImageRecord[];
  findings: ImageFinding[];
  budgetViolations: BudgetViolation[];
}

export interface ImageRuleContext {
  thresholdKb: number;
  playwright: boolean;
}

export interface ImageRule {
  id: string;
  name: string;
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[];
}
