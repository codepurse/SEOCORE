# `seocore images <url>` — Image Audit Command

**Goal**: dedicated CLI command to audit page/site images for SEO + performance issues (weight, format, delivery, CLS risk, lazy loading, LCP, alt text, responsive variants, caching).
**Risk**: low. New command, no existing surface modified. Reuses crawler + rules.
**Estimated diff**: ~1,400 lines added across new `packages/cli/src/images/` folder + 1 dep (`sharp`).

---

## 0. Pre-flight

- [ ] Confirm `packages/rules/src/index.ts` exports `MissingAltTextRule` and image-related rules
- [ ] Confirm `packages/crawler/src/index.ts` exposes a usable crawl API for site-wide mode
- [ ] Confirm `packages/cli/src/screenshot.ts` Playwright bootstrap is reusable (browser launch, viewport, timeouts)
- [ ] Confirm `packages/cli/src/content/reporter.ts` HTML reporter style is the target template
- [ ] Decide LCP detection strategy fallback when `--playwright` off (skip rule vs warn)

---

## 1. Scaffold command

### 1.1 Folder + files
- [ ] Create `packages/cli/src/images/` folder
- [ ] Create `packages/cli/src/images/index.ts` — command entry, flag parsing, orchestration
- [ ] Create `packages/cli/src/images/types.ts` — shared interfaces (`ImageAuditResult`, `ImageFinding`, `ImageRecord`, `ImageRuleContext`)
- [ ] Create `packages/cli/src/images/fetcher.ts` — parallel HEAD/GET with concurrency cap
- [ ] Create `packages/cli/src/images/decoder.ts` — `sharp` wrapper (dimensions, format, est. quality, animated flag)
- [ ] Create `packages/cli/src/images/analyzer.ts` — runs each rule against `ImageRecord[]`, aggregates findings
- [ ] Create `packages/cli/src/images/reporter.ts` — JSON + HTML output writers
- [ ] Create `packages/cli/src/images/playwright-runner.ts` — optional rendered-size + LCP capture

### 1.2 Register in CLI
- [ ] Add `images` subcommand to `packages/cli/src/index.ts` (mirror how `content`, `hreflang`, `screenshot` are registered)
- [ ] Add flag definitions:
  ```
  --crawl                 site-wide crawl (default: single URL)
  --playwright            rendered-size + LCP detection
  --threshold-kb=200      oversized image flag
  --format=json|html      default html
  --output=<path>         default ./seocore-images-report.<ext>
  --concurrency=5         parallel image fetches
  --max-images=500        safety cap for --crawl
  --user-agent=<string>   override UA for fetches
  --timeout=10000         per-image fetch timeout ms
  ```
- [ ] Wire help text + usage example in command description

### 1.3 Dependency
- [ ] Add `sharp` to `packages/cli/package.json` `dependencies`
- [ ] Add `@types/sharp` if needed (sharp ships types — verify)
- [ ] Run `npm install` and verify native build succeeds on Win + Mac + Linux CI

---

## 2. Image discovery

### 2.1 Single URL mode
- [ ] Fetch HTML for target URL (reuse existing fetch util, set UA)
- [ ] Parse HTML, extract:
  - [ ] `<img>` `src`, `srcset`, `sizes`, `alt`, `loading`, `decoding`, `fetchpriority`, `width`, `height`
  - [ ] `<picture><source>` `srcset`, `type`, `media`
  - [ ] CSS `background-image` URLs from inline `style` attrs (best-effort)
  - [ ] `<link rel="preload" as="image">` entries
- [ ] Resolve all relative URLs against base
- [ ] Dedupe by absolute URL, preserve first-seen attrs

### 2.2 Site crawl mode (`--crawl`)
- [ ] Use `packages/crawler` to enumerate pages (respect `--max-pages`, robots.txt)
- [ ] Run discovery per page, merge image records, track which pages each image appears on
- [ ] Enforce `--max-images` cap, warn on truncation

### 2.3 Fetch image metadata (`fetcher.ts`)
- [ ] HEAD request per image → capture `Content-Length`, `Content-Type`, `Cache-Control`, `CDN` headers (`x-cache`, `server`, `cf-ray`)
- [ ] If HEAD blocked (405/403), fall back to ranged GET (`Range: bytes=0-65535`) for first chunk
- [ ] Concurrency pool honoring `--concurrency`
- [ ] Per-image timeout, retry once on transient failure
- [ ] Capture: HTTP status, final URL (after redirects), bytes, content-type, headers

### 2.4 Decode (`decoder.ts`)
- [ ] For each successful fetch, pipe buffer to `sharp(buffer).metadata()`
- [ ] Extract: actual width/height, format, hasAlpha, isAnimated, density, space, channels
- [ ] Estimate quality for JPEG via sharp stats (heuristic: high entropy + small size → high compression)
- [ ] Skip decode if status != 200 or content-type not image/*
- [ ] Guard against malformed images (try/catch, mark as `decodeFailed`)

### 2.5 Playwright path (`--playwright`)
- [ ] Launch browser (reuse `screenshot.ts` bootstrap)
- [ ] Navigate to URL, wait for `networkidle`
- [ ] Evaluate in page: for each `<img>`, capture `getBoundingClientRect()` (rendered width/height), `naturalWidth/Height`, `currentSrc`, computed `loading`, in-viewport flag
- [ ] Capture LCP element via PerformanceObserver (`largest-contentful-paint`), record element selector + URL if image
- [ ] Merge Playwright-derived data into `ImageRecord` by URL

---

## 3. Rules (each in own file under `packages/cli/src/images/rules/`)

### 3.1 `weight.ts` — Oversized files
- [ ] Flag any image > `--threshold-kb` (default 200KB)
- [ ] Flag total page image payload > 1.5MB (mobile budget)
- [ ] Severity: high if > 500KB, medium 200–500KB
- [ ] Recommendation: compress + serve modern format

### 3.2 `format.ts` — Legacy format
- [ ] JPEG/PNG > 50KB without `<picture>` modern alternative → suggest WebP/AVIF
- [ ] Animated GIF → suggest MP4/WebM `<video autoplay muted loop>`
- [ ] PNG-24 used for photo (no alpha needed) → suggest JPEG/WebP
- [ ] Severity: medium

### 3.3 `delivery.ts` — Served vs rendered size (Playwright only)
- [ ] If `naturalWidth > renderedWidth * dpr * 1.5` → oversized delivery
- [ ] Suggest responsive `srcset` with appropriate widths
- [ ] Severity: medium, high if wastage > 100KB

### 3.4 `loading.ts` — Loading strategy
- [ ] Below-fold image without `loading="lazy"` → flag
- [ ] Above-fold/LCP image with `loading="lazy"` → flag (hurts LCP)
- [ ] Missing `decoding="async"` on non-critical → low severity hint
- [ ] Requires Playwright for viewport check, fall back to position-in-DOM heuristic when static

### 3.5 `cls.ts` — Layout shift risk
- [ ] Missing `width` AND `height` attrs (and no inline `aspect-ratio`) → flag
- [ ] Severity: high (CLS = Core Web Vital)
- [ ] Recommendation: add intrinsic dimensions

### 3.6 `lcp.ts` — LCP image optimization (Playwright only)
- [ ] If LCP element is image:
  - [ ] Check `<link rel="preload" as="image" fetchpriority="high">` present
  - [ ] Check `fetchpriority="high"` on `<img>`
  - [ ] Check NOT `loading="lazy"`
  - [ ] Check served in modern format
- [ ] Severity: high (direct LCP impact)

### 3.7 `responsive.ts` — Srcset / picture usage
- [ ] Image > 600px wide without `srcset` → suggest responsive variants
- [ ] `<picture>` without `<source type="image/avif">` or `image/webp` → suggest modern source
- [ ] Severity: low/medium

### 3.8 `caching.ts` — Cache + CDN
- [ ] `Cache-Control` missing or `max-age < 86400` → flag
- [ ] No CDN signals in headers → suggest CDN
- [ ] `immutable` directive absent on hashed filenames → low hint
- [ ] Severity: low

### 3.9 `alt.ts` — Alt text (reuse existing rule)
- [ ] Adapter that wraps `MissingAltTextRule` from `packages/rules`
- [ ] Feed image records as pseudo-page, normalize finding shape
- [ ] Severity: per existing rule

### 3.10 `broken.ts` — Broken / errored images
- [ ] HTTP 4xx/5xx → flag
- [ ] Mixed content (HTTPS page loading HTTP image) → flag high
- [ ] Decode failed → flag medium

---

## 4. Scoring + aggregation

### 4.1 Per-image score
- [ ] Each rule contributes 0–100 sub-score per image
- [ ] Weighted average → image overall score
- [ ] Tag image with worst-offender rule for quick triage

### 4.2 Page/site score
- [ ] Aggregate image scores weighted by bytes (heavy bad image hurts more)
- [ ] Calculate summary stats: total images, total bytes, avg size, % modern format, % with alt, % with dimensions, % lazy below fold

### 4.3 Budget checks
- [ ] Total payload vs 1.5MB mobile budget
- [ ] LCP image weight vs 100KB target
- [ ] Count of oversized images
- [ ] Emit budget violations as top-level findings

---

## 5. Reporter (`reporter.ts`)

### 5.1 JSON output
- [ ] Schema:
  ```ts
  {
    url: string,
    crawledAt: string,
    mode: 'single' | 'crawl',
    playwright: boolean,
    summary: { totalImages, totalBytes, avgBytes, score, budgets: {...} },
    images: ImageRecord[],
    findings: ImageFinding[],
    budgetViolations: BudgetViolation[]
  }
  ```
- [ ] Pretty-print with 2-space indent

### 5.2 HTML output
- [ ] Match `packages/cli/src/content/reporter.ts` template style (header, summary cards, findings table)
- [ ] Per-image cards with thumbnail (data URI from sharp resize → 120px max), filename, size, format, dimensions, score
- [ ] Findings grouped by severity, then by rule
- [ ] Budget gauge visualization (total bytes vs budget)
- [ ] "Worst offenders" top-10 table sorted by bytes
- [ ] Format breakdown pie (modern vs legacy)
- [ ] Inline CSS, no external assets

### 5.3 Console summary
- [ ] Always print to stdout: total images, total weight, score, top 3 findings
- [ ] Color severity (chalk: red/yellow/green)
- [ ] Print output file path when `--format=html` or `--output` set

---

## 6. Tests

### 6.1 Unit tests (`packages/cli/src/images/*.test.ts`)
- [ ] `fetcher.test.ts` — mock fetch, verify concurrency cap, retry, timeout, HEAD→GET fallback
- [ ] `decoder.test.ts` — fixture JPEG/PNG/WebP/GIF/AVIF, verify metadata extraction
- [ ] `analyzer.test.ts` — fixture image records → expected findings per rule
- [ ] One `*.test.ts` per rule with positive + negative case

### 6.2 Integration test
- [ ] Spin up local static server with fixture HTML + 5 image variants (oversized JPEG, missing alt, missing dimensions, animated GIF, properly optimized WebP)
- [ ] Run command end-to-end, assert finding counts + score in range

### 6.3 Fixtures
- [ ] Add `packages/cli/test/fixtures/images/` with sample images (small, under repo budget)
- [ ] Add `packages/cli/test/fixtures/images-page.html` referencing fixtures

---

## 7. Docs

- [ ] Update root `README.md` CLI section: add `seocore images` row
- [ ] Add `docs/commands/images.md` (if docs folder exists) with:
  - [ ] Usage examples
  - [ ] Flag reference
  - [ ] Rule catalog with severities + remediation
  - [ ] Sample output screenshots
- [ ] Update `seocore.config.json` schema if image command reads any config keys

---

## 8. Verification

- [ ] `npm run build` — must succeed
- [ ] `npm test` — must pass
- [ ] `seocore images https://example.com` — single mode prints summary, exits 0
- [ ] `seocore images https://example.com --playwright` — captures LCP + rendered sizes
- [ ] `seocore images https://example.com --crawl --max-pages=10 --format=html --output=./out.html` — site mode produces HTML
- [ ] Manual test against 3 real sites: a) image-heavy blog, b) e-commerce PDP, c) news homepage — sanity-check findings

---

## 9. Stretch (post-MVP)

- [ ] `--fix` flag: write optimized variants to `./.seocore-images-optimized/` (sharp re-encode at quality 80, WebP + AVIF outputs)
- [ ] Diff mode: `--compare=./previous.json` to track regression between audits
- [ ] CI integration: exit code 1 if budget violated or score < `--min-score`
- [ ] Sitemap.xml input mode as alternative to crawl
- [ ] WebP/AVIF browser support matrix annotation in report
- [ ] Image hash dedupe — flag same image served from multiple URLs
