import { Command } from 'commander';
import { JsImpactReport, JsImpactConfig, JsImpactReporter } from '@seocore/sdk';
import { RenderedCrawler } from '@seocore/crawler';
import { JsImpactAnalyzer } from '@seocore/analyzers';
import { resolveConfig } from '@seocore/config';
import pc from 'picocolors';
import { validateUrl } from '../../shared/validation.js';
import { JsImpactTerminalReporter } from '../../reporters/js-impact-terminal.js';
import { JsImpactJsonReporter } from '../../reporters/js-impact-json.js';
import { JsImpactHtmlReporter } from '../../reporters/js-impact-html.js';
import { JsImpactMarkdownReporter } from '../../reporters/js-impact-markdown.js';

export function command(): Command {
  return new Command('js-impact')
    .description('Compare raw vs rendered HTML for JavaScript SEO impact')
    .argument('<url>', 'URL to analyze')
    .option('-w, --wait-event <event>', 'Wait event before capture (load, domcontentloaded, networkidle)', 'networkidle')
    .option('-t, --timeout-ms <ms>', 'Timeout in milliseconds', '30000')
    .option('-e, --wait-extra-ms <ms>', 'Extra wait time in milliseconds', '0')
    .option('-o, --output <format>', 'Output format (terminal, json, html, markdown)', 'terminal')
    .option('--output-file <path>', 'Output file for non-terminal formats')
    .option('-c, --config <path>', 'Path to seocore.config.json file')
    .addHelpText('after', '\nExamples:\n  seo js-impact https://example.com\n  seo js-impact https://example.com --output html --output-file report.html\n  seo js-impact https://example.com --wait-event load --timeout-ms 45000')
    .action(handler);
}

async function handler(urlArg: string, options: any): Promise<void> {
  const config = resolveConfig({}, options.config);
  validateUrl(urlArg, 'Target URL');
  const url = urlArg;

  console.log(pc.cyan('Fetching raw and rendered HTML...'));

  try {
    const crawler = new RenderedCrawler(config.cacheDir);

    const jsConfig: JsImpactConfig = {
      waitEvent: options.waitEvent ?? 'networkidle',
      waitExtraMs: options.waitExtraMs ? Number.parseInt(options.waitExtraMs, 10) : 0,
      timeoutMs: options.timeoutMs ? Number.parseInt(options.timeoutMs, 10) : 30000,
    };

    const fetchResult = await crawler.crawlRendered(url, config, {
      waitEvent: jsConfig.waitEvent,
      waitExtraMs: jsConfig.waitExtraMs,
      timeoutMs: jsConfig.timeoutMs,
    });

    console.log(pc.cyan('Analyzing JavaScript impact...'));

    const analyzer = new JsImpactAnalyzer();
    const report = await analyzer.analyze(url, fetchResult, { config: jsConfig });

    console.log(pc.green('Analysis complete!'));

    let reporter: JsImpactReporter;
    switch (options.output) {
      case 'json':
        reporter = new JsImpactJsonReporter();
        break;
      case 'html':
        reporter = new JsImpactHtmlReporter();
        break;
      case 'markdown':
        reporter = new JsImpactMarkdownReporter();
        break;
      default:
        reporter = new JsImpactTerminalReporter();
    }

    if (options.output === 'terminal') {
      reporter.report(report);
    } else if (options.outputFile) {
      await reporter.write(report, options.outputFile);
    } else {
      await reporter.write(report, `js-impact-report-${Date.now()}.${options.output}`);
    }

    await crawler.close();
  } catch (error: any) {
    console.error(pc.red('Analysis failed:'), error.message);
    process.exit(1);
  }
}
