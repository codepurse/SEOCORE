import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export interface FetchedSite {
  url: string;
  $: cheerio.CheerioAPI;
  rawHtml: string;
  robotsTxt: string | null;
  llmsTxt: string | null;
  sitemapXml: string | null;
  fetchError?: string;
}

export async function fetchSite(url: string): Promise<FetchedSite> {
  let origin = '';
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
  } catch (err: any) {
    return {
      url,
      $: cheerio.load(''),
      rawHtml: '',
      robotsTxt: null,
      llmsTxt: null,
      sitemapXml: null,
      fetchError: `Invalid URL: ${err.message}`,
    };
  }

  const robotsUrl = `${origin}/robots.txt`;
  const llmsUrl = `${origin}/llms.txt`;
  const sitemapUrl = `${origin}/sitemap.xml`;

  const fetchPage = async (): Promise<string> => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEO-CLI-AI-Analyzer/1.0)' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.text();
  };

  const fetchRobots = async (): Promise<string | null> => {
    try {
      const res = await fetch(robotsUrl);
      if (res.status === 200) {
        return await res.text();
      }
      return null;
    } catch {
      return null;
    }
  };

  const fetchLlms = async (): Promise<string | null> => {
    try {
      const res = await fetch(llmsUrl);
      if (res.status === 200) {
        return await res.text();
      }
      return null;
    } catch {
      return null;
    }
  };

  const fetchSitemap = async (): Promise<string | null> => {
    try {
      const res = await fetch(sitemapUrl);
      if (res.status === 200) {
        return await res.text();
      }
      return null;
    } catch {
      return null;
    }
  };

  try {
    const [htmlResult, robotsTxt, llmsTxt, sitemapXml] = await Promise.all([
      fetchPage().catch((err: Error) => err),
      fetchRobots(),
      fetchLlms(),
      fetchSitemap(),
    ]);

    if (htmlResult instanceof Error) {
      return {
        url,
        $: cheerio.load(''),
        rawHtml: '',
        robotsTxt,
        llmsTxt,
        sitemapXml,
        fetchError: htmlResult.message,
      };
    }

    return {
      url,
      $: cheerio.load(htmlResult),
      rawHtml: htmlResult,
      robotsTxt,
      llmsTxt,
      sitemapXml,
    };
  } catch (err: any) {
    return {
      url,
      $: cheerio.load(''),
      rawHtml: '',
      robotsTxt: null,
      llmsTxt: null,
      sitemapXml: null,
      fetchError: err.message,
    };
  }
}
