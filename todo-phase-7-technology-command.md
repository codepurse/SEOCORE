# Phase 7 — `technology` Command

**Goal**: add top-level command `seocore technology <url>` that detects SEO-relevant website technology with evidence, explains SEO/performance/AI-visibility impact, and outputs structured report without unsupported guesses.

**Scope**: landing-page analysis first. High-confidence detection only. If evidence weak or absent, output `unknown`.

**Risk**: medium. Biggest failure mode = false positives from weak signatures. Mitigation:
- Evidence-based signature registry only
- Confidence threshold before emitting technology
- Prefer specific framework over generic parent (`Next.js` over `React`)
- `unknown` fallback for backend/hosting when not directly observable
- Optional rendered pass later, not required for MVP

**Assumption**: command stays top-level as requested, not nested under `analyze`.

**Estimated diff**: ~8-12 new files across `packages/cli` and `packages/analyzers`, plus tests and README updates.

---

## Success criteria

- [ ] `seocore technology https://example.com` works end-to-end
- [ ] Output includes:
  - [ ] `TECH STACK SUMMARY`
  - [ ] `SEO IMPACT ANALYSIS`
  - [ ] `OVERALL SEO TECH SCORE (0-100)`
  - [ ] `AI VISIBILITY IMPACT`
- [ ] Unsupported stack not guessed
- [ ] Unknown components explicitly shown as `unknown`
- [ ] JSON export stable enough for CI / downstream tooling
- [ ] README includes examples and caveats

---

## 0. Lock product spec before code

### 0.1 Command UX
- [ ] Add new top-level command:
  ```bash
  seocore technology <url>
  ```
- [ ] Add options:
  - [ ] `--json` - raw JSON stdout
  - [ ] `-f, --format <terminal|json|html>` - output format, default `terminal`
  - [ ] `-o, --output <path>` - export path
  - [ ] `-v, --verbose` - show evidence lines and confidence
  - [ ] `--render` - optional future flag for Playwright-enhanced detection; can stub now or defer

### 0.2 Output contract
- [ ] Define terminal sections exactly:
  - [ ] `TECH STACK SUMMARY:`
  - [ ] `SEO IMPACT ANALYSIS:`
  - [ ] `OVERALL SEO TECH SCORE (0-100):`
  - [ ] `AI VISIBILITY IMPACT:`
- [ ] Define JSON shape:
  ```ts
  interface TechnologyAnalysisResult {
    url: string;
    checkedAt: string;
    summary: {
      frontend: DetectedTechnology[];
      backend: DetectedTechnology[];
      cms: DetectedTechnology[];
      hostingOrCdn: DetectedTechnology[];
      seoTools: DetectedTechnology[];
      unknown: string[];
    };
    impacts: TechnologyImpactEntry[];
    score: {
      overall: number;
      renderingQuality: number;
      crawlability: number;
      performance: number;
      reasoning: string[];
    };
    aiVisibility: {
      level: 'high' | 'medium' | 'low';
      reasoning: string[];
    };
  }
  ```

### 0.3 Detection contract
- [ ] Define `DetectedTechnology`:
  ```ts
  interface DetectedTechnology {
    name: string;
    category: 'frontend' | 'backend' | 'cms' | 'hostingOrCdn' | 'seoTool';
    confidence: 'high' | 'medium';
    evidence: string[];
  }
  ```
- [ ] No `low` confidence output in MVP. Weak signal = do not emit.
- [ ] Every emitted technology must have at least one evidence string.

---

## 1. Build detector core in `packages/analyzers`

### 1.1 New files
- [ ] Create `packages/analyzers/src/technology-signatures.ts`
- [ ] Create `packages/analyzers/src/technology-detector.ts`
- [ ] Export detector from `packages/analyzers/src/index.ts`

### 1.2 Input sources
- [ ] Reuse `HttpCrawler` result:
  - [ ] response headers
  - [ ] final URL after redirects
  - [ ] raw HTML / normalized HTML
- [ ] Reuse `PageNormalizer` for parsed HTML surface
- [ ] Inspect only SEO-relevant signals:
  - [ ] response headers (`server`, `x-powered-by`, `cf-ray`, `x-vercel-id`, etc.)
  - [ ] script `src`
  - [ ] stylesheet / asset URLs
  - [ ] HTML ids / globals / inline markers
  - [ ] `<meta name="generator">`
  - [ ] known path fragments (`/_next/`, `/_nuxt/`, `/wp-content/`, `/cdn-cgi/`)

### 1.3 Signature registry
- [ ] Implement weighted signatures. Example shape:
  ```ts
  interface TechSignature {
    technology: string;
    category: 'frontend' | 'backend' | 'cms' | 'hostingOrCdn' | 'seoTool';
    implies?: string[];
    excludes?: string[];
    match(page: NormalizedPage): string[];
  }
  ```
- [ ] Add high-confidence signatures first:
  - [ ] `Next.js` - `__NEXT_DATA__`, `/_next/static/`, `x-powered-by: Next.js`
  - [ ] `Nuxt` - `__NUXT__`, `/_nuxt/`, `id="__nuxt"`
  - [ ] `React` - React-specific DOM markers only when stronger framework absent
  - [ ] `Vue` - Vue-specific markers only when stronger framework absent
  - [ ] `WordPress` - `wp-content`, `wp-includes`, generator meta
  - [ ] `Webflow` - `webflow.js`, `data-wf-page`, `data-wf-site`
  - [ ] `Shopify` - `cdn.shopify.com`, `Shopify.theme`, `shopify-section`
  - [ ] `Cloudflare` - `cf-ray`, `server: cloudflare`, `/cdn-cgi/`
  - [ ] `Vercel` - `x-vercel-id`, `server: Vercel`
  - [ ] `PHP` - `x-powered-by: PHP`, `server` markers
  - [ ] `Express` / `Node.js` - `x-powered-by: Express`
  - [ ] `ASP.NET` - `x-powered-by: ASP.NET`
  - [ ] `Google Tag Manager` - `googletagmanager.com/gtm.js`
  - [ ] `Google Analytics` - `gtag/js`, `google-analytics.com`
  - [ ] `Microsoft Clarity` - `clarity.ms`
- [ ] Keep backend detection strict. If no direct header marker, backend = `unknown`.

### 1.4 Conflict resolution
- [ ] Prefer more specific stack markers:
  - [ ] `Next.js` suppresses generic `React`
  - [ ] `Nuxt` suppresses generic `Vue`
  - [ ] `Shopify` may occupy both `cms` and storefront platform role; decide one canonical category for MVP
- [ ] Deduplicate duplicate evidence lines
- [ ] Sort output by category, then confidence, then name

### 1.5 Confidence rules
- [ ] `high` confidence:
  - [ ] direct framework global or unique asset path
  - [ ] authoritative response header
  - [ ] generator meta exact match
- [ ] `medium` confidence:
  - [ ] 2+ weaker corroborating signals
- [ ] Below medium:
  - [ ] suppress technology
  - [ ] preserve as internal debug evidence only for verbose mode if useful

---

## 2. Add SEO impact knowledge layer

### 2.1 Impact mapper
- [ ] Create `packages/analyzers/src/technology-impact.ts`
- [ ] For each supported major technology, define short explanations for:
  - [ ] SEO impact
  - [ ] performance impact
  - [ ] AI visibility impact

### 2.2 Keep explanations honest
- [ ] Write capability-based language, not blanket claims
- [ ] Example:
  - [ ] `Next.js` -> "supports SSR/SSG, which usually improves crawlability and extraction, but heavy hydration can still hurt CWV"
  - [ ] `React` -> "if deployed as CSR-only, content extraction can degrade; static HTML or SSR mitigates this"
  - [ ] `Cloudflare` -> "can improve latency/caching, but misconfigured bot protection can block crawlers"
- [ ] If technology detected but SEO implication depends on deployment mode, say so explicitly

### 2.3 Impact entry shape
- [ ] Define:
  ```ts
  interface TechnologyImpactEntry {
    technology: string;
    category: string;
    seoImpact: string[];
    performanceImpact: string[];
    aiVisibilityImpact: string[];
  }
  ```

---

## 3. Add scoring model

### 3.1 Rendering classification
- [ ] Derive rendering profile from evidence:
  - [ ] `server-rendered`
  - [ ] `hybrid`
  - [ ] `client-rendered`
  - [ ] `unknown`
- [ ] Suggested heuristics:
  - [ ] `Next.js` / `Nuxt` without obvious SPA-only shell -> `hybrid`
  - [ ] generic React/Vue shell with thin HTML body -> `client-rendered`
  - [ ] WordPress/Webflow/static HTML with rich body content -> `server-rendered`
  - [ ] conflicting or weak evidence -> `unknown`

### 3.2 Score formula
- [ ] Compute subscores:
  - [ ] `renderingQuality` (0-40)
  - [ ] `crawlability` (0-30)
  - [ ] `performance` (0-30)
- [ ] Compute `overall = renderingQuality + crawlability + performance`
- [ ] Start with deterministic rubric:
  - [ ] SSR/SSG/hybrid positive
  - [ ] obvious CSR penalty
  - [ ] CDN positive
  - [ ] heavy analytics stack small penalty
  - [ ] unknown stack neutral, not punitive

### 3.3 AI visibility classification
- [ ] Map stack profile to:
  - [ ] `high` - server-rendered or strong hybrid with crawl-friendly output
  - [ ] `medium` - mixed stack, some JS dependence, unclear rendering
  - [ ] `low` - likely CSR shell or bot-hostile stack markers
- [ ] Always include reasoning bullets tied to observed evidence

### 3.4 Guardrails
- [ ] Score reasoning must cite observed tech, not imagined infra
- [ ] Unknown backend must not reduce score by itself
- [ ] CMS alone must not guarantee good SEO score

---

## 4. Wire CLI command

### 4.1 Command file
- [ ] Create `packages/cli/src/commands/technology.ts`
- [ ] Follow top-level command style used by:
  - [ ] `packages/cli/src/commands/images.ts`
  - [ ] `packages/cli/src/commands/compare.ts`
- [ ] Validate URL via shared helper

### 4.2 Runtime files
- [ ] Create `packages/cli/src/technology/index.ts`
- [ ] Create `packages/cli/src/technology/reporter.ts`
- [ ] Optional: `packages/cli/src/technology/types.ts`

### 4.3 CLI registration
- [ ] Update `packages/cli/src/index.ts`:
  - [ ] import technology command
  - [ ] `program.addCommand(technologyCommand())`

### 4.4 Reporter behavior
- [ ] Terminal output:
  - [ ] concise stack summary list
  - [ ] per-technology SEO/perf/AI bullets
  - [ ] overall score with color
  - [ ] AI visibility level + reasoning
  - [ ] verbose mode shows evidence lines
- [ ] JSON output:
  - [ ] machine-readable exact schema
- [ ] HTML output:
  - [ ] lightweight single-page report, same shape as JSON sections

---

## 5. Tests

### 5.1 Unit tests for signatures
- [ ] Create `packages/analyzers/src/technology-detector.test.ts`
- [ ] Add fixture HTML snippets for:
  - [ ] Next.js
  - [ ] Nuxt
  - [ ] WordPress
  - [ ] Webflow
  - [ ] Shopify
  - [ ] static HTML with GTM/GA only
  - [ ] plain unknown site
- [ ] Assert:
  - [ ] specific framework suppresses generic parent
  - [ ] weak single signal does not emit false positive
  - [ ] backend remains `unknown` when unsupported

### 5.2 Scoring tests
- [ ] Create `packages/analyzers/src/technology-impact.test.ts`
- [ ] Assert:
  - [ ] CSR-only React scores lower than SSR-like stack
  - [ ] CDN improves performance subscore modestly
  - [ ] analytics scripts do not overwhelm score
  - [ ] unknown stack remains neutral, not broken

### 5.3 CLI integration tests
- [ ] Add command-level tests if harness exists
- [ ] Otherwise add focused smoke script coverage:
  - [ ] `npm run cli -- technology https://example.com --json`
  - [ ] validate JSON schema keys

---

## 6. Documentation

### 6.1 README
- [ ] Add `technology` to command list in `README.md`
- [ ] Add usage examples:
  ```bash
  seocore technology https://example.com
  seocore technology https://example.com --json
  seocore technology https://example.com --format html --output ./technology-report.html
  ```
- [ ] Add caveat block:
  - [ ] detections are evidence-based
  - [ ] backend/hosting may remain unknown
  - [ ] JS-rendered apps may need future `--render` mode for deeper certainty

### 6.2 Sample output
- [ ] Document sample terminal output with:
  - [ ] stack list
  - [ ] impact bullets
  - [ ] score
  - [ ] AI visibility classification

---

## 7. Suggested implementation order

- [ ] Step 1: lock types + result schema
- [ ] Step 2: implement signature registry with 8-10 high-confidence technologies only
- [ ] Step 3: implement impact mapper + scoring
- [ ] Step 4: add CLI command + terminal/JSON reporter
- [ ] Step 5: add tests for false-positive prevention
- [ ] Step 6: add HTML export
- [ ] Step 7: update README

---

## 8. MVP cut line

Ship MVP when all below true:
- [ ] Detects `Next.js`, `Nuxt`, `WordPress`, `Webflow`, `Shopify`, `Cloudflare`, `Vercel`, `PHP`, `Express`, `Google Tag Manager`, `Google Analytics`
- [ ] Emits `unknown` for unsupported backend/hosting
- [ ] Terminal + JSON output complete
- [ ] Score + AI visibility reasoning deterministic
- [ ] Tests cover false-positive guardrails

Defer until after MVP:
- [ ] Playwright-powered `--render`
- [ ] More stacks (`Astro`, `SvelteKit`, `Drupal`, `Magento`, `HubSpot`, `Wix`)
- [ ] Multi-page crawl aggregation
- [ ] Live performance probes tied to actual resource waterfall
- [ ] Historical comparison mode

---

## 9. Open decisions

- [ ] Keep `technology` top-level or move under `analyze` for taxonomy consistency?
- [ ] Treat `Shopify` as `cms`, `frontend`, or special commerce platform bucket?
- [ ] Add confidence to default terminal output or hide behind `--verbose`?
- [ ] Implement `--render` now or keep backlog-only to reduce scope?
- [ ] Keep scoring purely tech-based, or blend in actual HTML richness heuristics from normalized page?
