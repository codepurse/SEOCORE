export type OpportunityType = 'metadata' | 'performance' | 'indexing' | 'internal-links' | 'schema' | 'content';
export type OpportunityPriority = 'high' | 'medium' | 'low';

export interface SearchOpportunity {
  id: string;
  url: string;
  title?: string;
  type: OpportunityType;
  priority: OpportunityPriority;
  score: number;
  reason: string;
  supportingMetrics: Record<string, number | string>;
  recommendedActions: string[];
  sourceSignals: string[];
}

export interface NormalizedGscPageMetrics {
  url: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface NormalizedCruxPageMetrics {
  url: string;
  lcp?: number;
  cls?: number;
  inp?: number;
}

export interface PageSearchData {
  url: string;
  title?: string;
  gsc?: NormalizedGscPageMetrics;
  crux?: NormalizedCruxPageMetrics;
}

export interface OpportunitiesResult {
  url: string;
  generatedAt: string;
  dataSource: 'heuristics' | 'gsc' | 'gsc+crux';
  enrichedPages: number;
  scannedPages: number;
  opportunities: SearchOpportunity[];
  summary: {
    high: number;
    medium: number;
    low: number;
    byType: Record<OpportunityType, number>;
  };
}
