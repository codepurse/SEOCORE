# Phase 6 — Performance & Scaling

**Goal**: production-grade performance. Stream pipeline (drop HTML post-rules), parallel rule execution per page, pre-computed indexes for cross-page rules, persistent crawl cache, adaptive concurrency, streaming reporter.

**Prerequisite**: Phases 1-5 complete. Specifically requires:
- Phase 2: PageRank already in `scoring-core/graph.ts` with O(edges+N), CrawlerRegistry, plugin lifecycle wired
- Phase 3: rules tagged with `module` field, `BaseRule` template, typed `subCheck`
- Phase 5: Playwright/Lighthouse as plugins (so streaming pipeline doesn't have to special-case them)

**Risk**: high — touches the hot path of every audit. Mitigated by per-intervention feature flags (`--legacy-buffered`, `--no-cache`, `--no-adaptive`) so each change ships independently and can be disabled.

**Estimated diff**: net +600 lines (cache, adaptive concurrency, indexes, streaming) but engine `run()` body shrinks ~30%.

---

## Benefits summary

### Memory
- 5000pg enterprise tier: ~500MB → ~50MB resident
- Removes the implicit OOM ceiling — `maxPages` now bounded by disk (cache), not RAM
- Containers with 512MB limits stop OOMing → Phase 6 unlocks SaaS deployment

### Speed
- **Parallel rules per page**: ~6× on 8-core (41 rules go concurrent within a page instead of serial)
- **O(1) cross-page lookups** (titles, content hashes, link maps): minutes → milliseconds at 5000pg
- **Cache on re-audit**: unchanged 5000pg site goes from ~10 min → ~10 s
- **Adaptive concurrency**: fewer 429/503 retries, fewer wasted requests

### Reliability
- AIMD backoff lets audits succeed against tight-rate-limited sites that currently fail mid-crawl
- Per-domain limiters: multi-host audits don't penalize fast hosts because one slow host is throttled
- Cache survives mid-audit crash: resume picks up where it left off
- Streaming reporter doesn't block event loop on huge reports

### Cost
- Cached re-audits = fewer outbound HTTP requests = less egress + friendlier to target sites
- Bounded memory = smaller containers = lower infrastructure cost
- Enables incremental audits in CI (re-check only pages changed since last commit)

### Scalability headroom (Phase 7+)
- Cache layer abstraction (FS now, Redis later) → distributed workers possible
- Pipeline stages decoupled via async iterators → swap in queue (BullMQ/SQS) without engine changes
- Foundation for "incremental audit" feature: only re-audit pages whose ETag changed

---

## 0. Pre-flight: capture baseline performance

You cannot improve what you don't measure.

- [ ] Set up benchmark fixtures:
  - [ ] `tests/perf/fixtures/small-site/` — 50 static HTML pages with internal links, served via `serve`
  - [ ] `tests/perf/fixtures/medium-site/` — 500 pages
  - [ ] `tests/perf/fixtures/large-site/` — 5000 pages (generated)
- [ ] Capture pre-Phase-6 metrics per fixture:
  - [ ] Wall-clock duration (cold + warm)
  - [ ] Peak RSS via `process.memoryUsage().rss`
  - [ ] Peak heap via `process.memoryUsage().heapUsed`
  - [ ] Total findings count
  - [ ] Total score
- [ ] Write results to `tests/perf/baseline-phase-5.json`
- [ ] Define acceptance thresholds (must be met by Phase-6 end):
  - [ ] Memory: ≥ 5× reduction at 5000pg
  - [ ] Speed: ≥ 3× faster cold, ≥ 20× faster warm (cached re-audit)
  - [ ] Findings + score must be byte-identical to baseline (parity)

---

## 1. Streaming pipeline — drop HTML post-rules

### 1.1 Categorize rules: stateless vs stateful
- [ ] Audit all rules (post-Phase-3) by inspecting `RuleEvaluationContext` usage:
  - [ ] **Stateless rules** — only read `page`, never `ctx.allPages`. Can run during crawl. Examples: `MissingTitleRule`, `MissingMetaDescriptionRule`, `MissingAltTextRule`, `MissingH1Rule`, `MultipleH1Rule`, `NoIndexRule`, `LowPerformanceScoreRule`, `LcpMetricRule`, `ClsMetricRule`, etc.
  - [ ] **Stateful rules** — read `ctx.allPages`. Must wait until crawl completes. Examples: `DuplicateTitleRule`, `BrokenLinksRule`, `OrphanPageRule`, `InternalLinkingRule`, `DuplicateContentSimilarityRule`, `MissingHighAuthorityBacklinksRule`
- [ ] Add `stateless?: boolean` to `RuleDefinition` in `@seocore/sdk` (default `false` for safety, opt-in to streaming)
- [ ] Annotate every rule's definition with the correct flag

### 1.2 Two-pass pipeline in engine
- [ ] Refactor `packages/engine/src/index.ts` `run()` into pipeline stages:
  ```ts
  async run(...) {
    // Stage 1: Crawl + per-page stateless rules + drop HTML
    const pageStream = this.streamCrawl(startUrl, config);
    const findings: Finding[] = [];
    const pageSummaries = new Map<string, NormalizedPage>();
    
    for await (const page of pageStream) {
      const statelessFindings = await this.runStatelessRules(page, ctx);
      findings.push(...statelessFindings);
      
      // Build index entries BEFORE dropping html (cross-page rules need them)
      this.indexes.indexPage(page);
      
      // Drop html, keep lightweight summary
      const summary = this.toSummary(page);
      pageSummaries.set(page.url, summary);
      
      await this.eventBus.emit('page:processed', { url: page.url, findingsSoFar: findings.length });
    }
    
    // Stage 2: Stateful rules using indexes only (no html)
    const statefulFindings = await this.runStatefulRules(pageSummaries, this.indexes, ctx);
    findings.push(...statefulFindings);
    
    // Stage 3: Graph + scoring
    const crawlGraph = CrawlGraphBuilder.build({ pages: pageSummaries, ... });
    const scoring = ScoringEngine.calculate({ findings, ... });
    
    return { ...result };
  }
  ```
- [ ] Add `streamCrawl` as async generator yielding pages as they're crawled
- [ ] Add `toSummary(page): NormalizedPage` that clones page minus `html` field

### 1.3 Page summary contract
- [ ] Extend `NormalizedPage` with optional `htmlDropped?: true` flag
- [ ] Stateful rules that need html (e.g. `DuplicateContentSimilarityRule` if it tokenizes raw HTML) must instead consume the pre-computed index (see §3.3) — never the raw html string
- [ ] Document: post-stateless-pass, `page.html` is `undefined`; rules attempting to read it must fail loudly via dev-mode assertion

### 1.4 Feature flag for safety
- [ ] Add `--legacy-buffered` CLI flag (default off) that runs the old buffered pipeline for fallback
- [ ] Add `SeoConfig.streamingEnabled?: boolean` (default `true` post-Phase-6)
- [ ] Engine branches: streaming pipeline vs legacy buffered pipeline based on flag
- [ ] Remove legacy path in a follow-up release after parity confidence

### 1.5 Tests
- [ ] `tests/perf/streaming-memory.test.ts`:
  - [ ] Run 500pg fixture with streaming
  - [ ] Assert peak `process.memoryUsage().heapUsed` is < 30% of legacy buffered run
- [ ] Parity test: streaming + legacy produce identical `findings` (sorted) and `score`
- [ ] Assertion test: a rule that tries to read `page.html` post-drop emits a clear error message

---

## 2. Parallel rule execution per page

### 2.1 Replace serial rule loop
- [ ] In post-Phase-3 `RuleEngine.run()` (now in `@seocore/rules-core`), replace:
  ```ts
  for (const rule of activeRules) {
    const findings = await rule.evaluate(page, context);
    allFindings.push(...findings);
  }
  ```
  with:
  ```ts
  const results = await Promise.all(
    activeRules.map(async rule => {
      try {
        return await rule.evaluate(page, context);
      } catch (err: any) {
        console.error(`[RuleEngine] ${rule.definition.id} on ${page.url}: ${err.message}`);
        return [];
      }
    })
  );
  allFindings.push(...results.flat());
  ```
- [ ] Same treatment for streaming path in §1.2

### 2.2 Bound concurrency to avoid CPU saturation
- [ ] Wrap with `p-limit` inside rule execution to cap parallel rules at `os.cpus().length`:
  ```ts
  const limit = pLimit(os.cpus().length);
  const results = await Promise.all(
    activeRules.map(rule => limit(() => rule.evaluate(page, context).catch(...)))
  );
  ```
- [ ] Add `SeoConfig.ruleConcurrency?: number` override (default `os.cpus().length`)

### 2.3 Identify and protect non-thread-safe rules
- [ ] Rules that mutate shared state must declare it: add `isolated?: boolean` to `RuleDefinition` (default `false`)
- [ ] Isolated rules run serially after parallel batch; rare, used only if a rule writes to a shared cache
- [ ] Audit all rules — most should be safe (they only read `page` and `ctx`, return findings)

### 2.4 Tests
- [ ] Benchmark: 100pg × 41 rules — assert parallel completes in ≤ 30% of serial wall-clock on 4-core machine
- [ ] Parity: parallel + serial produce identical findings (sort by `id`)
- [ ] Stress: 5000pg × 41 rules — no OOM, no event-loop starvation (measure max event-loop lag)

---

## 3. Pre-computed indexes for cross-page rules

### 3.1 Index registry
- [ ] Create `packages/rules-core/src/indexes/index.ts`:
  ```ts
  export class PageIndexRegistry {
    private titleIndex = new Map<string, string[]>();        // titleHash → urls
    private metaDescIndex = new Map<string, string[]>();
    private contentHashIndex = new Map<string, string[]>();   // shingled content
    private internalLinksIn = new Map<string, Set<string>>(); // target → sources
    private internalLinksOut = new Map<string, Set<string>>(); // source → targets
    private h1Index = new Map<string, string[]>();
    
    indexPage(page: NormalizedPage): void {
      if (page.title) {
        const key = normalizeTitle(page.title);
        const list = this.titleIndex.get(key) ?? [];
        list.push(page.url);
        this.titleIndex.set(key, list);
      }
      // ... metaDesc, content hash, links, h1
    }
    
    duplicateTitles(url: string, title: string): string[] {
      const key = normalizeTitle(title);
      return (this.titleIndex.get(key) ?? []).filter(u => u !== url);
    }
    
    inboundLinks(url: string): Set<string> {
      return this.internalLinksIn.get(url) ?? new Set();
    }
    
    // ... etc
  }
  ```
- [ ] Inject `PageIndexRegistry` into `RuleEvaluationContext`:
  ```ts
  export interface RuleEvaluationContext {
    allPages: Record<string, NormalizedPage>;  // summaries only post-streaming
    indexes: PageIndexRegistry;                 // NEW
    config: SeoConfig;
    dataSources: Map<string, DataSource>;
  }
  ```

### 3.2 Migrate stateful rules to use indexes
- [ ] `DuplicateTitleRule` — replace O(N) scan in `evaluate` with `ctx.indexes.duplicateTitles(page.url, page.title)` — O(1) lookup
- [ ] `OrphanPageRule` — use `ctx.indexes.inboundLinks(page.url)` instead of scanning all pages
- [ ] `BrokenLinksRule` — keep current logic (it's per-page link iteration, already O(out-links))
- [ ] `DuplicateContentSimilarityRule` — pre-compute content shingles in index, compare via Jaccard on hash buckets
- [ ] `InternalLinkingRule` + `InternalLinkDistributionRule` — use indexed link maps
- [ ] `MissingHighAuthorityBacklinksRule` — already uses backlink data source, unchanged

### 3.3 Content shingling for similarity
- [ ] Implement `contentShingles(html, k=5): Set<string>` — k-shingles of text content (after stripping HTML)
- [ ] Store first 64 shingle hashes per page (MinHash signature for cheap Jaccard estimation)
- [ ] `DuplicateContentSimilarityRule` queries: `ctx.indexes.similarPages(page.url, threshold=0.8)` returns urls with Jaccard ≥ threshold

### 3.4 Tests
- [ ] Index correctness: insert 5 pages with known overlap; assertions on `duplicateTitles`, `inboundLinks`, `similarPages`
- [ ] Benchmark: `DuplicateTitleRule` on 5000 pages — assert wall-clock < 50ms (vs current O(N²) ~ seconds)
- [ ] Parity: rules using indexes produce identical findings vs pre-Phase-6 reference

---

## 4. Persistent crawl cache

### 4.1 Cache contract
- [ ] Create `packages/crawler/src/cache/` with:
  ```ts
  export interface CrawlCacheEntry {
    url: string;
    etag?: string;
    lastModified?: string;
    statusCode: number;
    contentType: string;
    bodyHash: string;          // sha256 of body
    bodyPath: string;          // path to cached body file
    crawledAt: string;         // ISO
    expiresAt?: string;
  }
  
  export interface CrawlCache {
    get(url: string): Promise<CrawlCacheEntry | null>;
    set(url: string, entry: CrawlCacheEntry, body: Buffer): Promise<void>;
    has(url: string): Promise<boolean>;
    invalidate(url: string): Promise<void>;
    clear(): Promise<void>;
    stats(): Promise<{ entries: number; sizeBytes: number }>;
  }
  ```
- [ ] Default implementation: `FilesystemCrawlCache` storing under `.seocore-cache/`:
  ```
  .seocore-cache/
    index.json              (Map<urlHash, CrawlCacheEntry>)
    bodies/
      <urlHash>.body        (gzipped HTML)
  ```
- [ ] Abstraction so future Redis/S3 backends drop in (Phase 7)

### 4.2 Wire cache into HttpCrawler
- [ ] `HttpCrawler` accepts optional `cache: CrawlCache` via constructor
- [ ] Crawl logic:
  ```ts
  async crawl(url, config) {
    if (this.cache) {
      const entry = await this.cache.get(url);
      if (entry && this.isFresh(entry, config)) {
        const headers: HeadersInit = {};
        if (entry.etag) headers['If-None-Match'] = entry.etag;
        if (entry.lastModified) headers['If-Modified-Since'] = entry.lastModified;
        
        const response = await fetch(url, { ...opts, headers });
        if (response.status === 304) {
          // Cache hit — return cached body
          const body = await this.cache.readBody(entry);
          return this.buildResult(url, entry, body);
        }
      }
    }
    
    // Cache miss or stale — fetch normally
    const result = await this.fetchFresh(url, config);
    if (this.cache && result.statusCode === 200) {
      await this.cache.set(url, this.toEntry(result), Buffer.from(result.html!));
    }
    return result;
  }
  ```

### 4.3 Cache invalidation
- [ ] TTL-based: `config.cacheMaxAge?: number` (seconds; default 24h)
- [ ] Manual: `seocore cache clear` command + `seocore cache stats`
- [ ] Per-URL: `seocore cache invalidate <url>`
- [ ] Auto: invalidate when crawl detects rule violation that suggests content moved (e.g. 301 redirect with different target than cached)

### 4.4 Concurrency safety
- [ ] Filesystem cache uses atomic file writes (`fs.writeFile` to tmp + rename)
- [ ] Index file uses lock file `index.json.lock` to prevent concurrent writes corrupting it
- [ ] Or: append-only WAL pattern — every set appends a record, periodic compaction rewrites index

### 4.5 CLI integration
- [ ] Add `--no-cache` flag (disable cache for this run)
- [ ] Add `--cache-dir <path>` (override default `.seocore-cache/`)
- [ ] Add commands: `seocore cache stats`, `seocore cache clear`, `seocore cache invalidate <url>`
- [ ] Add `--force-refresh` (ignore cache for fetch but still write back after)

### 4.6 Tests
- [ ] Cache hit returns same result as miss (parity)
- [ ] Cache hit on 304 doesn't refetch body (mock fetch counter)
- [ ] Cache stale after TTL → refetch
- [ ] Concurrent writes don't corrupt index (race test with 100 concurrent `set` calls)
- [ ] Cache survives process crash (kill -9 mid-write; restart; verify integrity)
- [ ] Benchmark: 500pg site, warm cache → must complete in < 5% of cold time

---

## 5. Adaptive concurrency (AIMD)

### 5.1 Replace fixed Bottleneck with adaptive limiter
- [ ] Create `packages/crawler/src/adaptive-limiter.ts`:
  ```ts
  export interface AdaptiveLimiterOptions {
    minConcurrency: number;     // default 1
    maxConcurrency: number;     // default config.concurrency
    initialConcurrency: number; // default ceil(maxConcurrency / 2)
    multiplicativeDecrease: number; // 0.5
    additiveIncrease: number;       // 1
    decreaseOnStatusCodes: number[]; // [429, 503]
    decreaseOnConsecutiveErrors: number; // 3
    increaseAfterSuccessCount: number;   // 20
  }
  
  export class AdaptiveLimiter {
    private current: number;
    private inFlight = new Set<Promise<any>>();
    private successStreak = 0;
    private errorStreak = 0;
    
    async schedule<T>(task: () => Promise<T>): Promise<T> { ... }
    
    onResponse(statusCode: number): void {
      if (this.opts.decreaseOnStatusCodes.includes(statusCode)) {
        this.errorStreak++;
        this.successStreak = 0;
        if (this.errorStreak >= this.opts.decreaseOnConsecutiveErrors) {
          this.current = Math.max(
            this.opts.minConcurrency,
            Math.floor(this.current * this.opts.multiplicativeDecrease)
          );
          this.errorStreak = 0;
        }
      } else if (statusCode >= 200 && statusCode < 300) {
        this.successStreak++;
        this.errorStreak = 0;
        if (this.successStreak >= this.opts.increaseAfterSuccessCount) {
          this.current = Math.min(
            this.opts.maxConcurrency,
            this.current + this.opts.additiveIncrease
          );
          this.successStreak = 0;
        }
      }
    }
  }
  ```

### 5.2 Per-domain limiters for multi-host audits
- [ ] Wrap `AdaptiveLimiter` per hostname in `DomainLimiterRegistry`
- [ ] Engine queries limiter for each URL's hostname before scheduling
- [ ] Cross-domain audits (rare but possible with broken-link crawl into external) don't penalize fast hosts

### 5.3 Engine integration
- [ ] Replace `new Bottleneck({ minTime: config.rateLimitMs })` in `packages/engine/src/index.ts:155` with `new AdaptiveLimiter({ maxConcurrency: config.concurrency, ... })`
- [ ] Keep Bottleneck only for `rateLimitMs` (inter-request delay), not for concurrency cap
- [ ] OR: write a unified `RateAndConcurrencyLimiter` that combines both

### 5.4 Telemetry
- [ ] Emit events: `limiter:throttled` (downgrade), `limiter:recovered` (upgrade)
- [ ] CLI verbose mode shows current concurrency per domain in audit progress
- [ ] Log AIMD adjustments in `--verbose` mode

### 5.5 Tests
- [ ] Simulated server returning 429 → limiter decreases concurrency, recovers when 429s stop
- [ ] Mixed-domain crawl: slow domain throttled, fast domain unaffected
- [ ] Configurable thresholds tested for boundary behavior

---

## 6. Streaming reporter

### 6.1 JSON streaming
- [ ] Replace `JSON.stringify(result, null, 2)` + `fs.writeFileSync` with stream:
  ```ts
  import { createWriteStream } from 'fs';
  import { Readable, pipeline } from 'stream/promises';
  
  static async export(result: AuditResult, outputPath: string): Promise<string> {
    const stream = this.toJsonStream(result);
    const out = createWriteStream(outputPath);
    await pipeline(stream, out);
    return path.resolve(outputPath);
  }
  
  private static toJsonStream(result: AuditResult): Readable {
    // Stream large arrays (findings, pages) page-by-page; keep small fields inline
    // ...
  }
  ```
- [ ] Memory-bound the JSON output; never materializes full string in memory

### 6.2 HTML streaming
- [ ] Split `packages/reporter/src/template.ts` (89KB) into:
  - [ ] `template/head.html` (head + open body)
  - [ ] `template/data-injection.js` (the `window.__SEO_AUDIT_DATA__ = ...` line)
  - [ ] `template/app.js` (the embedded React/vanilla app)
  - [ ] `template/foot.html` (close body)
- [ ] HtmlReporter streams: head → injected JSON (streamed) → app → foot
- [ ] Large reports (21MB seen in repo) no longer block event loop

### 6.3 SARIF streaming
- [ ] Same treatment for SARIF reporter — incrementally write `runs[0].results[]`

### 6.4 Tests
- [ ] Generate report for 5000pg fixture; assert peak memory during export < 100MB
- [ ] Output parity: streamed JSON parses to exact same object as buffered JSON
- [ ] Output parity: streamed HTML byte-identical to buffered HTML

---

## 7. Cross-cutting verification

### 7.1 Memory regression suite
- [ ] Add `tests/perf/memory.test.ts`:
  - [ ] Run small-site fixture → assert peak heap < threshold
  - [ ] Run medium-site → assert peak heap < threshold
  - [ ] Run large-site → assert peak heap < threshold
- [ ] Thresholds derived from §0 baseline × 0.2 (5× improvement target)

### 7.2 Speed regression suite
- [ ] Add `tests/perf/speed.test.ts`:
  - [ ] Cold + warm runs for each fixture
  - [ ] Warm run must be < 5% of cold (cache effectiveness)
  - [ ] Cold run must be < 30% of baseline (parallel + streaming + indexes)

### 7.3 Parity tests
- [ ] All findings + score byte-identical to pre-Phase-6 baseline across all three fixture sizes
- [ ] Identical even with cache enabled / disabled / partial-hit

### 7.4 Stress tests
- [ ] 10,000-page synthetic site → audit completes, doesn't OOM with default Node heap
- [ ] Mid-audit kill → restart with cache resumes correctly (no duplicate findings, no missing pages)
- [ ] 429-storm simulation → audit completes via AIMD without exhausting retry budget

### 7.5 Build/test
- [ ] `npm run build` clean
- [ ] `npm test` green (existing tests)
- [ ] `npm run test:perf` green (new perf suite)
- [ ] All CLI commands smoke-tested

---

## 8. Documentation + telemetry

### 8.1 README
- [ ] Document `.seocore-cache/` directory location, size expectations, gitignore recommendation
- [ ] Document cache CLI commands
- [ ] Document `--no-cache`, `--force-refresh`, `--legacy-buffered` flags
- [ ] Add "Performance tuning" section with `ruleConcurrency`, `cacheMaxAge`, adaptive limiter config

### 8.2 Telemetry events
Extend `EventMap` in `@seocore/sdk`:
- [ ] `page:processed` — emitted per page after stateless rules + html drop
- [ ] `cache:hit` / `cache:miss` — with URL + age
- [ ] `limiter:throttled` / `limiter:recovered` — with domain + new concurrency
- [ ] `index:built` — emitted after indexes built between stages
- [ ] `report:streaming` — chunks written during export

### 8.3 Operational guide
- [ ] Add `docs/performance.md` covering:
  - [ ] Cache sizing (entries per pg ≈ 1KB index + body gzipped)
  - [ ] Tuning `ruleConcurrency` vs CPU count
  - [ ] When to use `--no-cache` (CI cold runs, audit determinism tests)
  - [ ] When to use `--legacy-buffered` (rules that haven't been audited for streaming safety)

---

## 9. Commit / PR strategy

Six PRs, each behind its own feature flag so they can ship + revert independently:

- [ ] **PR 1**: `feat(perf): pre-computed indexes for cross-page rules (O(N²) → O(1))` (§3)
- [ ] **PR 2**: `feat(perf): parallel rule execution per page with concurrency cap` (§2)
- [ ] **PR 3**: `feat(perf): streaming pipeline — drop html after stateless rules` (§1, gated by --legacy-buffered)
- [ ] **PR 4**: `feat(crawler): persistent crawl cache with ETag/If-Modified-Since` (§4, gated by --no-cache)
- [ ] **PR 5**: `feat(crawler): adaptive concurrency with AIMD + per-domain limiters` (§5, gated by --no-adaptive)
- [ ] **PR 6**: `feat(reporter): streaming JSON/HTML/SARIF; split template into chunks` (§6)

Each PR includes the relevant section's tests (§1.5, §2.4, etc.) + parity test against baseline.

---

## Definition of Done

- [ ] Peak heap on 5000pg audit reduced ≥ 5× vs Phase-5 baseline
- [ ] Cold-run wall-clock reduced ≥ 3× vs Phase-5 baseline
- [ ] Warm-run (cached) wall-clock reduced ≥ 20× vs Phase-5 baseline
- [ ] All findings + scores byte-identical to baseline at all fixture sizes
- [ ] `DuplicateTitleRule` on 5000pg completes in < 50ms (vs minutes pre-Phase-6)
- [ ] `process.memoryUsage().rss` does not exceed 100MB during 5000pg audit
- [ ] Audit survives mid-run kill + restart via cache (no duplicate findings)
- [ ] Audit against 429-rate-limited server completes via AIMD instead of failing
- [ ] HTML report generation for 5000pg fixture uses < 100MB peak memory during export
- [ ] Multi-host crawl with one slow domain doesn't penalize fast domains
- [ ] `--legacy-buffered`, `--no-cache`, `--no-adaptive` flags all functional as escape hatches
- [ ] Cache commands (`stats`, `clear`, `invalidate`) all functional
- [ ] New telemetry events fire correctly
- [ ] Build green, all tests green (existing + new perf suite)

---

## Out of scope (deferred)

- **Phase 7+**: Distributed crawling — externalize cache to Redis, multiple workers consume same crawl queue
- **Phase 7+**: Incremental audits — "only re-audit pages whose ETag changed since last commit hash"
- **Phase 7+**: Streaming reporters to remote destinations (S3, GCS) instead of local files
- **Phase 7+**: Worker thread pool for CPU-bound rule evaluation (HTML parsing, content shingling)
- **Future**: Lighthouse parallelization (currently one chromium instance) — needs upstream Lighthouse API support

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Streaming pipeline breaks a stateful rule that wasn't correctly annotated | Medium | High | Add dev-mode assertion when rule reads `page.html` after drop; ship `--legacy-buffered` escape hatch; per-rule parity tests in §7.3 |
| Parallel rule execution exposes a non-thread-safe rule (e.g. one writing to shared global) | Medium | Medium | `isolated: true` flag; audit all rules during PR review; assertion that rule output depends only on inputs |
| Cache produces stale results when site changes faster than TTL | Medium | High | TTL configurable; `--force-refresh`; cache validates ETag/Last-Modified so detection is automatic; document trade-off |
| Cache corruption on crash mid-write | Low | High | Atomic file writes (tmp + rename); WAL pattern; cache integrity check on startup |
| Cache disk usage explodes for large sites | Medium | Medium | Gzip bodies; configurable `cacheMaxSizeBytes` with LRU eviction; `seocore cache stats` makes it visible |
| Adaptive concurrency over-throttles a healthy server due to a single 429 | Low | Medium | Tunable `decreaseOnConsecutiveErrors` threshold (default 3); per-domain isolation prevents cross-contamination |
| Index memory overhead for 5000pg site is significant | Medium | Low | Indexes only store hashes + URL refs (~100B/page × 5000 = 500KB) — small compared to dropped HTML savings |
| Streaming JSON output is unparseable mid-stream (consumer error) | Low | Medium | Stream completes a valid JSON document; partial files marked `.partial` until complete, then renamed |
| Stream pipeline ordering changes finding order in output | Low | Low | Stable sort by `id` before output; documented as guaranteed order |
| Per-domain limiter state leaks memory across audits | Low | Low | Registry scoped per `engine.run()` call, garbage-collected after |
| Content shingling false positives flag legitimate similar pages | Medium | Medium | Threshold tunable; default 0.8 conservative; existing fixture shouldn't change findings |
| Cache schema migration when upgrading | Medium | Low | Cache stores schema version; old version auto-invalidated on bump |
