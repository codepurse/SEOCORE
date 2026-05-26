const valueOf = <T extends Record<string, string>>(obj: T) => obj;

export const MOBILE_USABILITY_SUBCHECKS = valueOf({
  MISSING_VIEWPORT: 'missing-viewport',
  INVALID_VIEWPORT: 'invalid-viewport',
  NO_INLINE_STYLES: 'no-inline-styles',
  FIXED_WIDTH: 'fixed-width',
  NO_NAV_ELEMENT: 'no-nav-element',
  POOR_NAVIGATION: 'poor-navigation',
  NO_TAP_TARGETS: 'no-tap-targets',
  TAP_TARGET: 'tap-target',
  UNVERIFIABLE_USABILITY: 'unverifiable-usability',
} as const);

export const MOBILE_PERFORMANCE_SUBCHECKS = valueOf({
  UNVERIFIABLE_LCP: 'unverifiable-lcp',
  UNVERIFIABLE_CLS: 'unverifiable-cls',
  UNVERIFIABLE_JS_EXECUTION: 'unverifiable-js-execution',
  UNVERIFIABLE_IMAGE_LOAD: 'unverifiable-image-load',
  POOR_LCP: 'poor-lcp',
  NEEDS_IMPROVEMENT_LCP: 'needs-improvement-lcp',
  POOR_CLS: 'poor-cls',
  NEEDS_IMPROVEMENT_CLS: 'needs-improvement-cls',
  NO_IMAGES_FOUND: 'no-images-found',
  EXCESSIVE_JS: 'excessive-js',
  HEAVY_JS: 'heavy-js',
  HEAVY_IMAGES: 'heavy-images',
  RENDER_BLOCKING: 'render-blocking',
} as const);

export const MOBILE_RESPONSIVE_DESIGN_SUBCHECKS = valueOf({
  UNVERIFIABLE_BREAKPOINTS: 'unverifiable-breakpoints',
  MISSING_MEDIA_QUERIES: 'missing-media-queries',
  FIXED_LAYOUT: 'fixed-layout',
  MISSING_BREAKPOINTS: 'missing-breakpoints',
} as const);

export const MOBILE_INDEXING_READINESS_SUBCHECKS = valueOf({
  HIDDEN_CONTENT: 'hidden-content',
  MISSING_SCHEMA: 'missing-schema',
  MISSING_CANONICAL: 'missing-canonical',
  CANONICAL_MISMATCH: 'canonical-mismatch',
} as const);

export const MOBILE_SUBCHECKS = {
  usability: MOBILE_USABILITY_SUBCHECKS,
  performance: MOBILE_PERFORMANCE_SUBCHECKS,
  responsiveDesign: MOBILE_RESPONSIVE_DESIGN_SUBCHECKS,
  indexingReadiness: MOBILE_INDEXING_READINESS_SUBCHECKS,
} as const;

type ValueOf<T> = T[keyof T];

export type MobileUsabilitySubCheck = ValueOf<typeof MOBILE_USABILITY_SUBCHECKS>;
export type MobilePerformanceSubCheck = ValueOf<typeof MOBILE_PERFORMANCE_SUBCHECKS>;
export type MobileResponsiveDesignSubCheck = ValueOf<typeof MOBILE_RESPONSIVE_DESIGN_SUBCHECKS>;
export type MobileIndexingReadinessSubCheck = ValueOf<typeof MOBILE_INDEXING_READINESS_SUBCHECKS>;
export type MobileSubCheck =
  | MobileUsabilitySubCheck
  | MobilePerformanceSubCheck
  | MobileResponsiveDesignSubCheck
  | MobileIndexingReadinessSubCheck;
