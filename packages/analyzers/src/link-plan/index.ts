import { NormalizedPage, CrawlGraph } from '@seocore/sdk';
import {
  LinkPlanResult,
  SuggestionOptions,
} from './types.js';
import { normalizePageFacts } from './inputs.js';
import { findOrphanPages, findPriorityPages } from './targets.js';
import { findHubs } from './sources.js';
import { generateLinkSuggestions } from './suggestions.js';

export type { LinkPlanResult, PlannedTarget, HubSummary, LinkSuggestion, SuggestionOptions } from './types.js';

export class LinkPlanAnalyzer {
  analyze(
    pages: Record<string, NormalizedPage>,
    crawlGraph?: CrawlGraph,
    url?: string,
    options?: SuggestionOptions
  ): LinkPlanResult {
    const facts = normalizePageFacts(pages, crawlGraph);

    const orphanPages = findOrphanPages(facts);
    const priorityPages = findPriorityPages(facts, orphanPages);
    const hubs = findHubs(facts);
    const suggestions = generateLinkSuggestions(facts, orphanPages, priorityPages, hubs, options);

    return {
      url: url || Object.keys(pages)[0] || 'unknown',
      generatedAt: new Date().toISOString(),
      orphanPages,
      priorityPages,
      suggestions,
      hubs,
      summary: {
        orphanCount: orphanPages.length,
        priorityCount: priorityPages.length,
        suggestionCount: suggestions.length,
        hubCount: hubs.length,
      },
    };
  }
}
