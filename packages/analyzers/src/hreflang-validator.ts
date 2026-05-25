import { NormalizedPage } from '@seocore/sdk';

export interface HreflangPage {
  url: string;
  hreflang: Array<{ lang: string; url: string }>;
}

export interface HreflangValidationIssue {
  type: 'error' | 'warning';
  message: string;
  affectedUrls?: string[];
}

export interface HreflangValidationResult {
  network: Record<string, HreflangPage>;
  issues: HreflangValidationIssue[];
  warnings: HreflangValidationIssue[];
}

export class HreflangValidator {
  validate(pages: NormalizedPage[]): HreflangValidationResult {
    const network: Record<string, HreflangPage> = {};
    for (const page of pages) {
      network[page.url] = {
        url: page.url,
        hreflang: page.hreflang,
      };
    }

    const issues: HreflangValidationIssue[] = [];
    const warnings: HreflangValidationIssue[] = [];

    // Check bidirectional links
    this.checkBidirectionalLinks(network, issues, warnings);

    // Check x-default consistency
    this.checkXDefaultConsistency(network, issues, warnings);

    // Check language code validity
    this.checkLanguageCodes(network, issues, warnings);

    return { network, issues, warnings };
  }

  private checkBidirectionalLinks(
    network: Record<string, HreflangPage>,
    issues: HreflangValidationIssue[],
    _warnings: HreflangValidationIssue[]
  ): void {
    for (const [sourceUrl, sourcePage] of Object.entries(network)) {
      for (const alt of sourcePage.hreflang) {
        const targetPage = network[alt.url];
        if (!targetPage) continue;

        const reciprocalLink = targetPage.hreflang.find(
          (h) => h.url === sourceUrl && h.lang === alt.lang
        );

        if (!reciprocalLink) {
          issues.push({
            type: 'error',
            message: `${sourceUrl} links to ${alt.url} with lang="${alt.lang}", but ${alt.url} does not link back`,
            affectedUrls: [sourceUrl, alt.url],
          });
        }
      }
    }
  }

  private checkXDefaultConsistency(
    network: Record<string, HreflangPage>,
    _issues: HreflangValidationIssue[],
    warnings: HreflangValidationIssue[]
  ): void {
    const xDefaultUrls: string[] = [];
    for (const page of Object.values(network)) {
      const xDefault = page.hreflang.find((h) => h.lang === 'x-default');
      if (xDefault) {
        xDefaultUrls.push(xDefault.url);
      }
    }

    if (xDefaultUrls.length > 0) {
      const uniqueXDefaults = [...new Set(xDefaultUrls)];
      if (uniqueXDefaults.length > 1) {
        warnings.push({
          type: 'warning',
          message: `Multiple different x-default URLs found: ${uniqueXDefaults.join(', ')}`,
          affectedUrls: uniqueXDefaults,
        });
      }
    }
  }

  private checkLanguageCodes(
    network: Record<string, HreflangPage>,
    _issues: HreflangValidationIssue[],
    warnings: HreflangValidationIssue[]
  ): void {
    const validLangPattern = /^[a-z]{2}(-[A-Z]{2})?$|^x-default$/;
    for (const [url, page] of Object.entries(network)) {
      for (const alt of page.hreflang) {
        if (!validLangPattern.test(alt.lang)) {
          warnings.push({
            type: 'warning',
            message: `${url} has invalid language code: "${alt.lang}"`,
            affectedUrls: [url],
          });
        }
      }
    }
  }
}
