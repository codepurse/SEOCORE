/**
 * @deprecated Use @seocore/rules-core, @seocore/rules-performance,
 * @seocore/rules-mobile, @seocore/rules-ai-visibility,
 * @seocore/rules-security, or @seocore/rules-hreflang instead.
 */
export * from '@seocore/rules-core';
export * from '@seocore/rules-performance';
export * from '@seocore/rules-mobile';
export * from '@seocore/rules-ai-visibility';
export * from '@seocore/rules-security';
export * from '@seocore/rules-hreflang';

let hasWarned = false;

function warnDeprecatedRulesPackage(): void {
  if (hasWarned) {
    return;
  }

  hasWarned = true;
  console.warn('[@seocore/rules] Deprecated. Import from @seocore/rules-{module} packages instead.');
}

warnDeprecatedRulesPackage();
