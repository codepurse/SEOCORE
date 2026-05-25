import pc from 'picocolors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page, devices } from 'playwright';
import { SitemapParser } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIEWPORT_SIZES = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

export async function captureScreenshots(
  url: string,
  options: {
    breakpoints?: string;
    device?: string;
    fullPage?: boolean;
    deep?: boolean;
    output?: string;
    config?: string;
    timeout?: string;
  },
) {
  const config = resolveConfig({}, options.config);
  const outputDir = options.output || path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : 30000;

  let targetUrls: string[] = [url];
  if (options.deep) {
    // Use existing sitemap parser to get all URLs
    try {
      const { HttpCrawler } = await import('@seocore/crawler');
      const crawler = new HttpCrawler();
      const baseUrl = new URL(url);
      const sitemapUrl = `${baseUrl.origin}/sitemap.xml`;
      const result = await crawler.crawl(sitemapUrl, config);
      if (result.statusCode === 200 && result.html) {
        const sitemapUrls = SitemapParser.parse(result.html);
        if (sitemapUrls.length > 0) {
          targetUrls = sitemapUrls;
        }
      }
    } catch (err) {
      console.warn(pc.yellow('⚠️  Could not parse sitemap, falling back to just the landing page'));
    }
  }

  const browser = await chromium.launch({ headless: true });
  console.log(`${pc.bold('🚀 SEOCORE SCREENSHOT COMMAND')}`);
  console.log('='.repeat(80));
  console.log(`Target:         ${url}`);
  console.log(`Output dir:     ${outputDir}`);
  console.log(`Deep crawl:     ${options.deep ? 'yes' : 'no'}`);
  console.log(`Timeout:        ${timeoutMs}ms`);
  console.log('='.repeat(80));

  for (const targetUrl of targetUrls) {
    console.log(`\n${pc.cyan('📸 Processing:')} ${targetUrl}`);
    await captureForUrl(browser, targetUrl, outputDir, options, timeoutMs);
  }

  await browser.close();
  console.log(`\n${pc.bold(pc.green('✅ Done!'))} All screenshots saved to ${outputDir}`);
}

async function captureForUrl(
  browser: Browser,
  url: string,
  outputDir: string,
  options: any,
  timeoutMs: number,
) {
  const urlSlug = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9-_]/g, '_');

  if (options.device) {
    // Use Playwright device descriptor
    const device = devices[options.device];
    if (!device) {
      console.warn(`  ${pc.yellow('⚠️  Device not found:')} ${options.device}`);
      return;
    }
    const context = await browser.newContext(device);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (err) {
      console.warn(`  ${pc.yellow('⚠️  Navigation timeout, taking screenshot anyway')}`);
    }
    const screenshotPath = path.join(outputDir, `${urlSlug}-${options.device.replace(/\s/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: options.fullPage });
    console.log(`  ${pc.green('✓')} Saved: ${screenshotPath}`);
    await context.close();
    return;
  }

  // Use specified breakpoints
  const breakpoints = options.breakpoints
    ? options.breakpoints.split(',').map((b: string) => b.trim().toLowerCase())
    : ['desktop'];

  for (const breakpoint of breakpoints) {
    const size = VIEWPORT_SIZES[breakpoint as keyof typeof VIEWPORT_SIZES];
    if (!size) {
      console.warn(`  ${pc.yellow('⚠️  Invalid breakpoint:')} ${breakpoint}`);
      continue;
    }
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (err) {
      console.warn(`  ${pc.yellow('⚠️  Navigation timeout, taking screenshot anyway')}`);
    }
    const screenshotPath = path.join(outputDir, `${urlSlug}-${breakpoint}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: options.fullPage });
    console.log(`  ${pc.green('✓')} Saved: ${screenshotPath}`);
    await context.close();
  }
}
