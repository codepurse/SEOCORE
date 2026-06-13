import type { KeywordIntelligenceConfig } from '@seocore/sdk';

export type SearchIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'local'
  | 'jobs-career';

export type KeywordSourceType = 'direct' | 'question' | 'alphabetical' | 'semantic';

export type ClusterKind = 'pillar' | 'supporting' | 'intent' | 'fallback';

export type ClusterLabelSource = 'semantic-bucket' | 'phrase' | 'intent' | 'fallback';

export interface KeywordSuggestion {
  keyword: string;
  normalizedKeyword: string;
  sourceType: KeywordSourceType;
  index: number;
}

export interface KeywordNoiseAssessment {
  score: number;
  allowlisted: boolean;
  hardFiltered: boolean;
  reasons: string[];
}

export interface ScoredKeyword {
  keyword: string;
  normalizedKeyword: string;
  intent: SearchIntent;
  score: number;
  heuristicScore: number;
  businessIntentScore: number;
  topicalImportance: number;
  sourceType: KeywordSourceType;
  noiseScore: number;
  noiseAssessment: KeywordNoiseAssessment;
  clusterKey?: string;
  clusterLabel?: string;
}

export interface TopicCluster {
  key: string;
  name: string;
  keywords: ScoredKeyword[];
  primaryIntent: SearchIntent;
  averageScore: number;
  qualityScore: number;
  cohesion: number;
  intentConsistency: number;
  semanticTightness: number;
  kind: ClusterKind;
  labelSource: ClusterLabelSource;
}

export interface FilteredKeyword {
  keyword: string;
  noiseScore: number;
  reasons: string[];
}

export interface KeywordIntelligence {
  seedKeyword: string;
  lang: string;
  country: string;
  checkedAt: string;
  metrics: {
    totalDiscovered: number;
    totalFiltered: number;
    totalHardFiltered: number;
    totalSoftDownRanked: number;
    intentsDistribution: Record<SearchIntent, number>;
  };
  clusters: TopicCluster[];
  allScoredKeywords: ScoredKeyword[];
  filteredKeywords: FilteredKeyword[];
}

export interface KeywordResearchOptions {
  lang?: string;
  country?: string;
  expand?: boolean;
  includeBrands?: boolean;
  strictNoiseFilter?: boolean;
  providerConfig?: KeywordIntelligenceConfig;
}
