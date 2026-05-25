import * as cheerio from 'cheerio';
import { NormalizedPage } from '@seocore/sdk';

export interface AiCitationReadiness {
  score: number;
  findings: Array<{ type: 'error' | 'warning' | 'success'; message: string }>;
  structuredData: { present: boolean; types: string[] };
  llmsTxt: { present: boolean };
  semanticHtml: { good: boolean };
}

export class AiCitationReadinessAnalyzer {
  analyze(normalizedPage: NormalizedPage, aiVisibilityData?: any): AiCitationReadiness {
    const findings: Array<{ type: 'error' | 'warning' | 'success'; message: string }> = [];
    let score = 50;

    // Check structured data
    const structuredDataTypes = this.getStructuredDataTypes(normalizedPage.structuredData);
    const hasStructuredData = structuredDataTypes.length > 0;
    if (hasStructuredData) {
      score += 30;
      findings.push({ type: 'success', message: `Structured data present (types: ${structuredDataTypes.join(', ')})` });
    } else {
      findings.push({ type: 'warning', message: 'Add structured data (JSON-LD, Microdata, or RDFa) for better AI citation' });
    }

    // Check semantic HTML
    const semanticHtmlGood = this.checkSemanticHtml(normalizedPage.html);
    if (semanticHtmlGood) {
      score += 20;
      findings.push({ type: 'success', message: 'Good use of semantic HTML elements' });
    } else {
      findings.push({ type: 'warning', message: 'Consider using more semantic HTML elements (article, section, header, footer, etc.)' });
    }

    // Check llms.txt (from aiVisibilityData if available)
    let hasLlmsTxt = false;
    if (aiVisibilityData) {
      hasLlmsTxt = aiVisibilityData.llmsTxtPresent || false;
    }
    if (hasLlmsTxt) {
      score += 20;
      findings.push({ type: 'success', message: 'llms.txt file present' });
    }

    // Check clear authorship
    const hasAuthorship = this.checkAuthorship(normalizedPage.html);
    if (hasAuthorship) {
      score += 15;
      findings.push({ type: 'success', message: 'Clear authorship attribution present' });
    }

    return {
      score: Math.min(100, score),
      findings,
      structuredData: { present: hasStructuredData, types: structuredDataTypes },
      llmsTxt: { present: hasLlmsTxt },
      semanticHtml: { good: semanticHtmlGood },
    };
  }

  private getStructuredDataTypes(structuredData: any[]): string[] {
    const types = new Set<string>();
    structuredData.forEach(sd => {
      if (sd['@type']) {
        if (Array.isArray(sd['@type'])) {
          sd['@type'].forEach((t: string) => types.add(t));
        } else {
          types.add(sd['@type']);
        }
      }
    });
    return Array.from(types);
  }

  private checkSemanticHtml(html: string): boolean {
    const $ = cheerio.load(html);
    const semanticElements = ['article', 'section', 'header', 'footer', 'nav', 'aside', 'main', 'figure', 'figcaption'];
    let count = 0;
    semanticElements.forEach(el => {
      count += $(el).length;
    });
    return count >= 3;
  }

  private checkAuthorship(html: string): boolean {
    const $ = cheerio.load(html);
    return $('meta[name="author"]').length > 0 ||
           $('.author').length > 0 ||
           $('[class*="author"]').length > 0 ||
           $('[rel="author"]').length > 0 ||
           $('address').length > 0;
  }
}
