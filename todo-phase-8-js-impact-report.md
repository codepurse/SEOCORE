# Phase 8 — JS Impact Report

**Goal**: add `seocore analyze js-impact <url>` (alias `seocore js-impact <url>`) that fetches a page twice — raw HTML (no JS) + fully rendered DOM (post-JS) — diffs the SEO-relevant surface, classifies impact by severity, and emits framework-aware remediation tips. Mirrors Semrush "JavaScript SEO" / "JS Impact Report" depth.

**Scope**: per-URL analysis first. Site-wide rollup deferred to Phase 8.5 (reuses crawler iteration).

**Risk**: medium-high. New rendering path = browser dependency, flaky timing, memory pressure. Mitigation:
- Reuse existing Playwright bootstrap from `LighthouseCrawler` (no second browser stack)
- Single `RenderedCrawler` shared across `js-impact`, `technology --render`, future rendered audits
- Strict timeout + `networkidle` wait gate, configurable
- Cache rendered HTML in `.seocore-cache/rendered/` (parallel to existing body cache)
- Graceful degrade: if Playwright missing → exit 2 with install hint, never silent fallback
- Diff engine is pure (raw vs rendered both as strings) → fully unit-testable without browser

**Prerequisite**: Phase 5 (Playwright as plugin), Phase 7 (`technology` command + `TechnologyDetector` for framework-aware tips). If Phase 7 ships first, tips engine reads `TechnologyContext`. If not, ship Phase 8 with generic tips and wire framework awareness later.

**Estimated diff**: ~14-18 new files across `packages/crawler`, `packages/analyzers`, `packages/cli`, `packages/reporter`. Net repo +2200 lines (analyzer heavy). No edits to existing rules.

---

## Benefits summary

### Product
- Closes biggest feature gap vs Semrush / Sitebulb / JetOctopus
- Catches SPAs that ship blank shells to Googlebot (Next.js misconfig, Vue SPA without SSR, React CSR)
- Diagnoses "page indexed but ranks for nothing" — usually content only exists post-hydration
- Detects late-injected `noindex` / canonical conflicts (deploy bugs)
- Surfaces JSON-LD injected by tag managers (rich result blockers)

### Engineering
- Reuses existing Playwright wiring (one browser pool, two consumers)
- Pure diff engine → high test coverage without browser
- Rendered cache slot piggybacks on existing FS cache layout
- Output schema reuses `Finding` shape → reporter renderers already handle it

### Differentiation
- Semrush diffs ~6 surface aspects; we ship 12 (see §1.2)
- Framework-aware fix tips (detect Next.js → suggest `getStaticProps` vs generic "use SSR")
- Confidence-tagged diffs (`certain` vs `likely-cosmetic`) reduce false alarms

---

## 0. Lock product spec before code

### 0.1 Command UX
- [ ] Add command:
  ```bash
  seocore analyze js-impact <url>
  seocore js-impact <url>           # short alias
  ```
- [ ] Options:
  - [ ] `-f, --format <terminal|json|html|markdown>` — output, default `terminal`
  - [ ] `-o, --output <path>` — export path
  - [ ] `--wait <event>` — `load|domcontentloaded|networkidle` (default `networkidle`)
  - [ ] `--wait-extra <ms>` — extra settle after wait event (default `1500`)
  - [ ] `--timeout <ms>` — total render budget (default `30000`)
  - [ ] `--user-agent <ua>` — override (default Googlebot Smartphone string)
  - [ ] `--viewport <wxh>` — default `412x823` (Pixel 5, matches Mobile Googlebot)
  - [ ] `--block <patterns>` — comma-separated request blocklist (default analytics + ads to speed up)
  - [ ] `--no-cache` — bypass rendered cache
  - [ ] `--show-diff` — include raw vs rendered text diff snippets in output
  - [ ] `--severity <level>` — filter `critical|high|medium|low`, default show all
  - [ ] `--save-snapshots <dir>` — write raw.html + rendered.html for debugging
  - [ ] `-v, --verbose` — include all evidence + timing breakdown

### 0.2 Output contract — terminal sections
Mirror Semrush headings exactly so users skim familiar:

- [ ] `JS IMPACT REPORT`
- [ ] `RENDER OVERVIEW` — fetch timings, wait strategy, framework detected, bytes raw vs rendered
- [ ] `INDEXABILITY` — robots, canonical, noindex flips
- [ ] `CONTENT PARITY` — word count delta, missing-in-raw paragraphs, hydration verdict
- [ ] `METADATA PARITY` — title, meta description, og:*, twitter:*
- [ ] `HEADINGS PARITY` — H1-H6 set diff
- [ ] `LINKS PARITY` — internal/external link count delta, links only in rendered
- [ ] `IMAGES PARITY` — `<img src>` vs lazy-loaded count, missing alts that only exist in rendered
- [ ] `STRUCTURED DATA PARITY` — JSON-LD blocks raw vs rendered
- [ ] `HREFLANG / LOCALIZATION PARITY`
- [ ] `RESOURCE BLOCKERS` — JS files referenced but blocked by robots.txt (Google can't render)
- [ ] `JS ERRORS DURING RENDER` — console errors, failed XHRs, exceptions
- [ ] `FRAMEWORK SIGNALS` — detected stack + rendering strategy guess (CSR / SSR / SSG / ISR / hybrid)
- [ ] `IMPACT SUMMARY` — counts per severity
- [ ] `OVERALL JS-SEO HEALTH SCORE (0-100)`
- [ ] `RECOMMENDATIONS` — ordered, framework-aware

### 0.3 JSON shape
- [ ] Define in `packages/sdk/src/js-impact.ts`:
  ```ts
  export interface JsImpactReport {
    url: string;
    checkedAt: string;
    render: {
      strategy: 'csr' | 'ssr' | 'ssg' | 'isr' | 'hybrid' | 'unknown';
      framework?: string;             // 'Next.js' | 'Nuxt' | 'React (CSR)' | ...
      frameworkConfidence?: number;
      waitEvent: 'load' | 'domcontentloaded' | 'networkidle';
      waitExtraMs: number;
      timings: {
        rawFetchMs: number;
        renderTotalMs: number;
        domContentLoadedMs?: number;
        loadEventMs?: number;
        networkIdleMs?: number;
      };
      bytes: { raw: number; rendered: number; deltaPct: number };
      consoleErrors: ConsoleMessage[];
      failedRequests: FailedRequest[];
    };
    diffs: JsImpactDiff[];
    blockedResources: BlockedResource[];
    score: {
      overall: number;                // 0-100
      indexability: number;
      contentParity: number;
      metadataParity: number;
      structuredDataParity: number;
      crawlability: number;
      reasoning: string[];
    };
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    recommendations: Recommendation[];
  }

  export interface JsImpactDiff {
    id: string;                       // stable hash
    aspect: JsImpactAspect;           // see §1.2
    severity: 'critical' | 'high' | 'medium' | 'low';
    confidence: 'certain' | 'likely' | 'cosmetic';
    title: string;
    description: string;
    raw?: string | number | string[];
    rendered?: string | number | string[];
    delta?: number;
    evidence: string[];
    fix?: string;                     // populated by tips engine
  }

  export type JsImpactAspect =
    | 'indexability.canonical'
    | 'indexability.metaRobots'
    | 'indexability.xRobotsTag'
    | 'content.wordCount'
    | 'content.mainTextMissing'
    | 'metadata.title'
    | 'metadata.metaDescription'
    | 'metadata.openGraph'
    | 'metadata.twitter'
    | 'headings.h1'
    | 'headings.set'
    | 'links.internal'
    | 'links.external'
    | 'links.onlyInRendered'
    | 'images.src'
    | 'images.alt'
    | 'structuredData.jsonLd'
    | 'hreflang'
    | 'jsErrors'
    | 'resourceBlocked';

  export interface ConsoleMessage { level: string; text: string; url?: string; line?: number; }
  export interface FailedRequest { url: string; method: string; status?: number; failure?: string; resourceType: string; }
  export interface BlockedResource { url: string; reason: 'robots.txt' | 'csp' | 'mixed-content' | 'cors' | 'other'; impact: 'critical' | 'high' | 'medium' | 'low'; }
  export interface Recommendation { id: string; priority: number; title: string; rationale: string; action: string; relatedAspects: JsImpactAspect[]; frameworkSpecific?: string; }
  ```

### 0.4 Scoring rubric
Doc in same file. No magic numbers in code.

- [ ] `indexability` (35% of overall): any `critical` indexability diff → 0. `high` → -40. `medium` → -15.
- [ ] `contentParity` (25%): score = `min(rawWords, renderedWords) / max(rawWords, renderedWords) * 100`. Floor 0.
- [ ] `metadataParity` (15%): % of metadata fields identical raw vs rendered.
- [ ] `structuredDataParity` (10%): JSON-LD block-count equality + type-name equality.
- [ ] `crawlability` (15%): -20 per blocked critical JS resource, -10 per failed-but-needed XHR.
- [ ] Overall = weighted sum; document weights in JSDoc.

---

## 1. Diff engine (pure, no browser) — `packages/analyzers/src/js-impact/`

Build pure first. Browser layer feeds it strings. Tests use HTML fixtures only.

### 1.1 Module layout
- [ ] `packages/analyzers/src/js-impact/index.ts` — barrel + `JsImpactAnalyzer.analyze(raw, rendered, ctx)`
- [ ] `packages/analyzers/src/js-impact/types.ts` — re-export SDK types, add internal `ParsedSurface`
- [ ] `packages/analyzers/src/js-impact/surface-extractor.ts` — turn HTML string → `ParsedSurface`
- [ ] `packages/analyzers/src/js-impact/diff-engine.ts` — `ParsedSurface × ParsedSurface → JsImpactDiff[]`
- [ ] `packages/analyzers/src/js-impact/aspect-checks/` — one file per aspect (12 files), pure functions
- [ ] `packages/analyzers/src/js-impact/scoring.ts` — pure score calculation
- [ ] `packages/analyzers/src/js-impact/tips-engine.ts` — diff[] + framework → Recommendation[]
- [ ] `packages/analyzers/src/js-impact/tips-catalog.ts` — keyed library of fix templates
- [ ] Co-locate `*.test.ts` next to each

### 1.2 Aspect checks (each = pure fn, own file)

Each check signature:
```ts
type AspectCheck = (raw: ParsedSurface, rendered: ParsedSurface, ctx: DiffContext) => JsImpactDiff[];
```

- [ ] `canonical-check.ts` — diff `<link rel="canonical">` raw vs rendered. JS-injected canonical = `critical`.
- [ ] `meta-robots-check.ts` — diff `<meta name="robots">`. `noindex` only in rendered = `critical`. `noindex` only in raw but removed by JS = `high` (Google may still see raw).
- [ ] `x-robots-tag-check.ts` — read header (passed via ctx), flag mismatch with rendered meta robots.
- [ ] `content-wordcount-check.ts` — extract visible text from both, count words via `Intl.Segmenter`. Delta >30% = `high`, >50% = `critical`. Skip nav/footer via heuristic readable-text extraction (Mozilla Readability port or simple `<main>` scope).
- [ ] `content-main-text-check.ts` — if rendered has `<main>` text >100 words but raw has <30 in same region → `critical` "main content hydrated client-side".
- [ ] `title-check.ts` — string equality. Different = `high`.
- [ ] `meta-description-check.ts` — same.
- [ ] `og-tags-check.ts` — set diff over `og:title`, `og:description`, `og:image`, `og:type`, `og:url`. Missing in raw = `medium` (social scrapers don't run JS).
- [ ] `twitter-tags-check.ts` — analogous.
- [ ] `headings-check.ts` — multiset diff H1-H6. Missing H1 in raw but present in rendered = `high`.
- [ ] `links-check.ts` — extract `<a href>` from both. Compute:
  - Count delta
  - URLs only-in-rendered (likely JS-router links → Google may not crawl)
  - URLs only-in-raw (rare; flag as `low`)
  - JS-only links flagged `medium` unless they are paginated/critical-nav → bumped `high` if matches sitemap pattern
- [ ] `images-check.ts` — `<img>` src + alt diff. Lazy-loaded (`data-src` without `src`) flagged. Missing alts present in rendered = `medium`.
- [ ] `structured-data-check.ts` — extract all `<script type="application/ld+json">` from each. Parse, normalize, compare by `@type` set + count. JSON-LD only in rendered = `high` (rich results may still work but fragile).
- [ ] `hreflang-check.ts` — diff `<link rel="alternate" hreflang>` entries.
- [ ] `js-errors-check.ts` — converts ConsoleMessage[] + FailedRequest[] into diffs. Uncaught exception during render = `high`.
- [ ] `resource-blocked-check.ts` — list blocked resources from render trace + robots.txt cross-check (need robots fetch).

### 1.3 Surface extractor
- [ ] `surface-extractor.ts` uses `cheerio` (already a dep). Extract:
  ```ts
  interface ParsedSurface {
    title: string | null;
    metaDescription: string | null;
    metaRobots: string | null;
    canonical: string | null;
    openGraph: Record<string, string>;
    twitter: Record<string, string>;
    headings: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] };
    links: { internal: LinkInfo[]; external: LinkInfo[] };
    images: ImageInfo[];
    jsonLd: unknown[];           // parsed
    jsonLdRaw: string[];         // raw text for diff
    hreflang: { hreflang: string; href: string }[];
    visibleText: string;         // readable-text extraction
    wordCount: number;
    bytes: number;
  }
  ```
- [ ] Implement readable-text extraction:
  - Option A: port [Mozilla Readability](https://github.com/mozilla/readability) (pure JS, ~1500 lines)
  - Option B (start here): scope to `<main>`, else `<article>`, else `<body>` minus `nav,footer,header,aside,script,style,noscript,.menu,.nav,.footer,.header`
  - [ ] Add unit tests against fixtures with known visible text

### 1.4 Diff engine orchestration
- [ ] `diff-engine.ts` runs all aspect checks in order, returns merged `JsImpactDiff[]`
- [ ] Each diff gets stable id = `sha256(aspect + url + JSON.stringify({raw, rendered})).slice(0,16)`
- [ ] Sort: critical → high → medium → low, then by aspect canonical order
- [ ] Cap evidence array length to 5 per diff (truncate with `+N more`)

### 1.5 Unit tests (must precede browser work)
- [ ] `tests/fixtures/js-impact/`
  - [ ] `csr-spa/raw.html` — React shell with `<div id="root"></div>`
  - [ ] `csr-spa/rendered.html` — same shell with hydrated content
  - [ ] `ssr-clean/raw.html` + `rendered.html` — identical surface
  - [ ] `late-noindex/raw.html` + `rendered.html` — robots flip
  - [ ] `tag-manager-jsonld/raw.html` + `rendered.html` — JSON-LD only in rendered
  - [ ] `lazy-images/raw.html` + `rendered.html`
  - [ ] `hreflang-injected/raw.html` + `rendered.html`
- [ ] One vitest per aspect-check + one integration test per fixture
- [ ] Snapshot the full `JsImpactReport` JSON for each fixture
- [ ] Target coverage ≥ 90% lines for `js-impact/` module

---

## 2. RenderedCrawler — browser layer in `packages/crawler/src/`

### 2.1 Reuse Playwright bootstrap
- [ ] Extract shared browser pool from `LighthouseCrawler` into `packages/crawler/src/browser/pool.ts`:
  - [ ] `class BrowserPool { acquire(): Promise<Browser>; release(browser); shutdown(); }`
  - [ ] Singleton per process, ref-counted
  - [ ] Lazy launch on first acquire
  - [ ] Reuse single browser, fresh `context` per page
- [ ] Refactor `LighthouseCrawler` to consume `BrowserPool` (no behaviour change — verify with existing parity test)

### 2.2 `RenderedCrawler`
- [ ] New file `packages/crawler/src/rendered-crawler.ts`:
  ```ts
  export interface RenderedFetchResult {
    url: string;
    finalUrl: string;
    rawHtml: string;
    renderedHtml: string;
    statusCode: number;
    rawHeaders: Record<string, string>;
    bytes: { raw: number; rendered: number };
    timings: RenderTimings;
    consoleMessages: ConsoleMessage[];
    failedRequests: FailedRequest[];
    blockedRequests: BlockedRequest[];
    redirectChain: RedirectHop[];
  }

  export interface RenderedCrawlOptions {
    userAgent?: string;
    viewport?: { width: number; height: number };
    waitEvent?: 'load' | 'domcontentloaded' | 'networkidle';
    waitExtraMs?: number;
    timeoutMs?: number;
    blockPatterns?: string[];           // request URLs to abort
    extraHttpHeaders?: Record<string, string>;
  }

  export class RenderedCrawler {
    static async isAvailable(): Promise<boolean>;            // checks Playwright
    constructor(private pool: BrowserPool, private cache?: RenderedCache);
    async fetch(url: string, opts: RenderedCrawlOptions): Promise<RenderedFetchResult>;
  }
  ```
- [ ] Implementation steps:
  - [ ] Raw fetch via existing `HttpCrawler` first (cheap, parallel)
  - [ ] Browser context with Googlebot Smartphone UA default
  - [ ] Hook `page.on('console')`, `page.on('requestfailed')`, `page.on('response')`
  - [ ] Block patterns via `page.route(pattern, route => route.abort())`
  - [ ] Navigate with `waitUntil: opts.waitEvent`, then `page.waitForTimeout(opts.waitExtraMs)`
  - [ ] Capture `await page.content()` as rendered HTML
  - [ ] Capture timings from `page.evaluate(() => performance.timing)` + `performance.getEntriesByType('navigation')`
  - [ ] On timeout: still return what we have, mark `partial: true`
  - [ ] Always close context, never browser
- [ ] Hard limits:
  - [ ] Max rendered HTML size 5 MB (truncate + warn)
  - [ ] Total network bytes cap 10 MB per page (abort further requests via route)
  - [ ] Memory check after each render; if >1 GB heap, recycle browser

### 2.3 Rendered cache
- [ ] New file `packages/crawler/src/cache/rendered-cache.ts` parallel to existing `FilesystemCrawlCache`
- [ ] Layout: `.seocore-cache/rendered/<sha256(url + uaHash + viewportHash + waitEvent)>.json.gz`
- [ ] Stores: `RenderedFetchResult` minus binary fields, gzip JSON
- [ ] TTL default 24h, configurable via `SeoConfig.cache.renderedTtlMs`
- [ ] Index file `.seocore-cache/rendered-index.json` listing entries
- [ ] `--no-cache` bypasses read + write

### 2.4 Tests
- [ ] Stub Playwright with a fake `Page` for unit tests (no real browser in CI's default suite)
- [ ] Add `tests/e2e/rendered-crawler.spec.ts` gated behind `SEOCORE_E2E=1` envvar (run real Playwright against fixtures served by `serve`)
- [ ] Fixture site: a tiny Vite SPA in `tests/fixtures/js-impact/spa-fixture/` that ships empty body + hydrates content

---

## 3. Framework-aware tips engine

### 3.1 Tips catalog
- [ ] `packages/analyzers/src/js-impact/tips-catalog.ts` — Map<`JsImpactAspect`, TipTemplate[]>:
  ```ts
  interface TipTemplate {
    id: string;
    matchAspects: JsImpactAspect[];
    matchFrameworks?: string[];        // e.g. ['Next.js', 'Nuxt']
    matchRenderStrategy?: ('csr' | 'ssr' | 'ssg')[];
    priority: number;
    title: string;
    rationale: string;
    action: string;                    // 1-2 sentence imperative
    docsUrl?: string;
  }
  ```
- [ ] Seed catalog (minimum 30 templates) covering:
  - [ ] Next.js: `getServerSideProps`, `getStaticProps`, `next/head`, App Router metadata API, dynamic rendering
  - [ ] Nuxt: `useSeoMeta`, `definePageMeta`, Nitro SSR
  - [ ] Vue SPA: migrate to Nuxt or add prerendering
  - [ ] React SPA: migrate to Next/Remix, or `react-snap` prerender, or dynamic rendering
  - [ ] Angular: Angular Universal SSR
  - [ ] SvelteKit: SSR by default, check `ssr=false` route flag
  - [ ] WordPress + heavy JS theme: server-render meta, defer JS
  - [ ] Shopify: theme.liquid renders meta server-side, check JS-injected canonicals
  - [ ] Generic: prerender.io, rendertron, dynamic rendering for bots
- [ ] Each tip has docs link

### 3.2 Tips engine logic
- [ ] `tips-engine.ts`:
  ```ts
  export function buildRecommendations(
    diffs: JsImpactDiff[],
    framework: { name?: string; strategy?: RenderStrategy } | undefined,
    catalog: TipTemplate[],
  ): Recommendation[];
  ```
- [ ] Algorithm:
  1. Collect aspects present in diffs (severity ≥ medium)
  2. For each aspect, pick best template: prefer (framework match + strategy match) > framework match > generic
  3. De-dup tips by `id`
  4. Order by `severity × priority` desc
  5. Cap top 10 to avoid wall-of-text
- [ ] Attach top tip to each diff's `fix` field too for inline display

### 3.3 Framework detection bridge
- [ ] If Phase 7 ships: import `TechnologyDetector` from `@seocore/analyzers`, run against raw + rendered HTML, take highest-confidence frontend framework
- [ ] If Phase 7 not ready: inline a thin detector in `js-impact/framework-detector.ts` that recognizes Next.js (`__NEXT_DATA__`), Nuxt (`__NUXT__`), React (root + chunked JS), Vue (`__vue__`), Angular (`ng-version`), SvelteKit (`__sveltekit_*`)
- [ ] Strategy inference: SSR if raw has full content ∧ framework detected; CSR if raw empty ∧ framework detected; SSG if HTML has hash-named assets ∧ no `__NEXT_DATA__.runtime`; hybrid if mixed

---

## 4. CLI wiring

### 4.1 Command file
- [ ] `packages/cli/src/commands/analyze/js-impact.ts`:
  - [ ] Reuse `packages/cli/src/shared/options.ts` patterns
  - [ ] Validate URL via shared validator
  - [ ] Build config via `config-builder`
  - [ ] Acquire `BrowserPool`, instantiate `RenderedCrawler`
  - [ ] Run analyzer → `JsImpactReport`
  - [ ] Hand off to reporter
- [ ] Register in `packages/cli/src/commands/analyze/index.ts`
- [ ] Add top-level alias in `packages/cli/src/commands/legacy-aliases.ts`: `seocore js-impact` → `seocore analyze js-impact`

### 4.2 Spinner + event handlers
- [ ] Reuse `packages/cli/src/shared/spinner.ts`
- [ ] Stages: `fetching raw…` → `launching browser…` → `rendering page…` → `diffing surface…` → `building report…`
- [ ] Print "Playwright not installed. Run: npx playwright install chromium" if `RenderedCrawler.isAvailable()` false → exit 2

### 4.3 Help text
- [ ] Examples in help:
  ```bash
  seocore js-impact https://example.com
  seocore js-impact https://example.com --wait networkidle --wait-extra 3000
  seocore js-impact https://example.com --format json -o report.json
  seocore js-impact https://example.com --save-snapshots ./debug
  ```

---

## 5. Reporter

### 5.1 Terminal renderer
- [ ] `packages/reporter/src/js-impact/terminal.ts`
- [ ] Match section order from §0.2. Use existing `chalk`/`kleur` style.
- [ ] Per-diff line: `[SEV] aspect — title  (confidence)`. Indent evidence + raw vs rendered snippet.
- [ ] Truncate raw/rendered snippets to 200 chars unless `--verbose`.
- [ ] Footer: score bar (gradient ASCII) + summary counts.

### 5.2 JSON renderer
- [ ] Already implicit from `JsImpactReport` schema. Just `JSON.stringify(report, null, 2)`.

### 5.3 HTML renderer
- [ ] `packages/reporter/src/js-impact/html.ts` reusing existing reporter shell (style from `seocore-images-report.html`)
- [ ] Sections collapsible
- [ ] Side-by-side raw vs rendered diff using a lightweight diff lib (`diff` package, MIT, already lean) — only for content/headings/links sections
- [ ] Color-coded severity badges
- [ ] Top 10 recommendations as cards

### 5.4 Markdown renderer
- [ ] `packages/reporter/src/js-impact/markdown.ts` — friendly for PR comments & CI annotations
- [ ] Use GitHub-flavored task-list checkboxes per recommendation

---

## 6. SDK exports
- [ ] `packages/sdk/src/index.ts` re-exports `JsImpactReport`, `JsImpactDiff`, `JsImpactAspect`, `Recommendation`, `RenderedFetchResult`, `RenderedCrawlOptions`
- [ ] Add programmatic API:
  ```ts
  import { analyzeJsImpact } from '@seocore/sdk';
  const report = await analyzeJsImpact('https://example.com', { wait: 'networkidle' });
  ```
- [ ] Document in README under "Programmatic Usage"

---

## 7. Config schema
- [ ] Extend `SeoConfig` in `packages/config/src/index.ts`:
  ```ts
  jsImpact?: {
    waitEvent?: 'load' | 'domcontentloaded' | 'networkidle';
    waitExtraMs?: number;
    timeoutMs?: number;
    userAgent?: string;
    viewport?: { width: number; height: number };
    blockPatterns?: string[];
    cache?: { enabled?: boolean; ttlMs?: number };
    wordCountDeltaThresholds?: { high: number; critical: number };
  };
  ```
- [ ] Defaults in `packages/config/src/defaults.ts`
- [ ] Validate via Zod
- [ ] `seocore config show` surfaces these
- [ ] `seocore config init` includes commented block

---

## 8. Edge cases — must handle explicitly

- [ ] **Redirect chains**: raw fetch follows redirects, rendered fetch lands on final URL. Diff `url` vs `finalUrl`; warn if mismatch (canonical implication).
- [ ] **Single-page apps with hash routes**: `#/path` — render still works, document that param-based routes need explicit URL each.
- [ ] **Sites that block headless browsers**: detect Cloudflare challenge HTML in rendered → emit `critical` `crawlability` diff + tip to allowlist
- [ ] **Pages requiring auth**: out of scope V1; document. Add `--cookie <kv>` in V2.
- [ ] **Sites with anti-bot UA sniffing**: provide `--user-agent` override; default to Googlebot Smartphone string
- [ ] **Infinite scroll**: don't try to trigger; document limitation. Optional `--scroll` flag deferred to V2.
- [ ] **404s and 5xx**: raw status mismatch with rendered status (after JS-driven redirect) = `high` diff
- [ ] **JS-driven 404 pages** (200 status, but content says "Not Found"): heuristic check on rendered visible text against known patterns → `high` diff
- [ ] **CSP blocking analyzer scripts**: log to `failedRequests`, don't crash
- [ ] **Self-signed certs**: respect existing config `ignoreSslErrors`; pass through to Playwright context
- [ ] **HTTP/2 push or service workers caching stale**: document; not auto-detected V1
- [ ] **Charset mismatches**: raw might be `gbk`, rendered always utf-8 → normalize both to utf-8 before diff
- [ ] **HTML-encoded entities**: decode both before string compare
- [ ] **Whitespace-only differences**: collapse whitespace before equality checks
- [ ] **Same-origin iframes**: don't recurse V1; emit `low` info diff if iframe present and contains text

---

## 9. Performance budget

Render path is expensive. Stay within these limits.

- [ ] Per-URL budget default 30s total
- [ ] Browser pool max 2 contexts simultaneously by default (override via `--concurrency`)
- [ ] Block analytics/ads/social pixels by default → typical 40-60% network bytes saved:
  ```
  google-analytics.com, googletagmanager.com, doubleclick.net, facebook.com/tr,
  hotjar.com, segment.io, mixpanel.com, intercom.io, drift.com,
  *.gif?utm_*, *.png?_ga_*
  ```
- [ ] Disable images at the network layer if `--block-images` flag set (faster for diff-only runs, default OFF since image diff is a feature)
- [ ] Cache hit path: skip browser entirely, return cached `RenderedFetchResult` → run diff engine on cached strings

---

## 10. Test plan

### 10.1 Unit (vitest, no browser)
- [ ] Coverage ≥ 90% on `js-impact/` module
- [ ] Coverage ≥ 80% on `rendered-crawler.ts` (mock Playwright)
- [ ] Property tests on diff engine: idempotent (same input → same output), commutative aspects (order of aspect checks doesn't affect final report).

### 10.2 Integration (gated by `SEOCORE_E2E=1`)
- [ ] Static fixture: `tests/fixtures/js-impact/static-fixture/` served via `serve` on random port
- [ ] SPA fixture: tiny Vite app that hydrates after 500ms — must produce `critical` content diff
- [ ] Late-noindex fixture: meta robots injected after 1s — must produce `critical` indexability diff
- [ ] Run all `--format` outputs and assert structural validity (HTML parses, JSON validates against Zod schema, markdown lints)

### 10.3 Snapshot
- [ ] Per-fixture full JSON snapshot in `tests/snapshots/js-impact/*.json`
- [ ] Snapshot review on PR

### 10.4 Manual smoke list (run before tagging release)
- [ ] `https://nextjs.org` — expect SSR clean
- [ ] `https://create-react-app.dev` — variable
- [ ] Known CSR demo (e.g. `https://reactjs.org` historical) — expect content diff
- [ ] WordPress blog with TagManager-injected schema — expect structured-data diff
- [ ] E-commerce SPA — expect link diff

---

## 11. Docs

- [ ] README section "JS Impact Report" with:
  - [ ] Why it matters (2 paragraphs)
  - [ ] Command examples
  - [ ] Output sample (truncated terminal)
  - [ ] Limitations list (auth, infinite scroll, etc.)
- [ ] `docs/js-impact.md` deeper guide:
  - [ ] How rendering works
  - [ ] Severity rubric
  - [ ] Per-aspect explainers (1 paragraph each)
  - [ ] FAQ: "Why does Semrush say X but you say Y" — explain methodology differences
  - [ ] Troubleshooting (Playwright install, timeouts, anti-bot)
- [ ] CHANGELOG entry under next minor version

---

## 12. Rollout

- [ ] Land behind feature flag for one release: `SEOCORE_FEATURE_JS_IMPACT=1`
- [ ] After 2 weeks of dogfooding, remove flag, document in release notes
- [ ] Telemetry (if/when added): event `js_impact.run` with `{ durationMs, score, criticalCount, framework }`

---

## 13. Atomic PR plan (mirrors Phase 3 / Phase 7 style)

Each PR is independently mergeable + revertable.

- [ ] **PR1** — SDK types: `JsImpactReport`, `JsImpactDiff`, `JsImpactAspect`, `Recommendation` + zod schema + tests. No behaviour change. (≈300 lines)
- [ ] **PR2** — Surface extractor + ParsedSurface + readable-text. Pure, fully tested. (≈500 lines)
- [ ] **PR3** — Aspect checks (12 files) + diff engine + scoring. Pure, fully tested with HTML fixtures. (≈1200 lines)
- [ ] **PR4** — Tips catalog + tips engine + framework-detector bridge. Pure, fully tested. (≈400 lines)
- [ ] **PR5** — `BrowserPool` extraction from `LighthouseCrawler`, no behaviour change. (≈250 lines)
- [ ] **PR6** — `RenderedCrawler` + rendered cache + Playwright stubs in tests. (≈600 lines)
- [ ] **PR7** — CLI command + spinner + event handlers + legacy alias. (≈250 lines)
- [ ] **PR8** — Terminal + JSON reporters. (≈300 lines)
- [ ] **PR9** — HTML + Markdown reporters. (≈400 lines)
- [ ] **PR10** — Config schema additions + `seocore config` integration. (≈150 lines)
- [ ] **PR11** — Docs (README + `docs/js-impact.md`) + CHANGELOG. (≈400 lines)
- [ ] **PR12** — E2E test suite gated by env var, removes feature flag, release candidate. (≈300 lines)

Sequence: PR1 → PR2 → PR3 → PR4 (analyzer side ready) → PR5 → PR6 (browser side ready) → PR7-PR9 (UX surface) → PR10 → PR11 → PR12.

PR1-PR4 are mergeable without any browser dep; they ship as a pure library usable from anywhere.

---

## 14. Success criteria (end of phase)

- [ ] `seocore js-impact <url>` works end-to-end on:
  - [ ] SSR site → clean report, score ≥ 90
  - [ ] CSR SPA → critical content diff, score ≤ 40, framework-specific tip emitted
  - [ ] Late-injected `noindex` → critical indexability diff
- [ ] Output sections match §0.2 exactly
- [ ] Diff engine 100% pure (zero browser imports), runs offline in CI
- [ ] `RenderedCrawler` reuses `BrowserPool`; no second Playwright instance
- [ ] Cache hit re-run completes in ≤ 1 s (vs ≥ 5 s cold)
- [ ] No regression in existing audits (snapshot parity from prior phases holds)
- [ ] README + docs published
- [ ] CHANGELOG mentions Semrush parity + extra aspects
- [ ] ≥ 90% line coverage on `js-impact/` package
- [ ] One real-world Cloudflare-protected site tested manually
