export interface PlannedTarget {
  url: string;
  title?: string;
  depth: number;
  inDegree: number;
  isOrphan: boolean;
  reason: string;
  score?: number;
}

export interface HubSummary {
  url: string;
  outDegree: number;
  inDegree: number;
  authorityScore: number;
}

export interface LinkSuggestion {
  sourceUrl: string;
  sourceTitle?: string;
  targetUrl: string;
  targetTitle?: string;
  anchorText?: string;
  anchorTheme: string;
  confidence: number;
  score: number;
  reason: string;
  sourceSignals: string[];
}

export interface LinkPlanResult {
  url: string;
  generatedAt: string;
  orphanPages: PlannedTarget[];
  priorityPages: PlannedTarget[];
  suggestions: LinkSuggestion[];
  hubs: HubSummary[];
  summary: {
    orphanCount: number;
    priorityCount: number;
    suggestionCount: number;
    hubCount: number;
  };
}

export interface NormalizedPageFacts {
  url: string;
  title?: string;
  h1: string[];
  h2: string[];
  depth: number;
  inDegree: number;
  outDegree: number;
  authorityScore: number;
  isOrphan: boolean;
  hasStructuredData: boolean;
  isCommercial: boolean;
  isUtility: boolean;
  links: { url: string; text: string; isInternal: boolean }[];
}

export interface SuggestionOptions {
  maxSuggestions?: number;
  maxSuggestionsPerTarget?: number;
  maxSuggestionsPerSource?: number;
  minConfidence?: number;
}
