import { HttpCrawler, RobotsTxt } from '@seocore/crawler';
import * as cheerio from 'cheerio';
import pc from 'picocolors';
import { discoverImagesFromHtml, resolveUrl } from './discovery.js';
import { ImageRecord } from './types.js';

export async function crawlSiteImages(
  startUrl: string,
  options: {
    maxImages: number;
    concurrency: number;
    userAgent?: string;
    timeout: number;
  }
): Promise<ImageRecord[]> {
  const crawler = new HttpCrawler();
  const startUrlObj = new URL(startUrl);
  const origin = startUrlObj.origin;

  // Resolve config for crawler
  const config: any = {
    retryCount: 1,
    rateLimitMs: 100,
  };

  // 1. Fetch robots.txt (optional but recommended)
  let robots: RobotsTxt | null = null;
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const robotsRes = await crawler.crawl(robotsUrl, config);
    if (robotsRes.statusCode === 200 && robotsRes.html) {
      robots = new RobotsTxt(robotsRes.html);
    }
  } catch {
    // Ignore robots.txt errors
  }

  const crawledPages = new Set<string>();
  const pageQueue: string[] = [startUrl];
  const globalImagesMap = new Map<string, ImageRecord>();

  console.log(pc.cyan(`\n🕷  Starting site crawl for image discovery (capped at ${options.maxImages} images)...`));

  // Breadth-first crawl
  while (pageQueue.length > 0) {
    // Check if we hit the image cap
    if (globalImagesMap.size >= options.maxImages) {
      console.warn(pc.yellow(`⚠️  Image discovery capped at ${options.maxImages} images. Stopping crawl.`));
      break;
    }

    const currentUrl = pageQueue.shift()!;
    if (crawledPages.has(currentUrl)) continue;
    crawledPages.add(currentUrl);

    // Robots.txt check
    if (robots) {
      try {
        const path = new URL(currentUrl).pathname;
        if (!robots.isAllowed(path)) {
          console.log(pc.gray(`  [Robots] Blocked: ${currentUrl}`));
          continue;
        }
      } catch {
        // Safe to ignore URL parsing errors for local paths
      }
    }

    console.log(`  ${pc.gray('[Page]')} Crawling ${currentUrl}...`);

    try {
      const result = await crawler.crawl(currentUrl, config);
      if (result.statusCode !== 200 || !result.html) {
        console.warn(pc.yellow(`  ⚠️  Failed to load ${currentUrl} (Status: ${result.statusCode})`));
        continue;
      }

      // Discover images on this page
      const imagesOnPage = discoverImagesFromHtml(result.html, currentUrl);
      for (const img of imagesOnPage) {
        if (globalImagesMap.size >= options.maxImages) {
          // If we exceed mid-page, stop adding new but preserve current
          break;
        }

        const existing = globalImagesMap.get(img.src);
        if (existing) {
          if (!existing.pages.includes(currentUrl)) {
            existing.pages.push(currentUrl);
          }
          // Preserve first-seen attrs
          if (img.alt && !existing.alt) existing.alt = img.alt;
          if (img.loading && !existing.loading) existing.loading = img.loading;
          if (img.decoding && !existing.decoding) existing.decoding = img.decoding;
          if (img.fetchpriority && !existing.fetchpriority) existing.fetchpriority = img.fetchpriority;
          if (img.width && !existing.width) existing.width = img.width;
          if (img.height && !existing.height) existing.height = img.height;
        } else {
          globalImagesMap.set(img.src, img);
        }
      }

      // Extract links to find new internal pages
      const $ = cheerio.load(result.html);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        // Resolve absolute URL
        const resolvedHref = resolveUrl(href, currentUrl);
        try {
          const hrefObj = new URL(resolvedHref);
          // Only crawl same origin and non-hash/non-file links (excluding html, php etc)
          if (hrefObj.origin === origin) {
            // Clean hash/queries
            hrefObj.hash = '';
            const cleanUrl = hrefObj.href;

            // Simple extensions filter (skip common files)
            const pathname = hrefObj.pathname.toLowerCase();
            const isFile = /\.(png|jpg|jpeg|gif|webp|svg|pdf|zip|gz|mp4|webm|mp3|css|js|xml|json)$/i.test(pathname);

            if (!isFile && !crawledPages.has(cleanUrl) && !pageQueue.includes(cleanUrl)) {
              // Safety check: don't let queue get insanely large
              if (pageQueue.length < 100) {
                pageQueue.push(cleanUrl);
              }
            }
          }
        } catch {
          // Ignore invalid URLs
        }
      });

    } catch (err: any) {
      console.warn(pc.yellow(`  ⚠️  Error crawling ${currentUrl}: ${err.message}`));
    }
  }

  console.log(pc.green(`✔  Crawl complete. Discovered ${globalImagesMap.size} unique images across ${crawledPages.size} pages.`));
  return Array.from(globalImagesMap.values());
}
