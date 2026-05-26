import fs from 'fs/promises';
import path from 'path';
import type { JsImpactReport, JsImpactReporter } from '@seocore/sdk';

export class JsImpactJsonReporter implements JsImpactReporter {
  report(report: JsImpactReport): void {
    console.log(JSON.stringify(report, null, 2));
  }

  async write(report: JsImpactReport, outputPath: string): Promise<void> {
    const absolutePath = path.resolve(outputPath);
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, JSON.stringify(report, null, 2), 'utf8');
  }
}
