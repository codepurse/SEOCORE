import type { OpportunityType, OpportunityPriority } from './types.js';

export interface ScoreInput {
  type: OpportunityType;
  highestSeverity?: 'critical' | 'error' | 'warning' | 'info';
  depth?: number;
  url: string;
  hasGsc: boolean;
  impressions?: number;
  position?: number;
  clicks?: number;
}

export interface ScoreResult {
  score: number;
  priority: OpportunityPriority;
  signals: string[];
}

export function calculateOpportunityScore(input: ScoreInput): ScoreResult {
  const signals: string[] = [];

  // 1. Visibility Score (0 to 10)
  let visibilityScore = 5;
  if (input.hasGsc) {
    const imps = input.impressions || 0;
    const pos = input.position !== undefined ? input.position : 99;
    const clicks = input.clicks || 0;

    // Logarithmic scale for impressions: 10,000 imps = ~8.0, 100 imps = ~4.0
    const impSig = imps > 0 ? Math.min(6, Math.log10(imps + 1) * 1.5) : 0;
    // Position-based score: page 1 (pos <= 10) gets highest boost
    const posSig = pos <= 10 ? 4 : pos <= 20 ? 2 : 0;

    visibilityScore = Math.min(10, impSig + posSig);
    signals.push(`GSC Visibility (impressions: ${imps}, position: ${pos}, clicks: ${clicks})`);
  } else {
    // Heuristic visibility based on crawl depth (closer to home page is higher visibility)
    const depth = input.depth !== undefined ? input.depth : 3;
    visibilityScore = depth === 0 ? 8 : depth === 1 ? 6 : depth === 2 ? 4 : 2;
    signals.push(`Heuristic Visibility (depth: ${depth})`);
  }

  // 2. Severity Score (0 to 10)
  let severityScore = 5;
  if (input.highestSeverity) {
    severityScore = input.highestSeverity === 'critical' ? 10 :
                    input.highestSeverity === 'error' ? 7 :
                    input.highestSeverity === 'warning' ? 4 : 1;
    signals.push(`Severity: ${input.highestSeverity}`);
  } else {
    signals.push('Severity: default (no explicit findings)');
  }

  // 3. Business Importance Score (0 to 10)
  let businessScore = 5;
  const lowercaseUrl = input.url.toLowerCase();
  const isHighValuePath = lowercaseUrl.includes('/product') ||
                          lowercaseUrl.includes('/service') ||
                          lowercaseUrl.includes('/pricing') ||
                          lowercaseUrl.includes('/checkout') ||
                          lowercaseUrl.includes('/cart') ||
                          lowercaseUrl.includes('/store') ||
                          lowercaseUrl.endsWith('.com') ||
                          lowercaseUrl.endsWith('.com/') ||
                          lowercaseUrl.endsWith('.org') ||
                          lowercaseUrl.endsWith('.org/');

  if (isHighValuePath) {
    businessScore = 10;
    signals.push('High-value commercial URL path');
  } else {
    const depth = input.depth !== undefined ? input.depth : 3;
    businessScore = depth === 0 ? 10 : depth === 1 ? 8 : depth === 2 ? 6 : 4;
    signals.push(`Crawl-depth business priority (depth: ${depth})`);
  }

  // Calculate Base Score (weighted average, max 100)
  const baseScore = (visibilityScore * 0.4 + severityScore * 0.3 + businessScore * 0.3) * 10;

  // 4. Ease of Fix Modifier (-10 to +10)
  let easeOfFixModifier = 0;
  if (input.type === 'metadata') {
    easeOfFixModifier = 10; // Metadata is extremely easy to modify
    signals.push('Ease of fix: metadata is simple to update (+10)');
  } else if (input.type === 'schema') {
    easeOfFixModifier = 5; // Schema tags are easy to inject
    signals.push('Ease of fix: schema additions are lightweight (+5)');
  } else if (input.type === 'content') {
    easeOfFixModifier = 2; // Writing is medium effort
    signals.push('Ease of fix: content rewrite requires moderate effort (+2)');
  } else if (input.type === 'internal-links') {
    easeOfFixModifier = 0; // Requires adding links, sometimes CMS hurdles
  } else if (input.type === 'performance') {
    easeOfFixModifier = -5; // Performance optimization requires technical shifts (-5)
    signals.push('Ease of fix: technical web performance changes required (-5)');
  } else if (input.type === 'indexing') {
    easeOfFixModifier = -10; // Server-side or robots fixes require caution (-10)
    signals.push('Ease of fix: server/robots/indexing rules require high caution (-10)');
  }

  // 5. Confidence Modifier
  const confidenceModifier = input.hasGsc ? 1.0 : 0.8;
  if (!input.hasGsc) {
    signals.push('Confidence: heuristics only (0.8x penalty)');
  }

  const modifiedScore = baseScore + easeOfFixModifier;
  const score = Math.round(Math.max(1, Math.min(100, modifiedScore * confidenceModifier)));

  // Map score to priority buckets
  let priority: OpportunityPriority = 'low';
  if (score >= 70) {
    priority = 'high';
  } else if (score >= 40) {
    priority = 'medium';
  }

  return {
    score,
    priority,
    signals,
  };
}
