import type { JsImpactReport } from './js-impact.js';

export interface JsImpactReporter {
  report(report: JsImpactReport): void;
  write(report: JsImpactReport, outputPath: string): Promise<void>;
}
