import axios from 'axios';
import { chromium, type BrowserContext } from 'playwright';
import path from 'node:path';
import os from 'node:os';

export interface RankResult {
  keyword: string;
  targetUrl: string;
  targetDomain: string;
  inTop10: boolean;
  position: number | null;
  topResults: Array<{ position: number; title: string; url: string; domain: string }>;
  source: 'serpapi' | 'playwright';
  checkedAt: string;
  error?: string;
}

export interface RankOptions {
  headless?: boolean;
  profileDir?: string;
}

const SERPAPI_TIMEOUT_MS = 20000;

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

function findPosition(
  targetDomain: string,
  results: Array<{ position: number; domain: string }>
): number | null {
  const match = results.find(
    r => r.domain === targetDomain || r.domain.endsWith(`.${targetDomain}`)
  );
  return match ? match.position : null;
}

/**
 * Primary: SerpAPI (https://serpapi.com) — reliable, handles captcha.
 * Free 100 searches/month. Requires SERPAPI_KEY env var.
 */
async function checkViaSerpApi(
  keyword: string,
  targetUrl: string,
  apiKey: string
): Promise<RankResult> {
  const checkedAt = new Date().toISOString();
  const targetDomain = extractDomain(targetUrl);

  const res = await axios.get('https://serpapi.com/search.json', {
    params: {
      engine: 'google',
      q: keyword,
      num: 10,
      hl: 'en',
      gl: 'us',
      api_key: apiKey,
    },
    timeout: SERPAPI_TIMEOUT_MS,
  });

  const raw = res.data?.organic_results || [];
  const topResults = raw.slice(0, 10).map((r: any, i: number) => ({
    position: r.position ?? i + 1,
    title: r.title || '',
    url: r.link || '',
    domain: extractDomain(r.link || ''),
  }));

  const position = findPosition(targetDomain, topResults);

  return {
    keyword,
    targetUrl,
    targetDomain,
    inTop10: position !== null,
    position,
    topResults,
    source: 'serpapi',
    checkedAt,
  };
}

/**
 * Fallback: Playwright headless Chromium scrape.
 * Often hits Google captcha — best effort only.
 */
async function checkViaPlaywright(
  keyword: string,
  targetUrl: string,
  opts: RankOptions = {}
): Promise<RankResult> {
  const checkedAt = new Date().toISOString();
  const targetDomain = extractDomain(targetUrl);
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    keyword
  )}&hl=en&gl=us&num=20&pws=0&udm=14`;

  const headless = opts.headless ?? true;
  const profileDir =
    opts.profileDir ?? path.join(os.homedir(), '.seocore', 'rank-profile');

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless,
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await page.waitForSelector('#search, #rso, form#captcha-form', { timeout: 8000 });
    } catch {
      // continue
    }

    // If captcha shown and we're headed, give user up to 90s to solve manually
    const isCaptcha = async () =>
      page.evaluate(() => {
        return !!(
          document.querySelector('form#captcha-form') ||
          document.querySelector('div.g-recaptcha') ||
          document.body.innerText.includes('unusual traffic')
        );
      });

    if (await isCaptcha()) {
      if (!headless) {
        console.log('\n⚠  Google captcha detected — please solve it in the browser window (90s)...');
        try {
          await page.waitForFunction(
            () => !document.querySelector('form#captcha-form') && !document.body.innerText.includes('unusual traffic'),
            { timeout: 90000 }
          );
          await page.waitForSelector('#search, #rso', { timeout: 8000 }).catch(() => {});
        } catch {
          return {
            keyword,
            targetUrl,
            targetDomain,
            inTop10: false,
            position: null,
            topResults: [],
            source: 'playwright',
            checkedAt,
            error: 'Captcha not solved within 90s.',
          };
        }
      } else {
        return {
          keyword,
          targetUrl,
          targetDomain,
          inTop10: false,
          position: null,
          topResults: [],
          source: 'playwright',
          checkedAt,
          error:
            'Google captcha in headless mode. Run with --show once to solve and re-warm profile.',
        };
      }
    }

    // Dismiss consent popup
    try {
      const consentBtn = await page.$(
        'button:has-text("Accept all"), button:has-text("I agree"), button#L2AGLb'
      );
      if (consentBtn) {
        await consentBtn.click({ timeout: 3000 });
        await page.waitForTimeout(500);
      }
    } catch {
      // ignore
    }

    const organic = await page.evaluate(() => {
      const root =
        document.querySelector('#search') || document.querySelector('#rso') || document.body;
      const anchors = Array.from(root.querySelectorAll('a')) as HTMLAnchorElement[];
      const seen = new Set<string>();
      const out: Array<{ title: string; url: string }> = [];

      for (const anchor of anchors) {
        const h3 = anchor.querySelector('h3');
        if (!h3) continue;
        const href = anchor.href;
        if (
          !href ||
          !href.startsWith('http') ||
          href.includes('google.com/search') ||
          href.includes('google.com/url') ||
          href.includes('webcache.googleusercontent') ||
          href.includes('/aclk?') ||
          href.includes('googleadservices') ||
          href.includes('translate.google')
        )
          continue;

        if (seen.has(href)) continue;
        seen.add(href);
        out.push({ title: h3.textContent?.trim() || '', url: href });
        if (out.length >= 10) break;
      }
      return out;
    });

    if (organic.length === 0 && process.env.RANK_DEBUG) {
      const fs = await import('node:fs');
      const html = await page.content();
      fs.writeFileSync('debug-google-results.html', html, 'utf8');
    }

    const topResults = organic.map((r, i) => ({
      position: i + 1,
      title: r.title,
      url: r.url,
      domain: extractDomain(r.url),
    }));

    const position = findPosition(targetDomain, topResults);

    return {
      keyword,
      targetUrl,
      targetDomain,
      inTop10: position !== null,
      position,
      topResults,
      source: 'playwright',
      checkedAt,
      error:
        topResults.length === 0
          ? 'No organic results parsed. Try --show to solve captcha.'
          : undefined,
    };
  } catch (err: any) {
    return {
      keyword,
      targetUrl,
      targetDomain,
      inTop10: false,
      position: null,
      topResults: [],
      source: 'playwright',
      checkedAt,
      error: err.message,
    };
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Check Google top 10 rank for keyword. Uses SerpAPI if SERPAPI_KEY env var is set,
 * otherwise falls back to Playwright with persistent real-Chrome profile.
 */
export async function checkGoogleRank(
  keyword: string,
  targetUrl: string,
  opts: RankOptions = {}
): Promise<RankResult> {
  const apiKey = process.env.SERPAPI_KEY;
  if (apiKey) {
    try {
      return await checkViaSerpApi(keyword, targetUrl, apiKey);
    } catch (err: any) {
      const fallback = await checkViaPlaywright(keyword, targetUrl, opts);
      fallback.error = `SerpAPI failed (${err.message}); fallback used. ${fallback.error || ''}`.trim();
      return fallback;
    }
  }
  return checkViaPlaywright(keyword, targetUrl, opts);
}
