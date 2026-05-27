import { NormalizedPage } from '@seocore/sdk';
import type { SearchOpportunity, NormalizedGscPageMetrics } from './types.js';
import { calculateOpportunityScore } from './score.js';

export function findSchemaOpportunities(
  pages: Record<string, NormalizedPage>,
  gscData: Map<string, NormalizedGscPageMetrics>
): SearchOpportunity[] {
  const opportunities: SearchOpportunity[] = [];

  const importantPagesMissingSchema = Object.entries(pages).filter(([, page]) => {
    // Page has no structured data or empty array
    if (!page.structuredData || page.structuredData.length === 0) {
      // Exclude simple utility/resource paths
      const lowercaseUrl = page.url.toLowerCase();
      const isUtility = lowercaseUrl.includes('/login') ||
                        lowercaseUrl.includes('/logout') ||
                        lowercaseUrl.includes('/register') ||
                        lowercaseUrl.includes('/api/') ||
                        lowercaseUrl.includes('/cdn-cgi/');
      return !isUtility;
    }
    return false;
  });

  for (const [url, page] of importantPagesMissingSchema) {
    const gsc = gscData.get(url);
    const impressions = gsc ? gsc.impressions : 0;
    const position = gsc ? gsc.position : undefined;
    const clicks = gsc ? gsc.clicks : 0;

    // Infer schema need from URL/title pattern
    const lowercaseUrl = url.toLowerCase();
    const lowercaseTitle = page.title ? page.title.toLowerCase() : '';
    
    let inferredNeed = 'Structured Data (Schema.org)';
    let recommendation = 'Add relevant Schema.org markup (Product, Article, FAQPage, etc.)';
    let isProduct = false;

    if (lowercaseUrl.includes('/product') || lowercaseUrl.includes('/item') || lowercaseUrl.includes('/store') || lowercaseTitle.includes('product') || lowercaseTitle.includes('shop')) {
      inferredNeed = 'Product Schema';
      recommendation = 'Add JSON-LD Product schema including price, availability, and review aggregate ratings';
      isProduct = true;
    } else if (lowercaseUrl.includes('/blog') || lowercaseUrl.includes('/article') || lowercaseUrl.includes('/news') || lowercaseUrl.includes('/post') || lowercaseTitle.includes('article') || lowercaseTitle.includes('blog')) {
      inferredNeed = 'Article Schema';
      recommendation = 'Add JSON-LD Article or BlogPosting schema with author, datePublished, and publisher';
    } else if (lowercaseUrl.includes('/faq') || lowercaseTitle.includes('faq') || lowercaseTitle.includes('frequently asked questions')) {
      inferredNeed = 'FAQ Schema';
      recommendation = 'Add JSON-LD FAQPage schema with Question and Answer structured items';
    } else if (lowercaseUrl.includes('/about') || lowercaseTitle.includes('about us') || lowercaseTitle.includes('who we are')) {
      inferredNeed = 'AboutPage Schema';
      recommendation = 'Add JSON-LD AboutPage schema linked to Organization data';
    } else if (page.depth === 0) {
      inferredNeed = 'Organization / WebSite Schema';
      recommendation = 'Add JSON-LD Organization schema with company logo, social profiles, and ContactPoint information';
    } else {
      // If we cannot infer any specific need and page is deep (> 2) with low visibility, skip to avoid schema audit bloat
      const depth = page.depth !== undefined ? page.depth : 3;
      const hasVisibility = gsc && impressions > 100;
      if (depth > 2 && !hasVisibility) {
        continue;
      }
    }

    const isHighValue = gsc && (position !== undefined && position < 30);

    const scoreResult = calculateOpportunityScore({
      type: 'schema',
      highestSeverity: undefined, // schema missing is heuristic severity
      depth: page.depth,
      url,
      hasGsc: !!gsc,
      impressions,
      position,
      clicks,
    });

    let finalScore = scoreResult.score;
    let finalPriority = scoreResult.priority;
    const sourceSignals = [...scoreResult.signals];

    if (isProduct) {
      finalScore = Math.min(100, finalScore + 10);
      sourceSignals.push('E-commerce Boost: product-type page prioritized for rich-snippet eligibility');
    }

    if (isHighValue) {
      finalScore = Math.min(100, finalScore + 10);
      sourceSignals.push('Search Visibility Boost: page ranks on pages 1-3, schema can secure rich results');
    }

    if (finalScore >= 70) {
      finalPriority = 'high';
    } else if (finalScore >= 40) {
      finalPriority = 'medium';
    }

    const metrics: Record<string, number | string> = {
      structuredDataCount: 0,
      depth: page.depth !== undefined ? page.depth : 'N/A',
    };

    if (gsc) {
      metrics.impressions = impressions;
      metrics.position = position !== undefined ? position.toFixed(1) : 'N/A';
    }

    const reason = `Important page missing structured data. Adding ${inferredNeed} is highly recommended to secure rich results in search.`;

    opportunities.push({
      id: `schema-${sanitizeId(url)}`,
      url,
      title: page.title,
      type: 'schema',
      priority: finalPriority,
      score: finalScore,
      reason,
      supportingMetrics: metrics,
      recommendedActions: [
        recommendation,
        'Ensure @type matches page content accurately',
        'Include all Google-recommended properties for the entity type',
      ],
      sourceSignals,
    });
  }

  return opportunities;
}

function sanitizeId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
}
