import { NormalizedPage, Finding } from '@seocore/sdk';
import type {
  OpportunitiesResult,
  SearchOpportunity,
  NormalizedGscPageMetrics,
  NormalizedCruxPageMetrics,
  OpportunityType,
} from './types.js';

import { findMetadataOpportunities } from './metadata.js';
import { findPerformanceOpportunities } from './performance.js';
import { findIndexingOpportunities } from './indexing.js';
import { findInternalLinkOpportunities } from './internal-links.js';
import { findSchemaOpportunities } from './schema.js';
import { findContentOpportunities } from './content.js';
import { deduplicateOpportunities } from './dedupe.js';

export class OpportunitiesEngine {
  private gscData: Map<string, NormalizedGscPageMetrics> = new Map();
  private cruxData: Map<string, NormalizedCruxPageMetrics> = new Map();

  setGscData(data: NormalizedGscPageMetrics[]): void {
    this.gscData.clear();
    for (const item of data) {
      this.gscData.set(item.url, item);
    }
  }

  setCruxData(data: NormalizedCruxPageMetrics[]): void {
    this.cruxData.clear();
    for (const item of data) {
      this.cruxData.set(item.url, item);
    }
  }

  run(
    pages: Record<string, NormalizedPage>,
    findings: Finding[],
    url?: string
  ): OpportunitiesResult {
    const rawOpportunities: SearchOpportunity[] = [];

    // 1. Gather all raw opportunities
    rawOpportunities.push(...findMetadataOpportunities(pages, findings, this.gscData));
    rawOpportunities.push(...findPerformanceOpportunities(pages, findings, this.gscData, this.cruxData));
    rawOpportunities.push(...findIndexingOpportunities(pages, findings, this.gscData));
    rawOpportunities.push(...findInternalLinkOpportunities(pages, this.gscData));
    rawOpportunities.push(...findSchemaOpportunities(pages, this.gscData));
    rawOpportunities.push(...findContentOpportunities(pages, findings, this.gscData));

    // 2. Deduplicate and collapse
    const opportunities = deduplicateOpportunities(rawOpportunities);

    // 3. Deterministic sorting:
    //    - highest score first
    //    - tie-break by priority (high -> medium -> low)
    //    - tie-break by URL alphabetically
    opportunities.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.url.localeCompare(b.url);
    });

    // 4. Counts & Summaries
    const high = opportunities.filter(o => o.priority === 'high').length;
    const medium = opportunities.filter(o => o.priority === 'medium').length;
    const low = opportunities.filter(o => o.priority === 'low').length;

    const byType: Record<OpportunityType, number> = {
      metadata: 0,
      performance: 0,
      indexing: 0,
      'internal-links': 0,
      schema: 0,
      content: 0,
    };

    for (const opp of opportunities) {
      byType[opp.type]++;
    }

    // 5. Determine exact data source label
    let dataSource: 'heuristics' | 'gsc' | 'gsc+crux' = 'heuristics';
    if (this.gscData.size > 0 && this.cruxData.size > 0) {
      dataSource = 'gsc+crux';
    } else if (this.gscData.size > 0) {
      dataSource = 'gsc';
    }

    const enrichedUrls = new Set<string>();
    for (const url of this.gscData.keys()) {
      if (pages[url]) enrichedUrls.add(url);
    }
    for (const url of this.cruxData.keys()) {
      if (pages[url]) enrichedUrls.add(url);
    }

    const scannedPages = Object.keys(pages).length;

    return {
      url: url || Object.keys(pages)[0] || 'unknown',
      generatedAt: new Date().toISOString(),
      dataSource,
      enrichedPages: enrichedUrls.size,
      scannedPages,
      opportunities,
      summary: {
        high,
        medium,
        low,
        byType,
      },
    };
  }
}
