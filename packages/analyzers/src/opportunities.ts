import { NormalizedPage, Finding } from '@seocore/sdk';
import { OpportunitiesEngine } from './opportunities/engine.js';
import type {
  OpportunityType,
  OpportunityPriority,
  SearchOpportunity,
  NormalizedGscPageMetrics,
  NormalizedCruxPageMetrics,
  PageSearchData,
  OpportunitiesResult,
} from './opportunities/types.js';

export type {
  OpportunityType,
  OpportunityPriority,
  SearchOpportunity,
  PageSearchData,
  OpportunitiesResult,
};

// Maintain compatibility names for outer packages if they reference them
export type GscMetrics = NormalizedGscPageMetrics;
export type CruxMetrics = NormalizedCruxPageMetrics;

export class OpportunitiesAnalyzer {
  private engine = new OpportunitiesEngine();
  private rawGsc: NormalizedGscPageMetrics[] = [];
  private rawCrux: NormalizedCruxPageMetrics[] = [];

  setGscData(data: PageSearchData[]): void {
    this.rawGsc = data
      .filter(item => item.gsc !== undefined)
      .map(item => ({
        url: item.url,
        impressions: item.gsc!.impressions || 0,
        clicks: item.gsc!.clicks || 0,
        ctr: item.gsc!.ctr || 0,
        position: item.gsc!.position || 0,
      }));
    this.engine.setGscData(this.rawGsc);
  }

  setCruxData(data: PageSearchData[]): void {
    this.rawCrux = data
      .filter(item => item.crux !== undefined)
      .map(item => ({
        url: item.url,
        lcp: item.crux!.lcp,
        cls: item.crux!.cls,
        inp: item.crux!.inp,
      }));
    this.engine.setCruxData(this.rawCrux);
  }

  analyze(
    pages: Record<string, NormalizedPage>,
    findings: Finding[],
    url?: string
  ): OpportunitiesResult {
    return this.engine.run(pages, findings, url);
  }
}
export * from './opportunities/types.js';
export * from './opportunities/providers.js';
export * from './opportunities/normalizers.js';
export * from './opportunities/engine.js';
export * from './opportunities/score.js';
export * from './opportunities/dedupe.js';
export * from './opportunities/metadata.js';
export * from './opportunities/performance.js';
export * from './opportunities/indexing.js';
export * from './opportunities/internal-links.js';
export * from './opportunities/schema.js';
export * from './opportunities/content.js';
