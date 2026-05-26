import { extractSurface } from './surface-extractor.js';
import { runDiffEngine, type DiffEngineOptions } from './diff-engine.js';
import { calculateScore } from './scoring.js';
import type { ParsedSurface, DiffContext, JsImpactDiff, JsImpactScore, JsImpactSummary } from './types.js';
import { createDiffId } from './diff-id.js';
import { generateRecommendations, detectFrameworkHint } from './tips-catalog.js';
import { JsImpactAnalyzer } from './js-impact-analyzer.js';

export { extractSurface };
export { runDiffEngine };
export { calculateScore };
export { createDiffId };
export { generateRecommendations, detectFrameworkHint };
export { JsImpactAnalyzer };
export type { ParsedSurface, DiffContext, JsImpactDiff, JsImpactScore, JsImpactSummary, DiffEngineOptions };

export * from './types.js';
