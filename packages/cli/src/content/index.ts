import { HttpCrawler } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import { PageNormalizer, ContentAnalyzer, EeatAnalyzer, AiCitationReadinessAnalyzer } from '@seocore/analyzers';
import { Spinner } from '../utils/spinner.js';
import { reportTerminal, exportJson, exportHtml, type ContentAnalysisResult } from './reporter.js';

export interface ContentCommandOptions {
  deep?: boolean;
  focus?: string;
  json?: boolean;
  format?: 'terminal' | 'json' | 'html';
  output?: string;
  ci?: boolean;
  budgetEeat?: number;
  budgetContent?: number;
}

export async function runContentCommand(url: string, options: ContentCommandOptions = {}): Promise<ContentAnalysisResult> {
  const isJson = options.json || options.format === 'json';
  const isHtml = options.format === 'html';
  const spinner = new Spinner(`Analyzing E-E-A-T & Content Quality for ${url}...`);
  if (!isJson && !isHtml) spinner.start();

  try {
    const config = resolveConfig();
    const crawler = new HttpCrawler();
    const crawlResult = await crawler.crawl(url, config);
    const normalizedPage = PageNormalizer.normalize(crawlResult);

    // Run analyzers
    const contentAnalyzer = new ContentAnalyzer();
    const contentAnalysis = contentAnalyzer.analyze(normalizedPage.html, normalizedPage);

    const eeatAnalyzer = new EeatAnalyzer();
    const eeatAnalysis = await eeatAnalyzer.analyze(url, normalizedPage);

    const aiCitationAnalyzer = new AiCitationReadinessAnalyzer();
    const aiCitationAnalysis = aiCitationAnalyzer.analyze(normalizedPage);

    // Calculate overall content quality score
    const contentQualityScore = Math.round(
      (contentAnalysis.contentLengthScore + 
       (contentAnalysis.readability.fleschReadingEase >= 60 ? 25 : contentAnalysis.readability.fleschReadingEase >= 40 ? 15 : 5) +
       (contentAnalysis.headings.hierarchy ? 20 : 10) +
       (contentAnalysis.internalLinkDensity > 1 ? 20 : 10)) / 2
    );

    const result: ContentAnalysisResult = {
      metadata: { url, date: new Date().toISOString() },
      scores: {
        eeat: eeatAnalysis.overallScore,
        contentQuality: contentQualityScore,
        aiCitationReadiness: aiCitationAnalysis.score
      },
      eeat: eeatAnalysis,
      contentQuality: contentAnalysis,
      aiCitationReadiness: aiCitationAnalysis
    };

    if (!isJson && !isHtml) spinner.stop('Analysis complete!');

    // Handle output
    if (isJson) {
      if (options.output) {
        const savedPath = exportJson(result, options.output);
        console.log(`✓ JSON report saved to ${savedPath}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else if (isHtml) {
      const outputPath = options.output || 'content-report.html';
      const savedPath = exportHtml(result, outputPath);
      console.log(`✓ HTML report saved to ${savedPath}`);
    } else {
      reportTerminal(result);
    }

    // CI mode
    if (options.ci) {
      let exitCode = 0;
      if (options.budgetEeat && result.scores.eeat < options.budgetEeat) {
        console.error(`❌ E-E-A-T score (${result.scores.eeat}) below budget (${options.budgetEeat})`);
        exitCode = 1;
      }
      if (options.budgetContent && result.scores.contentQuality < options.budgetContent) {
        console.error(`❌ Content Quality score (${result.scores.contentQuality}) below budget (${options.budgetContent})`);
        exitCode = 1;
      }
      if (exitCode > 0) process.exit(exitCode);
    }

    return result;
  } catch (error: any) {
    if (!isJson && !isHtml) spinner.stop('Error during analysis', false);
    console.error('Error:', error.message);
    process.exit(1);
  }
}
