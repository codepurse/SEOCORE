import pc from 'picocolors';
import { discoverImagesFromHtml } from './discovery.js';
import { crawlSiteImages } from './crawler.js';
import { runPlaywrightCapture, mergePlaywrightData } from './playwright-runner.js';
import { fetchAllImages } from './fetcher.js';
import { decodeAllImages } from './decoder.js';
import { analyzeImages } from './analyzer.js';
import { calculateScoringAndBudgets } from './scoring.js';
import { ImageReporter } from './reporter.js';
import { HttpCrawler } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';

export async function runImagesCommand(url: string, options: any) {
  const startTime = Date.now();
  console.log(`${pc.bold(pc.cyan('🚀 SEOCORE IMAGE AUDIT CLI ENGINE'))}`);
  console.log('='.repeat(80));
  console.log(`Target starting URL:  ${pc.bold(url)}`);
  console.log(`Crawl Site-wide:      ${options.crawl ? pc.green('YES') : pc.gray('NO (single URL only)')}`);
  console.log(`Playwright Metrics:   ${options.playwright ? pc.green('ENABLED') : pc.gray('DISABLED')}`);
  console.log(`Individual Budget:    ${pc.bold(options.thresholdKb)} KB`);
  console.log(`Concurrency Limit:    ${pc.bold(options.concurrency)}`);
  console.log(`Fetch Timeout:        ${pc.bold(options.timeout)} ms`);
  console.log(`Reporter Output:      ${pc.bold(options.format || 'html')}`);
  console.log('='.repeat(80));

  let discoveredImages = [];

  // 1. Image Discovery
  if (options.crawl) {
    const maxImages = options.maxImages ? parseInt(options.maxImages, 10) : 500;
    discoveredImages = await crawlSiteImages(url, {
      maxImages,
      concurrency: parseInt(options.concurrency, 10),
      userAgent: options.userAgent,
      timeout: parseInt(options.timeout, 10),
    });
  } else {
    // Single URL image discovery
    console.log(pc.cyan(`\n🕷  Fetching static HTML and parsing images for ${url}...`));
    const crawler = new HttpCrawler();
    const config = resolveConfig();
    const result = await crawler.crawl(url, config);

    if (result.statusCode !== 200 || !result.html) {
      throw new Error(`Failed to load target page ${url} (Status code: ${result.statusCode}). Error: ${result.error || 'Unknown'}`);
    }

    discoveredImages = discoverImagesFromHtml(result.html, url);
    console.log(pc.green(`✔  Discovered ${discoveredImages.length} images from static HTML.`));
  }

  if (discoveredImages.length === 0) {
    console.log(pc.yellow('\n⚠  No images found. Exiting audit.'));
    return;
  }

  // 2. Optional Playwright capture (Run in parallel or sequentially)
  let playwrightImages = [];
  let lcpData = undefined;

  if (options.playwright) {
    const captureResult = await runPlaywrightCapture(url, parseInt(options.timeout, 10) * 3);
    playwrightImages = captureResult.images;
    lcpData = captureResult.lcp;
    
    // Merge Playwright runtime dimensions and loading strategies
    mergePlaywrightData(discoveredImages, playwrightImages, lcpData);
    console.log(pc.green(`✔  Merged runtime metrics for ${playwrightImages.length} images. LCP element: ${lcpData?.url ? 'Found' : 'Not Found/Not Image'}`));
  }

  // 3. Fetch Image Metadata (HEAD/GET with buffer collection)
  await fetchAllImages(discoveredImages, {
    concurrency: parseInt(options.concurrency, 10),
    userAgent: options.userAgent,
    timeout: parseInt(options.timeout, 10),
  });

  // 4. Sharp Metadata Decoding & JPEG Quality Heuristics
  await decodeAllImages(discoveredImages);

  // 5. Evaluate Declarative Image Audit Rules
  const ruleContext = {
    thresholdKb: parseInt(options.thresholdKb, 10),
    playwright: !!options.playwright,
  };
  const findings = analyzeImages(discoveredImages, ruleContext);
  console.log(pc.green(`✔  Evaluated rules. Generated ${findings.length} findings.`));

  // 6. Calculate Scoring & Budget Checks
  const auditResult = calculateScoringAndBudgets(discoveredImages, findings, {
    url,
    mode: options.crawl ? 'crawl' : 'single',
    playwright: !!options.playwright,
    thresholdKb: ruleContext.thresholdKb,
  });

  const durationMs = Date.now() - startTime;
  console.log(pc.green(`✔  Audit finished in ${(durationMs / 1000).toFixed(2)} seconds.`));

  // 7. Render Reports
  const format = (options.format || 'html').toLowerCase();
  
  if (format === 'json' || options.output?.endsWith('.json')) {
    const outPath = options.output || './seocore-images-report.json';
    const absPath = ImageReporter.exportJson(auditResult, outPath);
    console.log(pc.green(`✔  JSON Report exported to ${pc.bold(absPath)}`));
  }

  if (format === 'html' || options.output?.endsWith('.html') || !options.output) {
    const outPath = options.output || './seocore-images-report.html';
    const absPath = ImageReporter.exportHtml(auditResult, outPath);
    console.log(pc.green(`✔  HTML Report exported to ${pc.bold(absPath)}`));
  }

  // Always output summary to CLI terminal console
  ImageReporter.reportTerminal(auditResult);
}
