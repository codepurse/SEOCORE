import type { JsImpactReport, RenderStrategy, JsImpactAspect, JsImpactConfig } from '@seocore/sdk';
import type { RenderedFetchResult } from '@seocore/sdk';
import { extractSurface } from './surface-extractor.js';
import { runDiffEngine } from './diff-engine.js';
import { calculateScore } from './scoring.js';
import { generateRecommendations, detectFrameworkHint } from './tips-catalog.js';

function detectRenderStrategy(
  rawWordCount: number,
  renderedWordCount: number,
  framework: string | undefined,
): RenderStrategy {
  const ratio = renderedWordCount / Math.max(rawWordCount, 1);
  if (ratio < 0.2) return 'csr';
  if (framework === 'nextjs' || framework === 'remix') return 'hybrid';
  if (ratio > 0.9) return 'ssr';
  if (ratio > 0.7) return 'ssg';
  return 'unknown';
}

interface JsImpactAnalyzerOptions {
  config?: JsImpactConfig;
}

export class JsImpactAnalyzer {
  async analyze(
    url: string,
    fetchResult: RenderedFetchResult,
    options: JsImpactAnalyzerOptions = {},
  ): Promise<JsImpactReport> {
    const rawSurface = extractSurface(fetchResult.rawHtml, url);
    const renderedSurface = extractSurface(fetchResult.renderedHtml, fetchResult.finalUrl);

    const rawHeaders = fetchResult.rawHeaders ?? {};
    const diffContext = {
      url,
      rawHeaders,
      xRobotsTag: rawHeaders['x-robots-tag'],
    };

    const diffs = runDiffEngine(rawSurface, renderedSurface, diffContext, {
      consoleMessages: fetchResult.consoleMessages,
      failedRequests: fetchResult.failedRequests,
      blockedResources: fetchResult.blockedRequests,
    });

    const framework = detectFrameworkHint(fetchResult.rawHtml, fetchResult.renderedHtml);
    const recommendations = generateRecommendations(diffs, framework);

    const { score, summary } = calculateScore(diffs, rawSurface.wordCount, renderedSurface.wordCount);

    const renderStrategy = detectRenderStrategy(rawSurface.wordCount, renderedSurface.wordCount, framework);

    return {
      url,
      checkedAt: new Date().toISOString(),
      render: {
        strategy: renderStrategy,
        framework: framework,
        waitEvent: options.config?.waitEvent ?? 'networkidle',
        waitExtraMs: options.config?.waitExtraMs ?? 0,
        timings: {
          rawFetchMs: fetchResult.timings.rawFetchMs,
          renderTotalMs: fetchResult.timings.renderTotalMs,
          domContentLoadedMs: fetchResult.timings.domContentLoadedMs,
          loadEventMs: fetchResult.timings.loadEventMs,
          networkIdleMs: fetchResult.timings.networkIdleMs,
        },
        bytes: {
          raw: fetchResult.bytes.raw,
          rendered: fetchResult.bytes.rendered,
          deltaPct: fetchResult.bytes.raw > 0
            ? ((fetchResult.bytes.rendered - fetchResult.bytes.raw) / fetchResult.bytes.raw) * 100
            : 0,
        },
        consoleMessages: fetchResult.consoleMessages,
        failedRequests: fetchResult.failedRequests,
      },
      diffs,
      blockedResources: fetchResult.blockedRequests,
      score,
      summary,
      recommendations,
    };
  }
}
