import { ImageRecord } from './types.js';
import pc from 'picocolors';

export interface PlaywrightImageDetails {
  src: string;
  currentSrc: string;
  renderedWidth: number;
  renderedHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  inViewport: boolean;
  loading: string;
}

export interface PlaywrightLcpDetails {
  url?: string;
  size?: number;
  tagName?: string;
  selector?: string;
}

export async function runPlaywrightCapture(
  url: string,
  timeoutMs: number = 30000
): Promise<{ images: PlaywrightImageDetails[]; lcp?: PlaywrightLcpDetails }> {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err: any) {
    console.warn(pc.yellow(`⚠️  Playwright not found, skipping runtime metrics. Error: ${err.message}`));
    return { images: [] };
  }

  console.log(pc.cyan(`\n🎬  Launching headless browser to gather layout and LCP metrics...`));
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore; Playwright-Images)',
  });

  // Inject LCP observer script before navigation
  await context.addInitScript(() => {
    // Helper to get CSS selector
    function getCssSelector(el: any): string {
      if (!el) return '';
      try {
        if (el.id) return '#' + el.id;
        const path: string[] = [];
        let current = el;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.nodeName.toLowerCase();
          if (current.id) {
            selector += '#' + current.id;
            path.unshift(selector);
            break;
          } else {
            let sib = current;
            let nth = 1;
            while (sib = sib.previousElementSibling) {
              if (sib.nodeName.toLowerCase() === current.nodeName.toLowerCase()) nth++;
            }
            if (nth > 1) {
              selector += `:nth-of-type(${nth})`;
            }
          }
          path.unshift(selector);
          current = current.parentElement;
        }
        return path.join(' > ');
      } catch {
        return el.tagName ? el.tagName.toLowerCase() : '';
      }
    }

    (window as any).lcpData = null;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as any;
      if (lastEntry) {
        (window as any).lcpData = {
          url: lastEntry.url || undefined,
          size: lastEntry.size,
          tagName: lastEntry.element ? lastEntry.element.tagName : undefined,
          selector: lastEntry.element ? getCssSelector(lastEntry.element) : undefined,
        };
      }
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    
    // Wait slightly for network idle and lay out stabilizing
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Ignore networkidle timeout
    }

    // Evaluate image details
    const images = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const imgs = Array.from(document.querySelectorAll('img'));

      return imgs.map((img) => {
        const rect = img.getBoundingClientRect();
        const inViewport = (
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= viewportHeight &&
          rect.left <= viewportWidth
        );

        return {
          src: img.src,
          currentSrc: img.currentSrc || img.src,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          inViewport,
          loading: img.getAttribute('loading') || 'eager',
        };
      });
    });

    // Extract LCP details
    const lcp = await page.evaluate(() => (window as any).lcpData || undefined) as PlaywrightLcpDetails | undefined;

    await browser.close();
    return { images, lcp };
  } catch (err: any) {
    console.warn(pc.yellow(`⚠️  Playwright page navigation failed: ${err.message}`));
    await browser.close();
    return { images: [] };
  }
}

export function mergePlaywrightData(
  records: ImageRecord[],
  playwrightImages: PlaywrightImageDetails[],
  lcp?: PlaywrightLcpDetails
): void {
  // Map playwright image info by URL for fast lookups
  const pwMap = new Map<string, PlaywrightImageDetails>();
  for (const pwImg of playwrightImages) {
    pwMap.set(pwImg.src, pwImg);
    if (pwImg.currentSrc && pwImg.currentSrc !== pwImg.src) {
      pwMap.set(pwImg.currentSrc, pwImg);
    }
  }

  for (const record of records) {
    const pwData = pwMap.get(record.src);
    if (pwData) {
      record.renderedWidth = pwData.renderedWidth;
      record.renderedHeight = pwData.renderedHeight;
      record.naturalWidth = pwData.naturalWidth;
      record.naturalHeight = pwData.naturalHeight;
      record.inViewport = pwData.inViewport;
      if (pwData.loading) record.loading = pwData.loading;
    }

    // Check if this image is the LCP element
    if (lcp && lcp.url) {
      // Clean query parameters and resolve absolute for both to compare accurately
      try {
        const lcpUrlClean = new URL(lcp.url).pathname;
        const recordUrlClean = new URL(record.src).pathname;
        if (lcpUrlClean === recordUrlClean || lcp.url === record.src) {
          record.isLcp = true;
          record.lcpSelector = lcp.selector;
        }
      } catch {
        if (lcp.url === record.src) {
          record.isLcp = true;
          record.lcpSelector = lcp.selector;
        }
      }
    }
  }
}
