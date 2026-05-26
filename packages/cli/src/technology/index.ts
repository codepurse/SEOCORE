import { HttpCrawler } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import { PageNormalizer, TechnologyDetector } from '@seocore/analyzers';
import { TechnologyReporter } from './reporter.js';

export async function runTechnologyCommand(url: string, options: any) {
  try {
    const crawler = new HttpCrawler();
    const config = resolveConfig();
    const crawlResult = await crawler.crawl(url, config);
    const normalizedPage = PageNormalizer.normalize(crawlResult);
    const techSummary = TechnologyDetector.detect(normalizedPage);

    TechnologyReporter.report(techSummary, url, {
      verbose: options.verbose,
      format: options.format || 'terminal',
      output: options.output,
    });
  } catch (err: any) {
    console.error(`Failed to analyze technology: ${err.message}`);
    process.exit(1);
  }
}
