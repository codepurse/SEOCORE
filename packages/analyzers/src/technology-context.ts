import { NormalizedPage } from '@seocore/sdk';
import * as cheerio from 'cheerio';

export interface TechnologyContext {
  page: NormalizedPage;
  headers: Record<string, string | undefined>;
  $?: cheerio.CheerioAPI;
  html: string;
  htmlLower: string;
  scriptSrcs: string[];
  inlineScripts: string[];
  stylesheetHrefs: string[];
  linkHrefs: string[];
  imageSrcs: string[];
  assetUrls: string[];
  assetHosts: string[];
  metaGenerator?: string;
  bodyTextLength: number;
}

export class TechnologyContextBuilder {
  static build(page: NormalizedPage): TechnologyContext {
    // Normalize headers to lowercase keys
    const headers: Record<string, string | undefined> = {};
    if (page.headers) {
      for (const [key, value] of Object.entries(page.headers)) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
      }
    }

    // Build Cheerio instance and extract common elements
    let $: cheerio.CheerioAPI | undefined;
    const html = page.html ?? '';
    const scriptSrcs: string[] = [];
    const inlineScripts: string[] = [];
    const stylesheetHrefs: string[] = [];
    const linkHrefs: string[] = [];
    const imageSrcs: string[] = [];
    let metaGenerator: string | undefined;
    let bodyTextLength = 0;

    if (html) {
      $ = cheerio.load(html);
      const $safe = $;

      $safe('script[src]').each((_, el) => {
        const src = $safe(el).attr('src');
        if (src) scriptSrcs.push(src);
      });

      $safe('script:not([src])').each((_, el) => {
        const content = $safe(el).html()?.trim();
        if (content) inlineScripts.push(content);
      });

      $safe('link[href]').each((_, el) => {
        const href = $safe(el).attr('href');
        if (!href) return;
        linkHrefs.push(href);
        if (($safe(el).attr('rel') || '').toLowerCase().includes('stylesheet')) {
          stylesheetHrefs.push(href);
        }
      });

      $safe('img[src]').each((_, el) => {
        const src = $safe(el).attr('src');
        if (src) imageSrcs.push(src);
      });

      const generatorMeta = $safe('meta[name="generator"]');
      if (generatorMeta.length > 0) {
        metaGenerator = generatorMeta.attr('content');
      }

      bodyTextLength = $safe('body').text().replace(/\s+/g, ' ').trim().length;
    }

    const assetUrls = [...scriptSrcs, ...stylesheetHrefs, ...linkHrefs, ...imageSrcs];
    const assetHosts = [...new Set(assetUrls.map(url => this.getHost(url, page.url)).filter(Boolean) as string[])];

    return {
      page,
      headers,
      $,
      html,
      htmlLower: html.toLowerCase(),
      scriptSrcs,
      inlineScripts,
      stylesheetHrefs,
      linkHrefs,
      imageSrcs,
      assetUrls,
      assetHosts,
      metaGenerator,
      bodyTextLength
    };
  }

  private static getHost(url: string, base: string): string | undefined {
    try {
      return new URL(url, base).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }
}
