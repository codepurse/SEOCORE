import type { JsImpactDiff, ParsedSurface, DiffContext, AspectCheck } from './types.js';
import { checkCanonical } from './aspect-checks/canonical-check.js';
import { checkMetaRobots } from './aspect-checks/meta-robots-check.js';
import { checkXRobotsTag } from './aspect-checks/x-robots-tag-check.js';
import { checkContentWordCount } from './aspect-checks/content-wordcount-check.js';
import { checkMainText } from './aspect-checks/content-main-text-check.js';
import { checkTitle } from './aspect-checks/title-check.js';
import { checkMetaDescription } from './aspect-checks/meta-description-check.js';
import { checkOgTags } from './aspect-checks/og-tags-check.js';
import { checkTwitterTags } from './aspect-checks/twitter-tags-check.js';
import { checkHeadings } from './aspect-checks/headings-check.js';
import { checkLinks } from './aspect-checks/links-check.js';
import { checkImages } from './aspect-checks/images-check.js';
import { checkStructuredData } from './aspect-checks/structured-data-check.js';
import { checkHreflang } from './aspect-checks/hreflang-check.js';
import { checkJsErrors, type JsErrorContext } from './aspect-checks/js-errors-check.js';
import { checkBlockedResources, type BlockedResourceInfo } from './aspect-checks/resource-blocked-check.js';

const ASPECT_ORDER: string[] = [
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
];

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface DiffEngineOptions {
  consoleMessages?: JsErrorContext['consoleMessages'];
  failedRequests?: JsErrorContext['failedRequests'];
  blockedResources?: BlockedResourceInfo[];
}

export function runDiffEngine(
  raw: ParsedSurface,
  rendered: ParsedSurface,
  ctx: DiffContext,
  opts: DiffEngineOptions = {}
): JsImpactDiff[] {
  const checks: AspectCheck[] = [
    checkCanonical,
    checkMetaRobots,
    checkXRobotsTag,
    checkContentWordCount,
    checkMainText,
    checkTitle,
    checkMetaDescription,
    checkOgTags,
    checkTwitterTags,
    checkHeadings,
    checkLinks,
    checkImages,
    checkStructuredData,
    checkHreflang,
  ];

  let diffs: JsImpactDiff[] = [];

  for (const check of checks) {
    try {
      diffs.push(...check(raw, rendered, ctx));
    } catch (err: any) {
      diffs.push({
        id: `error-${check.name}-${Date.now()}`,
        aspect: 'jsErrors',
        severity: 'low',
        confidence: 'cosmetic',
        title: `Aspect check ${check.name} threw an error`,
        description: err.message || 'Unknown error',
        evidence: [err.stack || ''],
      });
    }
  }

  if (opts.consoleMessages || opts.failedRequests) {
    diffs.push(...checkJsErrors(raw, rendered, ctx, {
      consoleMessages: opts.consoleMessages || [],
      failedRequests: opts.failedRequests || [],
    }));
  }

  if (opts.blockedResources && opts.blockedResources.length > 0) {
    diffs.push(...checkBlockedResources(raw, rendered, ctx, opts.blockedResources));
  }

  diffs = diffs.map(d => ({
    ...d,
    evidence: d.evidence.slice(0, 5),
  }));

  diffs.sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity] ?? 99;
    const sevB = SEVERITY_ORDER[b.severity] ?? 99;
    if (sevA !== sevB) return sevA - sevB;
    const idxA = ASPECT_ORDER.indexOf(a.aspect);
    const idxB = ASPECT_ORDER.indexOf(b.aspect);
    if (idxA !== idxB) return idxA - idxB;
    return a.title.localeCompare(b.title);
  });

  return diffs;
}
