# Phase 2 — Engine Slimming

**Goal**: engine becomes pure orchestrator. Extract PageRank, backlink fetch, crawler selection, and plugin lifecycle into proper homes.
**Prerequisite**: Phase 1 complete (`scoring-core` is canonical, schema fixed, weight duplicate removed).
**Risk**: medium. Touches `engine.run()` central path. Mitigated by snapshot parity tests.
**Estimated diff**: engine `478 → ~250 lines`. Net repo gain ~200 lines (graph + plugin + crawler-registry tests).

---

## Benefits (why do this)

### Performance
- **PageRank**: O(iters × N²) → O(iters × edges + N). 5000 pages with ~25 links/page: ~125M ops → ~250k ops. ~500× speedup at enterprise tier.
- **Concurrent `engine.run()`**: currently unsafe (mutates `this.crawler`). After: safe — multiple audits in parallel from same engine instance.
- **Capability detection upfront**: Playwright/Lighthouse availability checked before crawl, not on first page failure.

### Maintainability
- Engine drops 5 unrelated responsibilities. Single responsibility = single reason to change.
- Graph algorithm unit-testable in isolation (currently a private method).
- Plugin lifecycle: 5 inline `for (const plugin of this.plugins)` loops → 5 single `registry.runHook()` calls.
- Adding new crawler (JSDOM, Firefox, cached HTTP) requires zero engine edits.

### Extensibility
- Plugin registry actually wired — foundation for Phase 5 (move Playwright/Lighthouse/screenshots/rank-check to plugins).
- `RuleEvaluationContext.dataSources` becomes generic Map → future plugins (GA, social, GSC) drop in without engine edits.
- Crawler registry enables shared-browser optimization (Lighthouse + Playwright on same chromium instance).

### Correctness
- Race condition fixed: `lighthousePagesCrawled` counter currently mutated from concurrent pQueue workers (`engine/src/index.ts:204`). Move sampling decision pre-enqueue.
- Backlink errors no longer silently swallowed into untyped string — typed `DataSourceStatus`.

---

## 1. Extract PageRank + crawl-graph → `scoring-core/graph.ts`

### 1.1 Create the module
- [ ] Create `packages/scoring-core/src/graph.ts` with two classes:
  ```ts
  export interface GraphBuildInput {
    pages: Record<string, NormalizedPage>;
    startUrl: string;
    domain: string;
    sitemapUrls: string[];
  }
  
  export class CrawlGraphBuilder {
    static build(input: GraphBuildInput): CrawlGraph;
  }
  
  export interface PageRankOptions {
    damping?: number;       // default 0.85
    iterations?: number;    // default 20 (was 5)
    tolerance?: number;     // default 1e-4 (early termination)
  }
  
  export class PageRankCalculator {
    static calculate(
      nodes: string[],
      outLinks: Map<string, Set<string>>,
      opts?: PageRankOptions
    ): Map<string, number>;
  }
  ```
- [ ] Export both from `packages/scoring-core/src/index.ts`

### 1.2 Port logic from engine
- [ ] Copy `calculateCrawlGraph` body from `packages/engine/src/index.ts:331-477` into `CrawlGraphBuilder.build`
- [ ] Split into stages:
  - [ ] `injectSitemapOrphans(pages, sitemapUrls, domain)` — lines 337-364
  - [ ] `buildLinkMaps(pages)` → `{ inLinks, outLinks, edges }` — lines 366-388
  - [ ] `computeDegrees(pages, inLinks, outLinks, startUrl)` — lines 390-402
  - [ ] Delegate PageRank to `PageRankCalculator.calculate(...)`
  - [ ] `computeNormalizedAuthorityScores(ranks)` — lines 438-443
  - [ ] `computeMetrics(nodes)` — lines 456-465

### 1.3 Optimize PageRank
- [ ] Replace dangling-node O(N²) broadcast (`engine/src/index.ts:428-433`) with rank-sink:
  ```ts
  // Sum dangling rank once, redistribute uniformly
  let danglingSum = 0;
  for (const url of nodes) {
    if (outLinks.get(url)!.size === 0) danglingSum += ranks.get(url)!;
  }
  const danglingShare = (danglingSum * damping) / numPages;
  // Add danglingShare to every node BEFORE the link distribution pass
  ```
- [ ] Add early termination on tolerance:
  ```ts
  const delta = computeL1Diff(ranks, nextRanks);
  if (delta < tolerance) break;
  ```
- [ ] Use `Map<string, number>` instead of `Record<string, number>` for hot loops (faster mutation, no prototype chain)

### 1.4 Engine integration
- [ ] `packages/engine/src/index.ts:21` — add import: `import { CrawlGraphBuilder } from '@seocore/scoring-core';`
- [ ] Replace line 251 call site:
  ```ts
  const crawlGraph = CrawlGraphBuilder.build({ pages, startUrl, domain, sitemapUrls });
  ```
- [ ] Delete private `calculateCrawlGraph` method (lines 331-477) from engine

### 1.5 Tests
- [ ] Create `packages/scoring-core/src/graph.test.ts`:
  - [ ] PageRank converges on canonical 3-node cycle (uniform rank ≈ 0.333)
  - [ ] Dangling node (no outlinks) doesn't drain rank
  - [ ] Orphan injection from sitemap works
  - [ ] Hub/authority ranking returns top-5 sorted
  - [ ] Tolerance early-termination triggers (assert iterations < max)
  - [ ] Parity test: same fixture before/after produces equal `authorityScore` rounded to int (graph rebuild should be byte-identical)

---

## 2. Extract backlink fetch → `@seocore/plugin-backlinks`

### 2.1 Generalize `RuleEvaluationContext`
- [ ] In `packages/sdk/src/index.ts:250-255`, replace hardcoded backlink fields:
  ```ts
  // BEFORE
  export interface RuleEvaluationContext {
    allPages: Record<string, NormalizedPage>;
    config: SeoConfig;
    backlinkData?: BacklinkIntelligenceData;
    backlinkError?: string;
  }
  
  // AFTER
  export type DataSourceStatus = 'ok' | 'error' | 'unavailable' | 'not-configured';
  export interface DataSource<T = unknown> {
    status: DataSourceStatus;
    data?: T;
    error?: string;
  }
  export interface RuleEvaluationContext {
    allPages: Record<string, NormalizedPage>;
    config: SeoConfig;
    dataSources: Map<string, DataSource>;
    // Deprecated shims (keep for backward compat one release)
    /** @deprecated use dataSources.get('backlinks') */
    backlinkData?: BacklinkIntelligenceData;
    /** @deprecated use dataSources.get('backlinks') */
    backlinkError?: string;
  }
  ```
- [ ] Update all 4 backlink rules (`packages/rules/src/index.ts:1952-2204`) to read from `context.dataSources.get('backlinks')`. Keep deprecated fields populated in parallel by engine for one release cycle.

### 2.2 Create plugin package
- [ ] Create `packages/plugin-backlinks/` with structure:
  ```
  packages/plugin-backlinks/
    package.json     ("@seocore/plugin-backlinks", deps: @seocore/sdk, @seocore/backlinks)
    tsconfig.json
    src/
      index.ts       (export createBacklinkPlugin)
      rules/
        missing-data.ts
        anchor-text.ts
        low-authority.ts
        missing-high-authority.ts
  ```
- [ ] Move backlink rule classes from `packages/rules/src/index.ts` to per-file modules:
  - [ ] `MissingBacklinkDataRule` → `rules/missing-data.ts`
  - [ ] `AnchorTextOverOptimizationRule` → `rules/anchor-text.ts`
  - [ ] `LowAuthorityBacklinksRule` → `rules/low-authority.ts`
  - [ ] `MissingHighAuthorityBacklinksRule` → `rules/missing-high-authority.ts`
- [ ] Implement plugin factory:
  ```ts
  // packages/plugin-backlinks/src/index.ts
  import { createBacklinkClient } from '@seocore/backlinks';
  
  export function createBacklinkPlugin(): SeoPlugin {
    return {
      name: 'backlinks',
      version: '1.0.0',
      rules: [
        new MissingBacklinkDataRule(),
        new AnchorTextOverOptimizationRule(),
        new LowAuthorityBacklinksRule(),
        new MissingHighAuthorityBacklinksRule(),
      ],
      lifecycle: {
        onBeforeAnalysis: async (pages, ctx) => {
          if (!ctx.config.backlinks) {
            ctx.dataSources.set('backlinks', { status: 'not-configured' });
            return;
          }
          try {
            const client = createBacklinkClient(ctx.config.backlinks);
            const data = await client.getIntelligence(ctx.startUrl, 250);
            ctx.dataSources.set('backlinks', { status: 'ok', data });
          } catch (err: any) {
            ctx.dataSources.set('backlinks', { status: 'error', error: err.message });
          }
        }
      }
    };
  }
  ```

### 2.3 Lifecycle hook signature change
- [ ] Extend `PluginLifecycleHooks` in `packages/sdk/src/index.ts:300-307`:
  ```ts
  onBeforeAnalysis?(
    pages: Record<string, NormalizedPage>,
    ctx: { startUrl: string; config: SeoConfig; dataSources: Map<string, DataSource> }
  ): Promise<void>;
  ```
- [ ] Update existing call sites that only pass `pages` (engine line 258) — provide ctx object

### 2.4 Engine decoupling
- [ ] Remove `createBacklinkClient` import from `packages/engine/src/index.ts:15`
- [ ] Remove inline backlink fetch block (lines 262-272)
- [ ] Auto-register backlink plugin when tier requires it:
  ```ts
  if (tierConfig?.modules.backlinks) {
    const { createBacklinkPlugin } = await import('@seocore/plugin-backlinks');
    this.pluginRegistry.register(createBacklinkPlugin());
  }
  ```
- [ ] Engine `package.json`: remove `@seocore/backlinks` from dependencies

### 2.5 Tests
- [ ] `packages/plugin-backlinks/src/index.test.ts`: plugin populates `dataSources` on `onBeforeAnalysis`
- [ ] Backlink rules read from `dataSources` correctly
- [ ] Tier `enterprise` auto-loads plugin; tier `standard` does not (verify via mock registry spy)
- [ ] Audit with `config.backlinks` undefined → rules emit `'not-configured'` finding, not crash

---

## 3. Crawler factory pattern

### 3.1 Create registry in `@seocore/crawler`
- [ ] Add `packages/crawler/src/registry.ts`:
  ```ts
  export type CrawlerFactory = () => Crawler;
  
  export class CrawlerRegistry {
    private factories = new Map<string, CrawlerFactory>();
    
    register(name: string, factory: CrawlerFactory): void;
    has(name: string): boolean;
    create(name: string): Crawler;
    
    /**
     * Priority-ordered selection.
     * lighthouse > playwright > http (downgrades if capability missing)
     */
    selectForConfig(config: SeoConfig): { name: string; crawler: Crawler };
  }
  
  export function createDefaultRegistry(): CrawlerRegistry {
    const reg = new CrawlerRegistry();
    reg.register('http', () => new HttpCrawler());
    // playwright + lighthouse registered by their plugins (Phase 5)
    // For Phase 2, pre-register them here directly as transitional step:
    reg.register('playwright', () => new PlaywrightCrawler());
    reg.register('lighthouse', () => new LighthouseCrawler());
    return reg;
  }
  ```
- [ ] Export from `packages/crawler/src/index.ts`

### 3.2 Capability detection
- [ ] Add `static isAvailable(): Promise<boolean>` to `PlaywrightCrawler` and `LighthouseCrawler`:
  ```ts
  static async isAvailable(): Promise<boolean> {
    try { await import('playwright'); return true; } catch { return false; }
  }
  ```
- [ ] `selectForConfig` checks availability before selection. If `config.lighthouseEnabled` but `LighthouseCrawler.isAvailable()` false → log warning via injected logger, downgrade to next priority.

### 3.3 Engine integration
- [ ] Replace `engine/src/index.ts:46-53` field + constructor:
  ```ts
  // BEFORE
  private crawler: Crawler;
  constructor(eventBus = new EventBus()) {
    this.eventBus = eventBus;
    this.ruleEngine = new RuleEngine();
    this.crawler = new HttpCrawler();
  }
  
  // AFTER
  private readonly crawlerRegistry: CrawlerRegistry;
  constructor(eventBus = new EventBus(), crawlerRegistry?: CrawlerRegistry) {
    this.eventBus = eventBus;
    this.ruleEngine = new RuleEngine();
    this.crawlerRegistry = crawlerRegistry ?? createDefaultRegistry();
  }
  ```
- [ ] Replace crawler-selection if/else (engine lines 100-107) with:
  ```ts
  const { name: crawlerName, crawler } = this.crawlerRegistry.selectForConfig(config);
  await this.eventBus.emit('crawler:selected', { name: crawlerName });
  ```
- [ ] Replace all `this.crawler.crawl(...)` calls with local `crawler` const (no instance mutation)
- [ ] Update cleanup block (lines 320-326) — close `crawler` local var

### 3.4 Fix Lighthouse race condition
- [ ] Move sampling decision pre-enqueue: build `sampledUrls: Set<string>` before `enqueue` loop based on `lighthouseSampleCount`
- [ ] Inside the queued task: `const useLighthouse = sampledUrls.has(url);` — pure read, no shared mutation
- [ ] Delete `lighthousePagesCrawled` counter (lines 122, 197-205)

### 3.5 Tests
- [ ] `packages/crawler/src/registry.test.ts`:
  - [ ] Default registry has `http`, `playwright`, `lighthouse`
  - [ ] `selectForConfig({ lighthouseEnabled: true })` returns lighthouse when available
  - [ ] `selectForConfig` downgrades to http when playwright not installed (mock `isAvailable`)
  - [ ] Custom registration via `register('jsdom', ...)` works
- [ ] Engine test: concurrent `engine.run()` × 2 with different configs don't race (one playwright, one http)

---

## 4. Wire `DefaultPluginRegistry`

### 4.1 Engine refactor
- [ ] `packages/engine/src/index.ts:48` — replace `private readonly plugins: SeoPlugin[] = []` with:
  ```ts
  private readonly pluginRegistry: DefaultPluginRegistry;
  ```
- [ ] Constructor accepts optional registry (DI-friendly):
  ```ts
  constructor(
    eventBus = new EventBus(),
    crawlerRegistry?: CrawlerRegistry,
    pluginRegistry?: DefaultPluginRegistry
  ) {
    // ...
    this.pluginRegistry = pluginRegistry ?? new DefaultPluginRegistry();
  }
  ```
- [ ] `registerPlugin(plugin)` delegates to `this.pluginRegistry.register(plugin)`
- [ ] Also forward `plugin.rules` to `ruleEngine.registerRule(r)` (preserves current behavior at `engine/src/index.ts:58-62`)

### 4.2 Centralize hook iteration
- [ ] Replace each manual loop with single registry call. Six occurrences in `engine/src/index.ts`:
  - [ ] Lines 110-114 (`onInit`) → `await this.pluginRegistry.runHook('onInit', { config })`
  - [ ] Lines 188-193 (`onBeforeCrawl`) → `const rewrittenUrl = await this.pluginRegistry.runUrlRewriteHook('onBeforeCrawl', url)`
  - [ ] Lines 225-229 (`onPageCrawled`) → `await this.pluginRegistry.runHook('onPageCrawled', { result: crawlResult, page })`
  - [ ] Lines 256-260 (`onBeforeAnalysis`) → `await this.pluginRegistry.runHook('onBeforeAnalysis', { pages, ctx })`
  - [ ] Lines 278-283 (`onAfterAnalysis`) → `findings = await this.pluginRegistry.runMutationHook('onAfterAnalysis', findings)`
  - [ ] Lines 311-315 (`onComplete`) → `await this.pluginRegistry.runHook('onComplete', { result: auditResult })`
- [ ] Add `runUrlRewriteHook` + `runMutationHook` to `DefaultPluginRegistry` for hooks that return values

### 4.3 Wire `loadPluginsForTier`
- [ ] Uncomment + implement `packages/engine/src/plugin-registry.ts:71-92` (the `PLUGIN_MANIFEST`):
  ```ts
  export const PLUGIN_MANIFEST: Record<string, () => Promise<SeoPlugin>> = {
    'backlinks': async () => {
      const { createBacklinkPlugin } = await import('@seocore/plugin-backlinks');
      return createBacklinkPlugin();
    },
    // playwright/lighthouse stay commented — Phase 5
  };
  ```
- [ ] `loadPluginsForTier(tierConfig)` (lines 94-109) — enable the backlink branch:
  ```ts
  if (tierConfig.modules.backlinks && PLUGIN_MANIFEST['backlinks']) {
    plugins.push(await PLUGIN_MANIFEST['backlinks']());
  }
  ```
- [ ] Call it once at start of `engine.run()`, after tier resolution:
  ```ts
  const autoPlugins = await loadPluginsForTier(tierConfig);
  for (const p of autoPlugins) this.pluginRegistry.register(p);
  ```

### 4.4 Tests
- [ ] `packages/engine/src/plugin-registry.test.ts`:
  - [ ] `register` + `getRules` aggregates across plugins
  - [ ] `runHook('onPageCrawled', ctx)` invokes every plugin's handler
  - [ ] `runMutationHook` chains return values through plugins
  - [ ] Hook error in one plugin doesn't abort the chain
- [ ] Engine integration test: registering plugin via `engine.registerPlugin()` works identically to before

---

## 5. Cross-cutting verification

### 5.1 Snapshot parity
- [ ] Pre-Phase-2: run `npm run cli -- audit https://example.com --tier standard --format json --output before.json`
- [ ] Pre-Phase-2: run same against `https://example.com --tier enterprise` (mock backlinks fixture)
- [ ] Post-Phase-2: re-run, diff JSON. Acceptable diffs:
  - [ ] `crawlGraph.nodes[].authorityScore` — should match within ±1 integer (PageRank may converge differently with new dangling logic)
  - [ ] `findings` array — must be identical (sort by `id` first if order differs)
  - [ ] `score`, `categories[].score` — must match exactly
  - [ ] `pages` — must match exactly

### 5.2 Concurrency
- [ ] Add test: two `engine.run()` calls in parallel with different configs (one playwright, one http) — both succeed, no cross-contamination of crawler instances

### 5.3 Build/test
- [ ] `npm run build` — clean
- [ ] `npm test` — all green
- [ ] Manual smoke: each tier (`fast`, `standard`, `deep`, `enterprise`) produces non-zero score
- [ ] Manual smoke: `engine.registerPlugin(customPlugin)` from external SDK consumer still works

---

## 6. Commit strategy

Five atomic commits:

- [ ] `refactor(scoring-core): extract CrawlGraphBuilder + PageRankCalculator from engine`
- [ ] `perf(scoring-core): O(N) dangling-node redistribution, tolerance early-termination in PageRank`
- [ ] `refactor(plugin-backlinks): extract backlink rules + lifecycle into dedicated plugin package`
- [ ] `refactor(crawler): add CrawlerRegistry; engine selects crawler via registry`
- [ ] `refactor(engine): wire DefaultPluginRegistry, centralize lifecycle hook iteration`

---

## Definition of Done

- [ ] `packages/engine/src/index.ts` is ≤ 250 lines
- [ ] No graph/PageRank math in engine
- [ ] No `createBacklinkClient` import in engine
- [ ] No `new HttpCrawler() | new PlaywrightCrawler() | new LighthouseCrawler()` calls in engine
- [ ] No `for (const plugin of this.plugins)` loops in engine
- [ ] `lighthousePagesCrawled` counter removed
- [ ] Two `engine.run()` calls in parallel produce correct independent results
- [ ] PageRank converges in ≤ 20 iterations with tolerance 1e-4 on standard fixtures
- [ ] `dataSources: Map<string, DataSource>` available to all rules
- [ ] `PLUGIN_MANIFEST.backlinks` is live (not commented)
- [ ] Snapshot parity: scores byte-identical, findings identical, authority scores within ±1
- [ ] Build + tests green
- [ ] No regression in any existing CLI command output

---

## Out of scope (deferred)

- **Phase 3**: split `packages/rules` monolith into per-category packages (rules-performance, rules-mobile, rules-ai, etc.). Route AI-visibility through Finding pipeline instead of CLI override.
- **Phase 4**: CLI command grouping, subcommands, shared option builders.
- **Phase 5**: Move Playwright + Lighthouse + screenshots + rank-check to plugin packages. Crawler registry already supports it; Phase 5 just relocates code.
- **Phase 6**: Streaming pipeline (drop HTML after rules run), parallel rule execution per page, crawl cache.

---

## Risk register

| Risk | Mitigation |
|---|---|
| PageRank optimization changes rankings | Keep `PageRankCalculator.calculateLegacy()` available; A/B test |
| Plugin lifecycle signature change breaks external consumers | Old signature accepted via overload for one release; deprecation warning |
| Auto-loading plugin-backlinks breaks audits when backlinks config missing | Plugin handles `not-configured` status gracefully (verified in test) |
| Race condition fix for Lighthouse sampling changes which pages get sampled | Sample by stable hash of URL → deterministic; document the change |
| `RuleEvaluationContext.dataSources` is a breaking change for custom rules | Deprecated shim fields (`backlinkData`, `backlinkError`) populated in parallel for one release |
