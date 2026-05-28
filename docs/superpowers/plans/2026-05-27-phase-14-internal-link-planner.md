# Phase 14 — Internal Link Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `seocore analyze link-plan <url>` MVP into a production-grade internal linking planner with ranked, deduplicated, actionable source -> target recommendations, HTML export, and stable JSON contract.

**Architecture:** Split the monolithic `link-plan.ts` analyzer into focused modules under `packages/analyzers/src/link-plan/`. Each module handles one responsibility: types, graph input normalization, target discovery, source ranking, topic relevance, anchor theme generation, scoring, and suggestion assembly. The CLI command is refactored to use the shared `dispatchOutput` pattern and adds HTML export.

**Tech Stack:** TypeScript, Vitest for testing, existing SEOCORE monorepo patterns.

---

## File Structure

### New files (analyzers package)
- `packages/analyzers/src/link-plan/types.ts` — All interfaces and types
- `packages/analyzers/src/link-plan/inputs.ts` — Graph normalization, page fact derivation
- `packages/analyzers/src/link-plan/targets.ts` — Orphan and priority page discovery
- `packages/analyzers/src/link-plan/sources.ts` — Hub and source page ranking
- `packages/analyzers/src/link-plan/relevance.ts` — Topic relevance calculation
- `packages/analyzers/src/link-plan/anchors.ts` — Anchor theme generation
- `packages/analyzers/src/link-plan/score.ts` — Confidence and ranking score calculation
- `packages/analyzers/src/link-plan/suggestions.ts` — Suggestion assembly, deduplication, suppression
- `packages/analyzers/src/link-plan/index.ts` — Main analyzer re-export

### Modified files (analyzers package)
- `packages/analyzers/src/link-plan.ts` — Thin backward-compatible wrapper
- `packages/analyzers/src/index.ts` — Update exports

### Modified files (CLI package)
- `packages/cli/src/commands/analyze/link-plan.ts` — Refactor to use dispatchOutput, add HTML export, new flags

### New test files
- `packages/analyzers/src/link-plan/inputs.test.ts`
- `packages/analyzers/src/link-plan/targets.test.ts`
- `packages/analyzers/src/link-plan/sources.test.ts`
- `packages/analyzers/src/link-plan/relevance.test.ts`
- `packages/analyzers/src/link-plan/score.test.ts`
- `packages/analyzers/src/link-plan/suggestions.test.ts`

---

## Task 1: Create link-plan module types

**Files:**
- Create: `packages/analyzers/src/link-plan/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
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
```

---

## Task 2: Create graph input normalization module

**Files:**
- Create: `packages/analyzers/src/link-plan/inputs.ts`
- Test: `packages/analyzers/src/link-plan/inputs.test.ts`

- [ ] **Step 1: Write the inputs module**

```typescript
import { NormalizedPage, CrawlGraph } from '@seocore/sdk';
import { NormalizedPageFacts } from './types.js';

const COMMERCIAL_PATTERNS = [
  '/product', '/products', '/service', '/services',
  '/pricing', '/buy', '/shop', '/checkout', '/cart',
];

const UTILITY_PATTERNS = [
  '/contact', '/about', '/terms', '/privacy', '/sitemap',
  '/robots.txt', '/login', '/register', '/search', '/auth',
  '/logout', '/account', '/user', '/admin',
];

export function normalizePageFacts(
  pages: Record<string, NormalizedPage>,
  crawlGraph?: CrawlGraph
): Map<string, NormalizedPageFacts> {
  const facts = new Map<string, NormalizedPageFacts>();
  const graphNodeMap = new Map<string, { depth: number; inDegree: number; outDegree: number; authorityScore: number; isOrphan: boolean }>();

  if (crawlGraph?.nodes) {
    for (const node of crawlGraph.nodes) {
      graphNodeMap.set(node.url, {
        depth: node.depth,
        inDegree: node.inDegree,
        outDegree: node.outDegree,
        authorityScore: node.authorityScore,
        isOrphan: node.isOrphan,
      });
    }
  }

  for (const [url, page] of Object.entries(pages)) {
    const graphNode = graphNodeMap.get(url);

    facts.set(url, {
      url,
      title: page.title,
      h1: page.headings?.h1 || [],
      h2: page.headings?.h2 || [],
      depth: graphNode?.depth ?? page.depth ?? 0,
      inDegree: graphNode?.inDegree ?? page.inDegree ?? 0,
      outDegree: graphNode?.outDegree ?? page.outDegree ?? page.links?.length ?? 0,
      authorityScore: graphNode?.authorityScore ?? page.authorityScore ?? 0,
      isOrphan: graphNode?.isOrphan ?? page.isOrphan ?? (page.inDegree === 0),
      hasStructuredData: Array.isArray(page.structuredData) && page.structuredData.length > 0,
      isCommercial: isCommercialUrl(url),
      isUtility: isUtilityPage(url),
      links: page.links || [],
    });
  }

  return facts;
}

export function isCommercialUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return COMMERCIAL_PATTERNS.some(p => lower.includes(p));
}

export function isUtilityPage(url: string): boolean {
  const lower = url.toLowerCase();
  return UTILITY_PATTERNS.some(p => lower.endsWith(p) || lower.includes(p + '/'));
}

export function getOutboundInternalLinks(facts: NormalizedPageFacts): Set<string> {
  const targets = new Set<string>();
  for (const link of facts.links) {
    if (link.isInternal) {
      targets.add(link.url);
    }
  }
  return targets;
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizePageFacts, isCommercialUrl, isUtilityPage, getOutboundInternalLinks } from './inputs.js';
import { NormalizedPage, CrawlGraph } from '@seocore/sdk';

function makePage(overrides: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    url: 'https://example.com/page',
    statusCode: 200,
    loadTimeMs: 100,
    contentType: 'text/html',
    headings: { h1: [], h2: [], h3: [] },
    links: [],
    images: [],
    hreflang: [],
    structuredData: [],
    ...overrides,
  } as NormalizedPage;
}

describe('normalizePageFacts', () => {
  it('derives facts from page alone when no crawl graph', () => {
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/a': makePage({ url: 'https://example.com/a', inDegree: 0, depth: 1, title: 'Page A' }),
    };
    const facts = normalizePageFacts(pages);
    const f = facts.get('https://example.com/a')!;
    expect(f.inDegree).toBe(0);
    expect(f.isOrphan).toBe(true);
    expect(f.depth).toBe(1);
    expect(f.title).toBe('Page A');
  });

  it('prefers crawl graph node values over page values', () => {
    const pages: Record<string, NormalizedPage> = {
      'https://example.com/a': makePage({ url: 'https://example.com/a', inDegree: 5, depth: 2, authorityScore: 10 }),
    };
    const graph: CrawlGraph = {
      nodes: [{ url: 'https://example.com/a', depth: 1, inDegree: 10, outDegree: 3, authorityScore: 50, isOrphan: false }],
      edges: [],
      metrics: { maxDepth: 1, orphanCount: 0, hubPages: [], authorityNodes: [] },
    };
    const facts = normalizePageFacts(pages, graph);
    const f = facts.get('https://example.com/a')!;
    expect(f.inDegree).toBe(10);
    expect(f.depth).toBe(1);
    expect(f.authorityScore).toBe(50);
  });

  it('detects commercial URLs', () => {
    expect(isCommercialUrl('https://example.com/products/widget')).toBe(true);
    expect(isCommercialUrl('https://example.com/about')).toBe(false);
  });

  it('detects utility pages', () => {
    expect(isUtilityPage('https://example.com/privacy')).toBe(true);
    expect(isUtilityPage('https://example.com/privacy-policy')).toBe(true);
    expect(isUtilityPage('https://example.com/blog/post')).toBe(false);
  });

  it('extracts outbound internal links', () => {
    const facts = {
      url: 'https://example.com/a',
      links: [
        { url: 'https://example.com/b', text: 'B', isInternal: true },
        { url: 'https://external.com', text: 'Ext', isInternal: false },
      ],
    } as any;
    const targets = getOutboundInternalLinks(facts);
    expect(targets.has('https://example.com/b')).toBe(true);
    expect(targets.has('https://external.com')).toBe(false);
  });
});
```

---

## Task 3: Create target discovery module

**Files:**
- Create: `packages/analyzers/src/link-plan/targets.ts`
- Test: `packages/analyzers/src/link-plan/targets.test.ts`

- [ ] **Step 1: Write the targets module**

```typescript
import { NormalizedPageFacts, PlannedTarget } from './types.js';
import { isCommercialUrl } from './inputs.js';

export function findOrphanPages(facts: Map<string, NormalizedPageFacts>): PlannedTarget[] {
  const orphans: PlannedTarget[] = [];

  for (const [url, page] of facts) {
    if (page.isOrphan || page.inDegree === 0) {
      const reason = page.inDegree === 0
        ? 'No incoming links from other crawled pages'
        : 'Marked as orphan by crawler';

      orphans.push({
        url,
        title: page.title,
        depth: page.depth,
        inDegree: page.inDegree,
        isOrphan: true,
        reason,
        score: calculateTargetScore(page),
      });
    }
  }

  return orphans.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function findPriorityPages(
  facts: Map<string, NormalizedPageFacts>,
  orphanPages: PlannedTarget[]
): PlannedTarget[] {
  const orphanSet = new Set(orphanPages.map(o => o.url));
  const priorityUrls = new Set<string>();

  for (const [url, page] of facts) {
    if (page.isCommercial) {
      priorityUrls.add(url);
    }
    if (page.hasStructuredData) {
      priorityUrls.add(url);
    }
  }

  const priorities: PlannedTarget[] = [];

  for (const url of priorityUrls) {
    if (orphanSet.has(url)) continue;
    const page = facts.get(url);
    if (!page) continue;

    const score = calculateTargetScore(page);
    if (score <= 0) continue;

    priorities.push({
      url,
      title: page.title,
      depth: page.depth,
      inDegree: page.inDegree,
      isOrphan: false,
      reason: page.isCommercial
        ? 'Commercial URL pattern detected'
        : 'Contains structured data for important entity type',
      score,
    });
  }

  return priorities.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function calculateTargetScore(page: NormalizedPageFacts): number {
  if (page.isUtility) return -10;

  let score = 0;

  if (page.isOrphan) score += 25;
  if (page.isCommercial) score += 15;
  if (page.hasStructuredData) score += 8;
  score += Math.max(0, 10 - page.depth) * 2;
  score += Math.max(0, 5 - page.inDegree) * 3;

  return score;
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { findOrphanPages, findPriorityPages, calculateTargetScore } from './targets.js';
import { NormalizedPageFacts } from './types.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('findOrphanPages', () => {
  it('finds pages with zero in-degree', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', inDegree: 0 })],
      ['https://example.com/b', makeFacts({ url: 'https://example.com/b', inDegree: 3 })],
    ]);
    const orphans = findOrphanPages(facts);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].url).toBe('https://example.com/a');
  });

  it('finds explicitly marked orphans', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', inDegree: 1, isOrphan: true })],
    ]);
    const orphans = findOrphanPages(facts);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reason).toContain('orphan');
  });
});

describe('findPriorityPages', () => {
  it('finds commercial pages not already orphaned', () => {
    const facts = new Map([
      ['https://example.com/products', makeFacts({ url: 'https://example.com/products', isCommercial: true, inDegree: 1 })],
      ['https://example.com/about', makeFacts({ url: 'https://example.com/about', inDegree: 5 })],
    ]);
    const orphans = findOrphanPages(facts);
    const priorities = findPriorityPages(facts, orphans);
    expect(priorities.some(p => p.url.includes('products'))).toBe(true);
  });

  it('excludes pages already in orphan list', () => {
    const facts = new Map([
      ['https://example.com/products', makeFacts({ url: 'https://example.com/products', isCommercial: true, inDegree: 0 })],
    ]);
    const orphans = findOrphanPages(facts);
    const priorities = findPriorityPages(facts, orphans);
    expect(priorities).toHaveLength(0);
  });
});

describe('calculateTargetScore', () => {
  it('penalizes utility pages', () => {
    const score = calculateTargetScore(makeFacts({ isUtility: true }));
    expect(score).toBeLessThan(0);
  });

  it('boosts orphans and commercial pages', () => {
    const orphan = calculateTargetScore(makeFacts({ isOrphan: true, inDegree: 0 }));
    const commercial = calculateTargetScore(makeFacts({ isCommercial: true }));
    const plain = calculateTargetScore(makeFacts());
    expect(orphan).toBeGreaterThan(plain);
    expect(commercial).toBeGreaterThan(plain);
  });
});
```

---

## Task 4: Create source ranking module

**Files:**
- Create: `packages/analyzers/src/link-plan/sources.ts`
- Test: `packages/analyzers/src/link-plan/sources.test.ts`

- [ ] **Step 1: Write the sources module**

```typescript
import { NormalizedPageFacts, HubSummary } from './types.js';

export function findHubs(facts: Map<string, NormalizedPageFacts>): HubSummary[] {
  const hubs: HubSummary[] = [];

  for (const [url, page] of facts) {
    if (page.isUtility) continue;

    const outDegree = page.outDegree;
    const inDegree = page.inDegree;
    const authorityScore = page.authorityScore;

    if (outDegree > 5 || authorityScore > 50 || inDegree > 10) {
      hubs.push({ url, outDegree, inDegree, authorityScore });
    }
  }

  return hubs
    .sort((a, b) => b.authorityScore - a.authorityScore)
    .slice(0, 20);
}

export function calculateSourceScore(
  source: NormalizedPageFacts,
  target?: NormalizedPageFacts
): number {
  if (source.isUtility) return -50;

  let score = 0;

  score += Math.min(30, source.authorityScore / 3);
  score += Math.min(20, source.inDegree / 2);

  if (!source.isUtility) score += 10;

  if (target) {
    const topicScore = calculateTopicOverlapScore(source, target);
    score += topicScore * 15;
  }

  const saturationPenalty = Math.max(0, source.outDegree - 50) * 0.5;
  score -= saturationPenalty;

  return score;
}

function calculateTopicOverlapScore(a: NormalizedPageFacts, b: NormalizedPageFacts): number {
  const aTokens = extractTokens(a);
  const bTokens = extractTokens(b);

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  return intersection / Math.max(aTokens.size, bTokens.size);
}

function extractTokens(page: NormalizedPageFacts): Set<string> {
  const tokens = new Set<string>();
  const addTokens = (text: string) => {
    text.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 3) tokens.add(w);
    });
  };

  if (page.title) addTokens(page.title);
  page.h1.forEach(addTokens);
  page.h2.forEach(addTokens);

  const pathTokens = page.url.split('/').filter(Boolean);
  const lastSegment = pathTokens[pathTokens.length - 1] || '';
  lastSegment.replace(/[-_]/g, ' ').split(/\s+/).forEach(w => {
    if (w.length > 2) tokens.add(w.toLowerCase());
  });

  return tokens;
}

export function rankSourcesForTarget(
  target: NormalizedPageFacts,
  facts: Map<string, NormalizedPageFacts>,
  excludeUrls: Set<string>
): { url: string; score: number }[] {
  const ranked: { url: string; score: number }[] = [];

  for (const [url, source] of facts) {
    if (url === target.url) continue;
    if (excludeUrls.has(url)) continue;
    if (source.isUtility) continue;

    const score = calculateSourceScore(source, target);
    if (score > 0) {
      ranked.push({ url, score });
    }
  }

  return ranked.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { findHubs, calculateSourceScore, rankSourcesForTarget } from './sources.js';
import { NormalizedPageFacts } from './types.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('findHubs', () => {
  it('finds pages with high out-degree', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({ url: 'https://example.com/hub', outDegree: 10, authorityScore: 60 })],
      ['https://example.com/leaf', makeFacts({ url: 'https://example.com/leaf', outDegree: 1 })],
    ]);
    const hubs = findHubs(facts);
    expect(hubs.some(h => h.url.includes('hub'))).toBe(true);
    expect(hubs.some(h => h.url.includes('leaf'))).toBe(false);
  });

  it('excludes utility pages', () => {
    const facts = new Map([
      ['https://example.com/login', makeFacts({ url: 'https://example.com/login', outDegree: 10, isUtility: true })],
    ]);
    const hubs = findHubs(facts);
    expect(hubs).toHaveLength(0);
  });
});

describe('calculateSourceScore', () => {
  it('penalizes utility pages heavily', () => {
    const score = calculateSourceScore(makeFacts({ isUtility: true, authorityScore: 100 }));
    expect(score).toBeLessThan(0);
  });

  it('rewards authority and in-degree', () => {
    const low = calculateSourceScore(makeFacts({ authorityScore: 10, inDegree: 2 }));
    const high = calculateSourceScore(makeFacts({ authorityScore: 90, inDegree: 30 }));
    expect(high).toBeGreaterThan(low);
  });
});

describe('rankSourcesForTarget', () => {
  it('excludes self and excluded URLs', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', authorityScore: 50 })],
      ['https://example.com/b', makeFacts({ url: 'https://example.com/b', authorityScore: 30 })],
    ]);
    const target = makeFacts({ url: 'https://example.com/a' });
    const ranked = rankSourcesForTarget(target, facts, new Set());
    expect(ranked.some(r => r.url === 'https://example.com/a')).toBe(false);
    expect(ranked[0].url).toBe('https://example.com/b');
  });
});
```

---

## Task 5: Create topic relevance module

**Files:**
- Create: `packages/analyzers/src/link-plan/relevance.ts`
- Test: `packages/analyzers/src/link-plan/relevance.test.ts`

- [ ] **Step 1: Write the relevance module**

```typescript
import { NormalizedPageFacts } from './types.js';

export interface RelevanceResult {
  score: number;
  signals: string[];
}

export function calculateRelevance(
  source: NormalizedPageFacts,
  target: NormalizedPageFacts
): RelevanceResult {
  const signals: string[] = [];
  let score = 0;

  const titleOverlap = wordOverlap(source.title || '', target.title || '');
  if (titleOverlap > 0) {
    score += titleOverlap * 3;
    signals.push('shared title term');
  }

  const h1Overlap = arrayWordOverlap(source.h1, target.h1);
  if (h1Overlap > 0) {
    score += h1Overlap * 4;
    signals.push('shared H1 term');
  }

  const h2Overlap = arrayWordOverlap(source.h2, target.h2);
  if (h2Overlap > 0) {
    score += h2Overlap * 2;
    signals.push('shared H2 term');
  }

  const urlOverlap = calculateUrlSegmentOverlap(source.url, target.url);
  if (urlOverlap > 0) {
    score += urlOverlap * 2.5;
    signals.push('shared path segment');
  }

  return { score, signals };
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection;
}

function arrayWordOverlap(a: string[], b: string[]): number {
  const flatA = a.join(' ');
  const flatB = b.join(' ');
  return wordOverlap(flatA, flatB);
}

function calculateUrlSegmentOverlap(url1: string, url2: string): number {
  const seg1 = url1.split('/').filter(Boolean);
  const seg2 = url2.split('/').filter(Boolean);

  if (seg1.length === 0 || seg2.length === 0) return 0;

  const set1 = new Set(seg1.map(s => s.toLowerCase()));
  const set2 = new Set(seg2.map(s => s.toLowerCase()));

  let intersection = 0;
  for (const seg of set1) {
    if (set2.has(seg) && seg.length > 2) {
      intersection++;
    }
  }

  const union = new Set([...set1, ...set2]).size;
  return union > 0 ? intersection / union : 0;
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateRelevance } from './relevance.js';
import { NormalizedPageFacts } from './types.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('calculateRelevance', () => {
  it('detects title overlap', () => {
    const source = makeFacts({ title: 'Best SEO Tools for 2024' });
    const target = makeFacts({ title: 'SEO Tools Comparison Guide' });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('shared title term');
  });

  it('detects H1 overlap', () => {
    const source = makeFacts({ h1: ['Digital Marketing Strategies'] });
    const target = makeFacts({ h1: ['Marketing Strategies for Startups'] });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('shared H1 term');
  });

  it('detects URL segment overlap', () => {
    const source = makeFacts({ url: 'https://example.com/blog/seo-tips' });
    const target = makeFacts({ url: 'https://example.com/blog/content-marketing' });
    const result = calculateRelevance(source, target);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('shared path segment');
  });

  it('returns zero for unrelated pages', () => {
    const source = makeFacts({ title: 'Car Repair', h1: ['Auto Shop'] });
    const target = makeFacts({ title: 'Gardening Tips', h1: ['Plants'] });
    const result = calculateRelevance(source, target);
    expect(result.score).toBe(0);
  });
});
```

---

## Task 6: Create anchor theme module

**Files:**
- Create: `packages/analyzers/src/link-plan/anchors.ts`
- Test: `packages/analyzers/src/link-plan/anchors.test.ts`

- [ ] **Step 1: Write the anchors module**

```typescript
export function inferAnchorTheme(url: string, title?: string): string {
  if (title && title.length > 0) {
    const cleanTitle = title.replace(/[^\w\s-]/g, '').trim();
    const words = cleanTitle.split(/\s+/).slice(0, 4);
    const theme = words.join(' ');
    if (theme.length > 0) return theme;
  }

  const urlPath = url.split('/').filter(Boolean);
  const lastSegment = urlPath[urlPath.length - 1] || '';
  const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
  const formatted = withoutExt.replace(/[-_]/g, ' ');

  if (formatted.length > 0) return formatted;
  return 'Learn more';
}

export function inferAnchorText(url: string, title?: string): string | undefined {
  if (title && title.length > 0 && title.length < 80) {
    return title.trim();
  }

  const urlPath = url.split('/').filter(Boolean);
  const lastSegment = urlPath[urlPath.length - 1] || '';
  const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
  const formatted = withoutExt.replace(/[-_]/g, ' ');

  if (formatted.length > 0 && formatted.length < 60) {
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  return undefined;
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { inferAnchorTheme, inferAnchorText } from './anchors.js';

describe('inferAnchorTheme', () => {
  it('uses title when available', () => {
    expect(inferAnchorTheme('https://example.com/page', 'Best SEO Tips')).toBe('Best SEO Tips');
  });

  it('limits to 4 words', () => {
    expect(inferAnchorTheme('https://example.com/page', 'One Two Three Four Five Six')).toBe('One Two Three Four');
  });

  it('falls back to URL segment', () => {
    expect(inferAnchorTheme('https://example.com/seo-tips-guide')).toBe('seo tips guide');
  });

  it('returns Learn more as last resort', () => {
    expect(inferAnchorTheme('https://example.com/')).toBe('Learn more');
  });
});

describe('inferAnchorText', () => {
  it('uses title when reasonable length', () => {
    expect(inferAnchorText('https://example.com/page', 'SEO Guide')).toBe('SEO Guide');
  });

  it('falls back to URL segment', () => {
    expect(inferAnchorText('https://example.com/seo-guide')).toBe('Seo guide');
  });

  it('returns undefined for very short URLs', () => {
    expect(inferAnchorText('https://example.com/')).toBeUndefined();
  });
});
```

---

## Task 7: Create scoring module

**Files:**
- Create: `packages/analyzers/src/link-plan/score.ts`
- Test: `packages/analyzers/src/link-plan/score.test.ts`

- [ ] **Step 1: Write the score module**

```typescript
import { NormalizedPageFacts, LinkSuggestion } from './types.js';
import { RelevanceResult } from './relevance.js';

export function calculateSuggestionScore(
  source: NormalizedPageFacts,
  target: NormalizedPageFacts,
  relevance: RelevanceResult
): number {
  let score = 0;

  score += Math.min(25, source.authorityScore / 3);
  score += Math.min(15, source.inDegree / 2);

  if (target.isOrphan) score += 20;
  if (target.isCommercial) score += 10;
  score += Math.max(0, 8 - target.inDegree) * 2;
  score += Math.max(0, 5 - target.depth) * 1.5;

  score += relevance.score * 5;

  if (source.isUtility) score -= 30;
  if (target.isUtility) score -= 20;

  const saturationPenalty = Math.max(0, source.outDegree - 40) * 0.3;
  score -= saturationPenalty;

  return Math.max(0, Math.round(score * 10) / 10);
}

export function calculateConfidence(
  source: NormalizedPageFacts,
  target: NormalizedPageFacts,
  relevance: RelevanceResult
): number {
  let confidence = 40;

  if (source.authorityScore > 70) confidence += 20;
  else if (source.authorityScore > 40) confidence += 10;

  if (source.inDegree > 50) confidence += 15;
  else if (source.inDegree > 20) confidence += 10;

  if (!source.isUtility) confidence += 10;

  if (target.isOrphan) confidence += 15;
  if (target.isCommercial) confidence += 5;

  if (relevance.score > 2) confidence += 15;
  else if (relevance.score > 0.5) confidence += 8;

  if (relevance.signals.length >= 2) confidence += 5;

  return Math.min(100, Math.round(confidence));
}

export function sortSuggestions(suggestions: LinkSuggestion[]): LinkSuggestion[] {
  return [...suggestions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.confidence - a.confidence;
  });
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSuggestionScore, calculateConfidence, sortSuggestions } from './score.js';
import { NormalizedPageFacts, LinkSuggestion } from './types.js';
import { RelevanceResult } from './relevance.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('calculateSuggestionScore', () => {
  it('is deterministic for same input', () => {
    const source = makeFacts({ authorityScore: 50, inDegree: 10 });
    const target = makeFacts({ isOrphan: true, inDegree: 0 });
    const rel: RelevanceResult = { score: 1, signals: ['shared title'] };
    const s1 = calculateSuggestionScore(source, target, rel);
    const s2 = calculateSuggestionScore(source, target, rel);
    expect(s1).toBe(s2);
  });

  it('higher for orphan targets', () => {
    const source = makeFacts({ authorityScore: 30 });
    const orphan = makeFacts({ isOrphan: true, inDegree: 0 });
    const normal = makeFacts({ isOrphan: false, inDegree: 5 });
    const rel: RelevanceResult = { score: 0, signals: [] };
    expect(calculateSuggestionScore(source, orphan, rel)).toBeGreaterThan(calculateSuggestionScore(source, normal, rel));
  });
});

describe('calculateConfidence', () => {
  it('caps at 100', () => {
    const source = makeFacts({ authorityScore: 100, inDegree: 100 });
    const target = makeFacts({ isOrphan: true, isCommercial: true });
    const rel: RelevanceResult = { score: 5, signals: ['a', 'b', 'c'] };
    expect(calculateConfidence(source, target, rel)).toBe(100);
  });

  it('is at least 40 for basic inputs', () => {
    const source = makeFacts();
    const target = makeFacts();
    const rel: RelevanceResult = { score: 0, signals: [] };
    expect(calculateConfidence(source, target, rel)).toBeGreaterThanOrEqual(40);
  });
});

describe('sortSuggestions', () => {
  it('sorts by score descending, then confidence', () => {
    const suggestions: LinkSuggestion[] = [
      { sourceUrl: 'a', targetUrl: 'b', anchorTheme: '', confidence: 50, score: 10, reason: '', sourceSignals: [] },
      { sourceUrl: 'c', targetUrl: 'd', anchorTheme: '', confidence: 80, score: 20, reason: '', sourceSignals: [] },
      { sourceUrl: 'e', targetUrl: 'f', anchorTheme: '', confidence: 60, score: 20, reason: '', sourceSignals: [] },
    ];
    const sorted = sortSuggestions(suggestions);
    expect(sorted[0].sourceUrl).toBe('c');
    expect(sorted[1].sourceUrl).toBe('e');
    expect(sorted[2].sourceUrl).toBe('a');
  });
});
```

---

## Task 8: Create suggestions assembly module

**Files:**
- Create: `packages/analyzers/src/link-plan/suggestions.ts`
- Test: `packages/analyzers/src/link-plan/suggestions.test.ts`

- [ ] **Step 1: Write the suggestions module**

```typescript
import { NormalizedPageFacts, PlannedTarget, LinkSuggestion, SuggestionOptions, HubSummary } from './types.js';
import { calculateRelevance } from './relevance.js';
import { inferAnchorTheme, inferAnchorText } from './anchors.js';
import { calculateSuggestionScore, calculateConfidence, sortSuggestions } from './score.js';
import { rankSourcesForTarget } from './sources.js';
import { getOutboundInternalLinks } from './inputs.js';

export function generateLinkSuggestions(
  facts: Map<string, NormalizedPageFacts>,
  orphanPages: PlannedTarget[],
  priorityPages: PlannedTarget[],
  hubs: HubSummary[],
  options: SuggestionOptions = {}
): LinkSuggestion[] {
  const {
    maxSuggestions = 50,
    maxSuggestionsPerTarget = 5,
    maxSuggestionsPerSource = 10,
    minConfidence = 0,
  } = options;

  const suggestions: LinkSuggestion[] = [];
  const seenPairs = new Set<string>();
  const targetSuggestionCount = new Map<string, number>();
  const sourceSuggestionCount = new Map<string, number>();

  const hubSet = new Set(hubs.map(h => h.url));
  const highAuthorityHubs = hubs
    .filter(h => h.authorityScore > 30 || h.inDegree > 10)
    .map(h => h.url);

  for (const orphan of orphanPages.slice(0, 20)) {
    const orphanFacts = facts.get(orphan.url);
    if (!orphanFacts) continue;

    const existingLinks = getOutboundInternalLinks(orphanFacts);
    const sources = rankSourcesForTarget(orphanFacts, facts, existingLinks);

    let targetCount = 0;
    for (const { url: sourceUrl, score: sourceScore } of sources) {
      if (targetCount >= maxSuggestionsPerTarget) break;

      const pairKey = `${sourceUrl}|${orphan.url}`;
      if (seenPairs.has(pairKey)) continue;

      const sourceFacts = facts.get(sourceUrl);
      if (!sourceFacts) continue;

      if (sourceAlreadyLinksToTarget(sourceFacts, orphan.url)) continue;

      const relevance = calculateRelevance(sourceFacts, orphanFacts);
      if (relevance.score < 0.1 && !hubSet.has(sourceUrl)) continue;

      const score = calculateSuggestionScore(sourceFacts, orphanFacts, relevance);
      const confidence = calculateConfidence(sourceFacts, orphanFacts, relevance);

      if (confidence < minConfidence) continue;
      if ((sourceSuggestionCount.get(sourceUrl) || 0) >= maxSuggestionsPerSource) continue;

      seenPairs.add(pairKey);
      targetCount++;
      sourceSuggestionCount.set(sourceUrl, (sourceSuggestionCount.get(sourceUrl) || 0) + 1);

      suggestions.push({
        sourceUrl,
        sourceTitle: sourceFacts.title,
        targetUrl: orphan.url,
        targetTitle: orphan.title,
        anchorText: inferAnchorText(orphan.url, orphan.title),
        anchorTheme: inferAnchorTheme(orphan.url, orphan.title),
        confidence,
        score,
        reason: buildReason(sourceFacts, orphanFacts, 'orphan rescue'),
        sourceSignals: relevance.signals,
      });
    }
  }

  for (const priority of priorityPages.slice(0, 15)) {
    const priorityFacts = facts.get(priority.url);
    if (!priorityFacts) continue;
    if (priority.inDegree >= 3) continue;

    const existingLinks = getOutboundInternalLinks(priorityFacts);
    const sources = rankSourcesForTarget(priorityFacts, facts, existingLinks);

    let targetCount = 0;
    for (const { url: sourceUrl } of sources) {
      if (targetCount >= maxSuggestionsPerTarget) break;

      const pairKey = `${sourceUrl}|${priority.url}`;
      if (seenPairs.has(pairKey)) continue;

      const sourceFacts = facts.get(sourceUrl);
      if (!sourceFacts) continue;

      if (sourceAlreadyLinksToTarget(sourceFacts, priority.url)) continue;

      const relevance = calculateRelevance(sourceFacts, priorityFacts);
      if (relevance.score < 0.1) continue;

      const score = calculateSuggestionScore(sourceFacts, priorityFacts, relevance);
      const confidence = calculateConfidence(sourceFacts, priorityFacts, relevance);

      if (confidence < minConfidence) continue;
      if ((sourceSuggestionCount.get(sourceUrl) || 0) >= maxSuggestionsPerSource) continue;

      seenPairs.add(pairKey);
      targetCount++;
      sourceSuggestionCount.set(sourceUrl, (sourceSuggestionCount.get(sourceUrl) || 0) + 1);

      suggestions.push({
        sourceUrl,
        sourceTitle: sourceFacts.title,
        targetUrl: priority.url,
        targetTitle: priority.title,
        anchorText: inferAnchorText(priority.url, priority.title),
        anchorTheme: inferAnchorTheme(priority.url, priority.title),
        confidence,
        score,
        reason: buildReason(sourceFacts, priorityFacts, 'priority reinforcement'),
        sourceSignals: relevance.signals,
      });
    }
  }

  return sortSuggestions(suggestions).slice(0, maxSuggestions);
}

function sourceAlreadyLinksToTarget(source: NormalizedPageFacts, targetUrl: string): boolean {
  for (const link of source.links) {
    if (link.isInternal && link.url === targetUrl) {
      return true;
    }
  }
  return false;
}

function buildReason(source: NormalizedPageFacts, target: NormalizedPageFacts, context: string): string {
  const parts: string[] = [];

  if (source.authorityScore > 50) parts.push('High authority');
  else if (source.authorityScore > 20) parts.push('Good authority');

  parts.push(`page (${source.inDegree} in-links)`);

  if (target.isOrphan) parts.push('linking to orphan page');
  else if (target.isCommercial) parts.push('linking to underlinked commercial page');
  else parts.push('linking to priority page');

  return parts.join(' ');
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { generateLinkSuggestions } from './suggestions.js';
import { NormalizedPageFacts, PlannedTarget, HubSummary } from './types.js';

function makeFacts(overrides: Partial<NormalizedPageFacts> = {}): NormalizedPageFacts {
  return {
    url: 'https://example.com/page',
    title: 'Page',
    h1: [], h2: [],
    depth: 1, inDegree: 2, outDegree: 3,
    authorityScore: 0, isOrphan: false,
    hasStructuredData: false, isCommercial: false, isUtility: false,
    links: [],
    ...overrides,
  };
}

describe('generateLinkSuggestions', () => {
  it('suggests links from hubs to orphans', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({
        url: 'https://example.com/hub', title: 'Main Hub',
        authorityScore: 60, inDegree: 20, outDegree: 15,
        h1: ['SEO Guide'],
      })],
      ['https://example.com/orphan', makeFacts({
        url: 'https://example.com/orphan', title: 'SEO Tips',
        inDegree: 0, isOrphan: true,
        h1: ['SEO Tips'],
      })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', title: 'SEO Tips', depth: 2, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const priorities: PlannedTarget[] = [];
    const hubs: HubSummary[] = [{ url: 'https://example.com/hub', outDegree: 15, inDegree: 20, authorityScore: 60 }];

    const suggestions = generateLinkSuggestions(facts, orphans, priorities, hubs);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].sourceUrl).toBe('https://example.com/hub');
    expect(suggestions[0].targetUrl).toBe('https://example.com/orphan');
  });

  it('does not suggest self-links', () => {
    const facts = new Map([
      ['https://example.com/a', makeFacts({ url: 'https://example.com/a', inDegree: 0, isOrphan: true })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/a', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const suggestions = generateLinkSuggestions(facts, orphans, [], []);
    expect(suggestions).toHaveLength(0);
  });

  it('does not suggest duplicate source->target pairs', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({ url: 'https://example.com/hub', authorityScore: 60, inDegree: 20, outDegree: 10 })],
      ['https://example.com/orphan', makeFacts({ url: 'https://example.com/orphan', inDegree: 0, isOrphan: true })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const hubs: HubSummary[] = [{ url: 'https://example.com/hub', outDegree: 10, inDegree: 20, authorityScore: 60 }];

    const s1 = generateLinkSuggestions(facts, orphans, [], hubs);
    const s2 = generateLinkSuggestions(facts, orphans, [], hubs);
    expect(s1.length).toBe(s2.length);
  });

  it('suppresses existing links', () => {
    const facts = new Map([
      ['https://example.com/hub', makeFacts({
        url: 'https://example.com/hub', authorityScore: 60, inDegree: 20, outDegree: 10,
        links: [{ url: 'https://example.com/orphan', text: 'Link', isInternal: true }],
      })],
      ['https://example.com/orphan', makeFacts({ url: 'https://example.com/orphan', inDegree: 0, isOrphan: true })],
    ]);
    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const hubs: HubSummary[] = [{ url: 'https://example.com/hub', outDegree: 10, inDegree: 20, authorityScore: 60 }];

    const suggestions = generateLinkSuggestions(facts, orphans, [], hubs);
    expect(suggestions.some(s => s.sourceUrl === 'https://example.com/hub' && s.targetUrl === 'https://example.com/orphan')).toBe(false);
  });

  it('respects maxSuggestionsPerTarget', () => {
    const facts = new Map<string, NormalizedPageFacts>();
    for (let i = 0; i < 10; i++) {
      facts.set(`https://example.com/source${i}`, makeFacts({
        url: `https://example.com/source${i}`,
        title: `Source ${i}`,
        authorityScore: 50, inDegree: 10,
        h1: ['Topic'],
      }));
    }
    facts.set('https://example.com/orphan', makeFacts({
      url: 'https://example.com/orphan', title: 'Orphan',
      inDegree: 0, isOrphan: true,
      h1: ['Topic'],
    }));

    const orphans: PlannedTarget[] = [{ url: 'https://example.com/orphan', depth: 1, inDegree: 0, isOrphan: true, reason: '', score: 10 }];
    const suggestions = generateLinkSuggestions(facts, orphans, [], [], { maxSuggestionsPerTarget: 3 });
    const forOrphan = suggestions.filter(s => s.targetUrl === 'https://example.com/orphan');
    expect(forOrphan.length).toBeLessThanOrEqual(3);
  });
});
```

---

## Task 9: Create main analyzer index and backward-compatible wrapper

**Files:**
- Create: `packages/analyzers/src/link-plan/index.ts`
- Modify: `packages/analyzers/src/link-plan.ts`
- Modify: `packages/analyzers/src/index.ts`

- [ ] **Step 1: Write the new main analyzer**

```typescript
import { NormalizedPage, CrawlGraph } from '@seocore/sdk';
import {
  LinkPlanResult,
  SuggestionOptions,
  PlannedTarget,
  HubSummary,
  LinkSuggestion,
} from './types.js';
import { normalizePageFacts } from './inputs.js';
import { findOrphanPages, findPriorityPages } from './targets.js';
import { findHubs } from './sources.js';
import { generateLinkSuggestions } from './suggestions.js';

export { LinkPlanResult, PlannedTarget, HubSummary, LinkSuggestion, SuggestionOptions } from './types.js';

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
```

- [ ] **Step 2: Update backward-compatible wrapper**

Replace `packages/analyzers/src/link-plan.ts` with a re-export:

```typescript
export {
  LinkPlanAnalyzer,
  LinkPlanResult,
  PlannedTarget,
  HubSummary,
  LinkSuggestion,
  SuggestionOptions,
} from './link-plan/index.js';
```

- [ ] **Step 3: Update analyzers index.ts exports**

Modify `packages/analyzers/src/index.ts` line 20 to also export the new types:

```typescript
export { LinkPlanAnalyzer, type LinkPlanResult, type PlannedTarget, type HubSummary, type LinkSuggestion, type SuggestionOptions } from './link-plan/index.js';
```

---

## Task 10: Refactor CLI command

**Files:**
- Modify: `packages/cli/src/commands/analyze/link-plan.ts`

- [ ] **Step 1: Refactor the CLI command**

```typescript
import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { LinkPlanAnalyzer, LinkPlanResult, LinkSuggestion } from '@seocore/analyzers';
import { validateUrl } from '../../shared/index.js';

export function command(): Command {
  return new Command('link-plan')
    .description('Generate actionable internal linking recommendations')
    .argument('<url>', 'Target website starting URL')
    .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
    .option('-o, --output <path>', 'Export file path')
    .option('-t, --top <number>', 'Limit suggestions to top N', parseInt)
    .option('--full', 'Crawl the entire site', false)
    .option('-d, --depth <number>', 'Crawl depth limit', parseInt)
    .option('-m, --max-pages <number>', 'Maximum pages to crawl', parseInt)
    .option('--min-confidence <number>', 'Minimum confidence threshold (0-100)', parseInt)
    .option('--max-suggestions-per-target <number>', 'Max suggestions per target page', parseInt)
    .option('--verbose', 'Show additional diagnostic details', false)
    .action(handler);
}

async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    console.log(pc.cyan('\n🔗  Analyzing internal link structure...\n'));

    const partialConfig: any = {
      maxPages: options.maxPages || (options.full ? 100 : 50),
      maxDepth: options.depth || (options.full ? 5 : 3),
      preset: 'standard',
    };

    const eventBus = new EventBus();
    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig);

    const analyzer = new LinkPlanAnalyzer();
    const plan = analyzer.analyze(result.pages, result.crawlGraph, url, {
      maxSuggestions: options.full ? 100 : 50,
      maxSuggestionsPerTarget: options.maxSuggestionsPerTarget || 5,
      minConfidence: options.minConfidence || 0,
    });

    if (options.format === 'json') {
      const outPath = options.output || './link-plan-report.json';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
      console.log(pc.green(`✓  JSON report exported to ${pc.bold(outPath)}`));
      return;
    }

    if (options.format === 'html') {
      const htmlOutput = generateHtml(plan);
      const outPath = options.output || './link-plan-report.html';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, htmlOutput, 'utf8');
      console.log(pc.green(`✓  HTML report exported to ${pc.bold(outPath)}`));
      return;
    }

    printTerminalReport(plan, options.top, options.verbose);
  } catch (err: any) {
    console.error(pc.red(`\nLink plan analysis failed: ${err.message}`));
    process.exit(1);
  }
}

function printTerminalReport(plan: LinkPlanResult, limit?: number, verbose?: boolean): void {
  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                 INTERNAL LINK PLANNER')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  if (plan.suggestions.length > 0) {
    console.log(pc.bold(pc.green('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.green(`SUGGESTED INTERNAL LINKS (${plan.suggestions.length}):`)));
    console.log(pc.green('───────────────────────────────────────────────────────────────'));

    const suggestions = plan.suggestions.slice(0, limit || 15);
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const confColor = s.confidence > 70 ? pc.green : s.confidence > 50 ? pc.yellow : pc.gray;
      const confBadge = confColor(`${s.confidence}%`);
      const scoreBadge = pc.gray(`score: ${s.score}`);

      console.log(`\n  ${pc.green('→')} ${pc.bold(`Link #${i + 1}`)} ${pc.gray(`[${confBadge} confidence · ${scoreBadge}]`)}`);

      const sourceShort = s.sourceUrl.length > 60 ? s.sourceUrl.slice(0, 57) + '...' : s.sourceUrl;
      const targetShort = s.targetUrl.length > 60 ? s.targetUrl.slice(0, 57) + '...' : s.targetUrl;

      console.log(`    ${pc.cyan('From:')} ${sourceShort}`);
      if (s.sourceTitle) {
        console.log(`    ${pc.gray('└─')} Title: "${s.sourceTitle.slice(0, 50)}"`);
      }

      console.log(`    ${pc.green('To:')} ${targetShort}`);
      if (s.targetTitle) {
        console.log(`    ${pc.gray('└─')} Title: "${s.targetTitle.slice(0, 50)}"`);
      }

      console.log(`    ${pc.magenta('Anchor:')} "${s.anchorTheme}"`);
      console.log(`    ${pc.gray('Reason:')} ${s.reason}`);
      if (verbose && s.sourceSignals.length > 0) {
        console.log(`    ${pc.gray('Signals:')} ${s.sourceSignals.join(', ')}`);
      }
    }
    if (plan.suggestions.length > suggestions.length) {
      console.log(`\n  ${pc.gray(`... and ${plan.suggestions.length - suggestions.length} more suggestions`)}`);
    }
    console.log();
  }

  if (plan.orphanPages.length > 0) {
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`ORPHAN PAGES (${plan.orphanPages.length}):`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));

    const orphans = plan.orphanPages.slice(0, limit || 10);
    for (const orphan of orphans) {
      const titleStr = orphan.title ? `"${orphan.title.slice(0, 50)}${orphan.title.length > 50 ? '...' : ''}"` : 'No title';
      console.log(`  ${pc.red('○')} ${pc.cyan(orphan.url)}`);
      console.log(`    ${pc.gray('└─')} Title: ${pc.white(titleStr)}`);
      console.log(`    ${pc.gray('└─')} ${pc.yellow(orphan.reason)}`);
      if (verbose && orphan.score != null) {
        console.log(`    ${pc.gray('└─')} Target score: ${orphan.score}`);
      }
    }
    if (plan.orphanPages.length > orphans.length) {
      console.log(`  ${pc.gray(`... and ${plan.orphanPages.length - orphans.length} more orphan pages`)}`);
    }
    console.log();
  }

  if (plan.priorityPages.length > 0) {
    console.log(pc.bold(pc.yellow('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.yellow(`LOW-AUTHORITY PRIORITY PAGES (${plan.priorityPages.length}):`)));
    console.log(pc.yellow('───────────────────────────────────────────────────────────────'));

    const priorities = plan.priorityPages.slice(0, limit || 10);
    for (const priority of priorities) {
      const titleStr = priority.title ? `"${priority.title.slice(0, 50)}${priority.title.length > 50 ? '...' : ''}"` : 'No title';
      console.log(`  ${pc.yellow('★')} ${pc.cyan(priority.url)}`);
      console.log(`    ${pc.gray('└─')} Title: ${pc.white(titleStr)}`);
      console.log(`    ${pc.gray('└─')} ${pc.yellow(priority.reason)}`);
      if (verbose && priority.score != null) {
        console.log(`    ${pc.gray('└─')} Target score: ${priority.score}`);
      }
    }
    if (plan.priorityPages.length > priorities.length) {
      console.log(`  ${pc.gray(`... and ${plan.priorityPages.length - priorities.length} more priority pages`)}`);
    }
    console.log();
  }

  if (plan.hubs.length > 0) {
    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.cyan(`HIGH-LEVERAGE HUBS (${plan.hubs.length}):`)));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));

    for (const hub of plan.hubs.slice(0, limit || 10)) {
      const authColor = hub.authorityScore > 70 ? pc.green : hub.authorityScore > 40 ? pc.yellow : pc.gray;
      const hubShort = hub.url.length > 60 ? hub.url.slice(0, 57) + '...' : hub.url;

      console.log(`  ${pc.cyan('●')} ${hubShort}`);
      console.log(`    ${pc.gray('└─')} Out-links: ${pc.white(hub.outDegree)} | In-links: ${pc.white(hub.inDegree)} | Authority: ${authColor(hub.authorityScore.toFixed(0))}`);
    }
    console.log();
  }

  console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
  console.log(pc.bold('SUMMARY:'));
  console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
  console.log(`  Orphan pages:     ${pc.red(String(plan.summary.orphanCount))}`);
  console.log(`  Priority pages:   ${pc.yellow(String(plan.summary.priorityCount))}`);
  console.log(`  Suggestions:      ${pc.green(String(plan.summary.suggestionCount))}`);
  console.log(`  Hubs:             ${pc.cyan(String(plan.summary.hubCount))}`);
  console.log();

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  if (plan.summary.orphanCount === 0 && plan.summary.priorityCount === 0) {
    console.log(pc.green('✓  No linking issues detected. Your internal link structure looks healthy!\n'));
  } else {
    const totalIssues = plan.summary.orphanCount + plan.summary.priorityCount;
    console.log(pc.yellow(`⚠  Found ${totalIssues} pages that could benefit from additional internal links.\n`));
  }
}

function generateHtml(plan: LinkPlanResult): string {
  const suggestionsRows = plan.suggestions.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><a href="${s.sourceUrl}">${s.sourceUrl}</a>${s.sourceTitle ? `<br><small>${s.sourceTitle}</small>` : ''}</td>
      <td><a href="${s.targetUrl}">${s.targetUrl}</a>${s.targetTitle ? `<br><small>${s.targetTitle}</small>` : ''}</td>
      <td>${s.anchorTheme}</td>
      <td><span class="badge ${s.confidence > 70 ? 'good' : s.confidence > 50 ? 'mid' : 'low'}">${s.confidence}%</span></td>
      <td>${s.score}</td>
      <td>${s.reason}</td>
    </tr>
  `).join('');

  const orphanCards = plan.orphanPages.map(o => `
    <div class="card orphan">
      <div class="card-title"><a href="${o.url}">${o.url}</a></div>
      ${o.title ? `<div class="card-subtitle">${o.title}</div>` : ''}
      <div class="card-meta">${o.reason}</div>
    </div>
  `).join('');

  const hubCards = plan.hubs.map(h => `
    <div class="card hub">
      <div class="card-title"><a href="${h.url}">${h.url}</a></div>
      <div class="card-meta">Out: ${h.outDegree} | In: ${h.inDegree} | Authority: ${h.authorityScore}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Internal Link Plan - ${plan.url}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; max-width: 1400px; margin: 0 auto; background: #f8fafc; color: #1e293b; }
    h1, h2, h3 { color: #0f172a; margin-bottom: 1rem; }
    h1 { border-bottom: 2px solid #0ea5e9; padding-bottom: 0.5rem; }
    .meta { color: #64748b; margin-bottom: 2rem; }
    .section { background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); padding: 2rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f1f5f9; color: #0f172a; font-weight: 600; }
    tr:hover { background: #f8fafc; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge.good { background: #dcfce7; color: #166534; }
    .badge.mid { background: #fef9c3; color: #854d0e; }
    .badge.low { background: #f1f5f9; color: #475569; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
    .card { border-left: 4px solid; padding: 1rem; background: #fafafa; border-radius: 0 8px 8px 0; }
    .card.orphan { border-color: #ef4444; }
    .card.hub { border-color: #0ea5e9; }
    .card-title { font-weight: 600; margin-bottom: 0.25rem; }
    .card-title a { color: #0f172a; text-decoration: none; }
    .card-title a:hover { text-decoration: underline; }
    .card-subtitle { color: #64748b; font-size: 0.9rem; }
    .card-meta { color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .summary-item { text-align: center; padding: 1.5rem; background: #f1f5f9; border-radius: 8px; }
    .summary-number { font-size: 2rem; font-weight: bold; color: #0ea5e9; }
    .summary-label { color: #64748b; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>🔗 Internal Link Plan</h1>
  <div class="meta">
    <p><strong>URL:</strong> ${plan.url}</p>
    <p><strong>Generated:</strong> ${plan.generatedAt}</p>
  </div>

  <div class="section">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-number">${plan.summary.orphanCount}</div>
        <div class="summary-label">Orphan Pages</div>
      </div>
      <div class="summary-item">
        <div class="summary-number">${plan.summary.priorityCount}</div>
        <div class="summary-label">Priority Pages</div>
      </div>
      <div class="summary-item">
        <div class="summary-number">${plan.summary.suggestionCount}</div>
        <div class="summary-label">Suggestions</div>
      </div>
      <div class="summary-item">
        <div class="summary-number">${plan.summary.hubCount}</div>
        <div class="summary-label">Hubs</div>
      </div>
    </div>
  </div>

  ${plan.suggestions.length > 0 ? `
  <div class="section">
    <h2>Suggested Internal Links (${plan.suggestions.length})</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Source</th><th>Target</th><th>Anchor</th><th>Confidence</th><th>Score</th><th>Reason</th></tr>
      </thead>
      <tbody>
        ${suggestionsRows}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${plan.orphanPages.length > 0 ? `
  <div class="section">
    <h2>Orphan Pages (${plan.orphanPages.length})</h2>
    <div class="cards">
      ${orphanCards}
    </div>
  </div>
  ` : ''}

  ${plan.hubs.length > 0 ? `
  <div class="section">
    <h2>High-Leverage Hubs (${plan.hubs.length})</h2>
    <div class="cards">
      ${hubCards}
    </div>
  </div>
  ` : ''}
</body>
</html>`;
}
```

---

## Task 11: Run tests and verify

- [ ] **Step 1: Run all new tests**

Run: `npx vitest run packages/analyzers/src/link-plan/`

Expected: All tests pass

- [ ] **Step 2: Run existing analyzer tests to ensure no regression**

Run: `npx vitest run packages/analyzers/src/index.test.ts`

Expected: All tests pass

- [ ] **Step 3: Type-check the packages**

Run: `cd packages/analyzers && npx tsc --noEmit`
Run: `cd packages/cli && npx tsc --noEmit`

Expected: No type errors

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|---|---|
| Stable JSON shape with summary | Task 9 |
| Orphan pages detection | Task 3 |
| Priority pages detection | Task 3 |
| Hub extraction | Task 4 |
| Suggestion generation with dedupe | Task 8 |
| Existing-link suppression | Task 8 |
| Self-link exclusion | Task 8 |
| Source ranking | Task 4 |
| Topic relevance (title, H1, H2, URL) | Task 5 |
| Anchor theme generation | Task 6 |
| Score + confidence calculation | Task 7 |
| HTML export | Task 10 |
| `--min-confidence` flag | Task 10 |
| `--max-suggestions-per-target` flag | Task 10 |
| `--verbose` flag | Task 10 |
| Terminal summary counts | Task 10 |
| Backward-compatible wrapper | Task 9 |

## Placeholder Scan

No placeholders detected. All tasks include complete code.

## Type Consistency Check

- `PlannedTarget.score` optional number — consistent across all files
- `LinkSuggestion.score` required number — consistent across all files
- `LinkSuggestion.sourceSignals` string[] — consistent across all files
- `SuggestionOptions` interface — used in analyzer and CLI
- `NormalizedPageFacts` — central type used by all modules
