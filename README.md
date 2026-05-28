   # 🕸️ SEOCore

   > Enterprise-grade, multi-threaded SEO Crawler, Rule Engine, and Link Graph Analyzer. Built in TypeScript for speed, compliance, and deep site health audits.

   [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
   [![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/seocore/seocore)
   [![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)](https://nodejs.org)

   SEOCore is an enterprise-grade, high-performance SEO auditing and site crawling platform. It combines a concurrent crawler, Cheerio-based scrapers, a declarative Rules Engine, and Graph Theory to analyze link structures, calculate authority scores, track redirects, and score site health across multiple dimensions.

   ---

   ## 🎯 Target Users

   - **Developers & Web Engineers**: Run local audits, profile rendering pipelines, track performance budgets, and integrate SEO linting directly into CI/CD pipelines.
   - **SEO Specialists**: Analyze canonicalization, crawl depth, HTTP redirect chains, structured data, canonical compliance, robots.txt directives, and sitemap coverage.
   - **Site Administrators**: Find broken links, orphan pages, crawl budget waste, and redirect loops.

   ---

   ## 💻 Tech Stack

   - **Runtime**: [Node.js (v20+)](https://nodejs.org/) & [TypeScript](https://www.typescriptlang.org/)
   - **Monorepo Manager**: [Nx Monorepo](https://nx.dev/)
   - **Crawler**: Custom HTTP engine powered by [Bottleneck](https://www.npmjs.com/package/bottleneck) (rate-limiting) & [p-queue](https://www.npmjs.com/package/p-queue) (concurrency)
   - **Headless Browser**: [Playwright](https://playwright.dev/) (optional, for client-side JavaScript rendering)
   - **HTML Parser**: [Cheerio](https://cheerio.js.org/) (fast server-side DOM selection)
   - **Validation & CLI**: [Zod](https://zod.dev/) (configuration schema enforcement) & [Commander.js](https://www.npmjs.com/package/commander)
   - **Test Runner**: [Vitest](https://vitest.dev/)

   ---

   ## ✨ Key Features

   1. **Execution Tier System**:
      - Tiers drive everything from crawl limits to rule selection and scoring behavior
      - **Fast**: Core rules only, 1 page, static HTML
      - **Standard**: + Performance, 100 pages, simulated CWV
      - **Deep**: + All modules, 500 pages, Playwright rendering
      - **Enterprise**: + Plugins, 5000 pages, Lighthouse sampling

   2. **High-Performance Concurrent Crawler**:
      - Built-in rate-limiting, custom backoff delays, retry policies, and timeout handlers.
      - Respects robots.txt directives and extracts URLs from `sitemap.xml` automatically.
   3. **Path Filtering (Inclusions/Exclusions)**:
      - Restrict audits using wildcards (e.g. `/blog/*` or `*.html`).
      - Block admin sections or static resource patterns.
   4. **Deep Redirect Hop & Loop Tracking**:
      - Manual redirection handling intercepts 3xx responses.
      - Traces complete redirect chains (statusCode and hops) and catches circular redirect loops.
5. **Unified Structured Data & Entity Graph Auditor**:
   - Compiles Schema.org JSON-LD, Microdata, RDFa elements from raw source HTML and Playwright rendering.
   - Stitches nodes into an Entity Graph, resolves referencing pointers deeply, and maps DAG layouts safely.
   - Evaluates E-E-A-T markers (sameAs links pointing to Wikipedia/Wikidata/LinkedIn).
   - Cross-checks schema values (price, title, canonical URL) against HTML headers, canonicals, and OpenGraph/Twitter card tags.
6. **Crawl Graph & Link Authority Analysis**:
   - Computes in-degree, out-degree, and custom authority scores (PageRank style).
   - Flags orphan pages and structural dead ends.
7. **AI Visibility & LLM Crawler Directives Auditor**:
   - Evaluates brand visibility and structured indexing across search engines, chatbots, and AI crawlers.
   - Strictly validates crawlability configurations (robots.txt, sitemaps).
   - Audits `llms.txt` and `/.well-known/llms.txt` rules for GPTBot, ClaudeBot, PerplexityBot, and Google-Extended.
8. **Mobile SEO Scorer & Evaluator**:
   - Evaluates mobile usability (viewport meta, responsive layouts, navigation toggle detection, tap targets).
   - Scores mobile performance (simulated Core Web Vitals including throttled mobile LCP, mobile CLS, JS payload and requests).
   - Verifies responsive design quality (CSS media queries, fluid layouts, standard mobile breakpoints).
   - Audits mobile indexing readiness (content parity, structured data validity, mobile-first canonical configuration).
   - Enforces `isVerifiable()` guards and strict empty states (non-pass by default) under static crawls, capping unverified performance scores at 50 to ensure high scores require real runtime validation.
9. **E-E-A-T & Content Quality Analyzer**:
   - Evaluates Experience, Expertise, Authoritativeness, and Trustworthiness (E-E-A-T) pillars.
   - Scores content readability (Flesch Reading Ease, Flesch-Kincaid Grade Level).
   - Analyzes content structure, word count, and internal link density.
   - Extracts top keywords and checks for keyword stuffing.
   - Verifies AI citation readiness (structured data completeness, llms.txt presence, semantic HTML usage).
   - Provides actionable findings with severity levels.
   - Supports JSON and HTML report exports for documentation and CI/CD integration.
10. **Outbound Authority Links & Google Rank Checker**:
   - Analyzes backlink domains metrics (authority counts, referring domains, spam scores).
   - Verifies keywords visibility inside Google Top 10 Search Results via serpapi or headless browser automation.
11. **Competitive Site Comparer**:
   - Compares health metrics, performance budgets, metadata, and link structures across two different URLs or exported JSON audits.
12. **Hreflang Validator**:
    - Validates bidirectional hreflang links across pages.
    - Checks for consistent x-default configurations.
    - Validates language code formats.
    - Deep-crawls all hreflang-referenced pages with `--deep` option.
    - Exports validation reports in terminal and JSON formats.
13. **Optional Headless Rendering**:
    - Boot Playwright to parse single-page apps (SPAs) that require client-side execution.
14. **Visual Screenshot Capture**:
    - Capture screenshots of your pages at different breakpoints (mobile, tablet, desktop).
    - Use Playwright device descriptors (e.g., "iPhone 15 Pro") for accurate mobile screenshots.
    - Capture full-page screenshots of your website.
    - Deep crawl to capture screenshots for all pages listed in your sitemap.
15. **Dedicated Image Audit (`images` command)**:
    - Audits page or site-wide images for SEO, performance, accessibility, and caching.
    - Discovers assets from `<img>`, `<picture>`, inline `background-image`, and `<link rel="preload" as="image">`.
    - Fetches metadata in parallel (size, format, cache headers, CDN signals) and decodes dimensions with `sharp`.
    - Optional Playwright mode for rendered vs natural size, viewport placement, and LCP image detection.
    - Rules cover payload weight, legacy formats, lazy-loading strategy, CLS risk, responsive `srcset`, alt text, and broken/mixed-content URLs.
    - Byte-weighted scoring, mobile payload budgets (1.5MB), and LCP image weight targets (100KB).
    - Exports terminal summary plus JSON or HTML reports with thumbnails and worst-offender tables.
16. **Evidence-based Technology Stack Detection (`technology` command)**:
    - Analyzes frontend frameworks, rendering strategies, CDN/edge delivery networks, backend servers, CMS packages, analytics trackers, UI systems, asset fonts, and third-party tools.
    - Suppresses low-confidence noise. Requires deterministic evidence weights before reporting.
    - Classifies page rendering strategies directly (Hybrid, SSR, CSR, or static HTML).
    - Exports findings in terminal tables, structured raw JSON, or clean HTML charts.
17. **JavaScript SEO Impact Report (`js-impact` command)**:
    - Compares raw HTML against rendered DOM to detect SEO-relevant changes caused by client-side JavaScript.
    - Flags metadata, heading, content, links, image, and structured-data parity issues between pre-render and post-render states.
    - Helps diagnose CSR / hydration problems that can hide content or links from crawlers.
    - Exports terminal, JSON, HTML, and Markdown reports for debugging and CI workflows.
18. **Business Directory Presence & NAP Consistency Audit (`directories` command)**:
    - Detects business listings across major directories and local citation sources.
    - Extracts source-site NAP data (name, phone, address, website) and compares it against candidate listings.
    - Classifies listings as `Issues not found`, `Wrong Phone Number`, `Wrong Business Name`, `No Phone Number`, `Not Present`, or `Search failed`.
    - Uses a resilient HTTP search cascade (`Bing -> Brave -> Mojeek -> DuckDuckGo`) with optional SerpAPI or Playwright fallback.
    - Outputs terminal tables or raw JSON for citation cleanup, local SEO audits, and missed-opportunity reporting.
19. **Audit Snapshots & Diff**:
    - Save audit snapshots automatically with `--save` flag
    - Compare current audit against previous snapshot with `--diff`
    - CI mode with regression detection (`--diff --ci`) fails only on regressions
    - Stores snapshots in `./.seocore/history/<host>/` directory

20. **Explain & Dry-Run UX**:
    - Preview audit configuration without crawling with `--dry-run`
    - Explains active tier, enabled modules, page budget, and active rules
    - `seocore rules explain <rule-id>` shows detailed rule information
    - `seocore tier explain <tier>` shows tier capabilities and configuration

21. **Schema Graph Explorer**:
    - Analyze structured data entities and their relationships
    - Detects broken references, duplicate entities, and schema coverage gaps
    - Exports in terminal, JSON, HTML, and Mermaid diagram formats

22. **Internal Link Planner**:
    - Generates actionable internal linking recommendations
    - Identifies orphan pages and low-authority priority pages
    - Suggests source/target page pairs with anchor text themes
    - Highlights high-leverage hub pages

23. **Search Opportunities Analyzer**:
    - Combines crawl findings with optional GSC/CrUX data
    - Prioritizes opportunities by estimated business impact and ease-of-fix
    - Works without external providers using heuristic-based ranking
    - Identifies metadata, performance, indexing, internal links, schema, and content opportunities

24. **Production-Ready Reporting**:

    - Real-time colored terminal logging via custom EventBus.
    - Exports rich, detailed audit logs in terminal, JSON, HTML, and SARIF formats.

   ---

   ## 🏗️ Monorepo Folder Structure

   The project is structured as a modular TypeScript monorepo managed with Nx:

   ```text
   packages/
   ├── cli/         # Command-line interface containing CLI commands
   ├── engine/      # Main orchestrator linking crawling, parsing, and scoring
   ├── crawler/     # HttpCrawler, PlaywrightCrawler, robots.txt & sitemap parser
   ├── analyzers/   # Fast cheerio scrapers and page normalizers
   ├── rules/       # Declarative SEO auditing rules and rule compiler
   ├── scoring/     # Crawl graph authority & category scoring engines
   ├── config/      # Config loading, default presets, and Zod schema validation
   ├── sdk/         # Shared interfaces, events, schemas, and common utilities
   └── reporter/    # Exporters (TerminalReporter and JsonReporter)
   ```

   ---

   ## 🚀 Installation

   ### Prerequisites
   - **Node.js** v20.0.0 or higher
   - **npm** or **yarn**

   ### Steps

   1. **Clone the repository**:
      ```bash
      git clone https://github.com/seocore/seocore.git
      cd seocore
      ```

   2. **Install dependencies**:
      ```bash
      npm install
      ```

   3. **Build the monorepo**:
      ```bash
      npm run build
      ```

   ---

   ## 📖 Usage Flow

   SEOCore can be executed via the CLI or imported directly as an SDK.

  ### CLI Usage

  The core CLI executable is `seocore`.

  #### Main Commands:
   - `audit`: Audit a website for SEO, speed, indexing, accessibility, and metadata
   - `crawl`: Crawl a website and list discovered pages without scoring
   - `compare`: Compare two websites or SEO audit reports
   - `images`: Analyze images on a webpage or crawl an entire site for image issues
   - `technology`: Detect website technology stack with evidence-based confidence scores
   - `js-impact`: Compare raw HTML vs rendered DOM for JavaScript SEO impact
   - `directories`: Check business directory presence and NAP consistency across citation sources
   - `inspect`: Single-aspect probes (robots, sitemap, schema, hreflang, backlinks, rank, screenshot, llms-txt)
   - `analyze`: Analyzer-driven deep dives (content, ai-visibility, schema-graph, link-plan, opportunities)
   - `config`: Manage and validate SEO config
   - `rules`: Manage and inspect SEO validation rules
   - `tier`: Manage execution tiers

   ---

   #### 1. Initialize Configuration
   Generate a default `seocore.config.json` configuration file at your project root:
   ```bash
  seocore config init
   ```

   Show current config:
   ```bash
  seocore config show
   ```

   Validate config:
   ```bash
  seocore config validate
   ```

   #### 2. Run a Site Audit
   Audit a website's landing page (default standard tier):
   ```bash
  seocore audit https://example.com
   ```

   Audit using specific tiers:
   ```bash
   # Fast tier (core rules, 1 page, static HTML)
  seocore audit https://example.com --tier fast

   # Standard tier (core + performance, 100 pages, simulated CWV)
  seocore audit https://example.com --tier standard

   # Deep tier (all modules, 500 pages, Playwright rendering)
  seocore audit https://example.com --tier deep

   # Enterprise tier (all modules + plugins, 5000 pages, Lighthouse sampling)
  seocore audit https://example.com --tier enterprise
   ```

   Export audit as HTML report:
   ```bash
  seocore audit https://example.com --format html --output ./seocore-report.html
   ```

   Save audit snapshot for later comparison:
   ```bash
  seocore audit https://example.com --save
   ```

   Compare current audit against previous snapshot:
   ```bash
  seocore audit https://example.com --diff
   ```

   Save new snapshot and compare with previous:
   ```bash
  seocore audit https://example.com --save --diff
   ```

   CI mode - fail on regressions only:
   ```bash
  seocore audit https://example.com --diff --ci
   ```

   Dry-run - preview what will be audited without crawling:
   ```bash
  seocore audit https://example.com --dry-run
   ```

   **Audit Flags:** `--save`, `--diff`, `--ci`, `--dry-run`, `--history-dir <path>` (custom snapshot directory)

   #### 3. Run Crawler Only
   Map site structure and list HTTP responses without executing SEO rules or scoring:
   ```bash
  seocore crawl https://example.com --depth 2 --max-pages 100
   ```

   #### 4. Manage SEO Validation Rules
   List all registered rules, severity levels, and category assignments:
   ```bash
  seocore rules list
   ```

   Describe a specific rule:
   ```bash
  seocore rules describe <rule-id>
   ```

   Explain a specific rule in detail:
   ```bash
  seocore rules explain <rule-id>
   ```

   #### 5. Manage Execution Tiers
   List all available tiers, their capabilities, and configurations:
   ```bash
  seocore tier list
   ```

   Describe a specific tier:
   ```bash
  seocore tier describe <tier-name>
   ```

   Explain a specific tier in detail:
   ```bash
  seocore tier explain <tier-name>
   ```

   #### 6. Analyze AI Visibility & Structure
   Evaluate search engine/chatbot discovery, metadata structure, citation readiness, and entity mapping:
   ```bash
  seocore analyze ai-visibility https://example.com
   ```

   Output results in raw JSON:
   ```bash
  seocore analyze ai-visibility https://example.com --json
   ```

   #### 7. Analyze E-E-A-T & Content Quality
   Evaluate Experience, Expertise, Authoritativeness, and Trustworthiness (E-E-A-T), content readability, structure, and AI citation readiness:
   ```bash
  seocore analyze content https://example.com/blog/post
   ```

   Export as JSON:
   ```bash
  seocore analyze content https://example.com --json --output content-report.json
   ```

   Export as HTML:
   ```bash
  seocore analyze content https://example.com --format html --output content-report.html
   ```

   CI mode with budgets:
   ```bash
  seocore analyze content https://example.com --ci --budget-eeat 70 --budget-content 75
   ```

   #### 7. Analyze Schema Graph
   Explore structured data entities, relationships, and schema completeness:
   ```bash
  seocore analyze schema-graph https://example.com
   ```

   Export as Mermaid diagram:
   ```bash
  seocore analyze schema-graph https://example.com --format mermaid
   ```

   Export as JSON or HTML:
   ```bash
  seocore analyze schema-graph https://example.com --format json
  seocore analyze schema-graph https://example.com --format html --output schema-graph.html
   ```

   **Schema Graph Flags:** `--format terminal|json|html|mermaid`, `-o <path>`

   #### 8. Analyze Internal Link Plan
   Generate actionable internal linking recommendations with ranked source → target suggestions, orphan page detection, and hub identification:
   ```bash
  seocore analyze link-plan https://example.com
   ```

   Show top N recommendations:
   ```bash
  seocore analyze link-plan https://example.com --top 20
   ```

   Export as JSON:
   ```bash
  seocore analyze link-plan https://example.com --format json --output link-plan.json
   ```

   Export as HTML report:
   ```bash
  seocore analyze link-plan https://example.com --format html --output link-plan.html
   ```

   Full site crawl with high-confidence filter:
   ```bash
  seocore analyze link-plan https://example.com --full --min-confidence 60
   ```

   **Link Plan Flags:**
   - `--top <number>` — Limit suggestions displayed
   - `--format terminal|json|html` — Output format (default: terminal)
   - `-o, --output <path>` — Export file path
   - `--full` — Crawl entire site (100 pages, depth 5)
   - `-d, --depth <number>` — Crawl depth limit (default: 3)
   - `-m, --max-pages <number>` — Maximum pages to crawl (default: 50)
   - `--min-confidence <number>` — Minimum confidence threshold 0-100 (default: 0)
   - `--max-suggestions-per-target <number>` — Max suggestions per target page (default: 5)
   - `--verbose` — Show additional diagnostic details (scores, signals)

   #### 9. Analyze Search Opportunities
   Identify high-impact, page-level organic search opportunities ranked by deterministic business impact and ease of fix:
   ```bash
  seocore analyze opportunities https://example.com
   ```

   Show only top opportunities:
   ```bash
  seocore analyze opportunities https://example.com --top 25
   ```

   Show only medium/high opportunities:
   ```bash
  seocore analyze opportunities https://example.com --min-priority medium
   ```

   Export as JSON:
   ```bash
  seocore analyze opportunities https://example.com --format json --output opportunities.json
   ```

   Export as HTML (with rich summary cards and action plan metrics):
   ```bash
  seocore analyze opportunities https://example.com --format html --output opportunities.html
   ```

   Enrich with Google Search Console or CrUX field performance data:
   ```bash
  seocore analyze opportunities https://example.com --with-gsc --gsc-file ./gsc-pages.json --with-crux --crux-file ./crux-pages.json
   ```

   Run deeper crawl with explicit limits:
   ```bash
  seocore analyze opportunities https://example.com --full --depth 5 --max-pages 100
   ```

   Show verbose ranking inputs and loader warnings:
   ```bash
  seocore analyze opportunities https://example.com --verbose
   ```

   **Opportunities Flags:**
   - `-f, --format <terminal|json|html>`: Output format (default: terminal)
   - `-o, --output <path>`: Export file path
   - `--with-gsc`: Include GSC metrics
   - `--gsc-file <path>`: GSC JSON export file path
   - `--with-crux`: Include CrUX performance metrics
   - `--crux-file <path>`: CrUX JSON export file path
   - `--full`: Crawl the entire site using the command's larger default budget
   - `-d, --depth <number>`: Override crawl depth limit
   - `-m, --max-pages <number>`: Override maximum crawled pages
   - `--top <n>`: Limit shown/exported top items
   - `--min-priority <low|medium|high>`: Filter minimum priority to display
   - `--verbose`: Show full scoring inputs and warnings

   **Notes:**
   - Works without external providers using crawl heuristics only.
   - `--with-gsc` and `--with-crux` improve ranking quality but are optional.
   - If `--gsc-file` or `--crux-file` is omitted, the command falls back to `./gsc-pages.json` and `./crux-pages.json`.
   - Output is site-level analysis with page-level prioritized actions, not a full enterprise audit replacement.

   #### 10. Inspect Single Aspects
   The `inspect` command has subcommands for individual checks:

   - **robots**: Verify robots.txt access rules, exclusions, and sitemap references
     ```bash
    seocore inspect robots https://example.com
     ```

   - **sitemap**: Analyze sitemap.xml and verify all linked URLs are reachable
     ```bash
    seocore inspect sitemap https://example.com --check-links
     ```

   - **llms-txt**: Verify `llms.txt` and `/.well-known/llms.txt` rules for AI crawlers like GPTBot, ClaudeBot, and PerplexityBot
     ```bash
    seocore inspect llms-txt https://example.com
     ```

   - **schema**: Validate Schema.org JSON-LD, Microdata, and RDFa structures
     ```bash
    seocore inspect schema https://example.com
     ```

   - **hreflang**: Validate a website's hreflang tags for bidirectional links, x-default consistency, and language code validity
     ```bash
    seocore inspect hreflang https://example.com
     ```

   - **backlinks**: Extract backlink profiles and analyze referring domain authority and spam scores
     ```bash
    seocore inspect backlinks https://example.com
     ```

   - **keywords**: Perform advanced SEO keyword intelligence, noise filtering, and topic clustering
     ```bash
    seocore inspect keywords "behavioral health"
     ```
     With deep expansions:
     ```bash
    seocore inspect keywords "behavioral health" --expand
     ```
     With noise filtering options:
     ```bash
    seocore inspect keywords "behavioral health" --strict-noise-filter
     ```

   - **rank**: Check if a target website ranks in Google's top 10 organic results for a given keyword
     ```bash
    seocore inspect rank "seo crawler" https://example.com
     ```

   - **screenshot**: Capture screenshots of a target page or entire website
     ```bash
    seocore inspect screenshot https://example.com --breakpoints mobile,tablet,desktop
     ```

   #### 11. Compare Site Audits
   Compare SEO health scores, metadata differences, and performance metrics across two websites or audit files:
   ```bash
  seocore compare https://site-a.com https://site-b.com --focus technical
   ```

   #### 12. Audit Images (SEO + Performance)
   Audit images on a single page or across the site for weight, format, delivery, CLS, LCP, alt text, caching, and broken URLs. See [docs/commands/images.md](docs/commands/images.md) for the full rule catalog.

   Single page (default):
   ```bash
  seocore images https://example.com
   ```

   Full site crawl (same origin, respects `robots.txt`; capped at ~100 pages and 500 unique images by default):
   ```bash
  seocore images https://example.com --crawl
   ```

   Playwright mode (rendered size, viewport, LCP element on the start URL):
   ```bash
  seocore images https://example.com --playwright
   ```

   Site crawl + Playwright + HTML report:
   ```bash
  seocore images https://example.com --crawl --playwright -f html -o ./seocore-images-report.html
   ```

   JSON export with custom thresholds:
   ```bash
  seocore images https://example.com --crawl --max-images 200 --threshold-kb 150 -f json -o ./images-audit.json
   ```

   **Flags:** `--crawl`, `--playwright`, `--threshold-kb` (default 100), `--concurrency` (default 10), `--max-images` (default 500), `--user-agent`, `--timeout` (default 30000ms), `-f json|html`, `-o <path>`.

   #### 13. Audit Web Technology Stack
   Identify framework, CDN, hosting, CMS, libraries, analytics, fonts, and external APIs with confidence ratings:
   ```bash
  seocore technology https://example.com
   ```

   Show underlying signature evidence lines and raw scores:
   ```bash
  seocore technology https://example.com --verbose
   ```

   Export stack detection to structured JSON or standalone HTML:
   ```bash
  seocore technology https://example.com --format html --output ./technology-report.html
   ```

   #### 14. Audit JavaScript SEO Impact
   Compare raw source HTML against rendered DOM to see what JavaScript changes for crawlers. See [docs/js-impact.md](docs/js-impact.md) for command details and output reference.
   ```bash
  seocore js-impact https://example.com
   ```

   Use safer wait modes for JS-heavy marketing sites that never go idle:
   ```bash
  seocore js-impact https://example.com --wait-event load --timeout-ms 45000
   ```

   Export machine-readable JSON or shareable HTML:
   ```bash
  seocore js-impact https://example.com --output json --output-file ./js-impact-report.json
  seocore js-impact https://example.com --output html --output-file ./js-impact-report.html
   ```

   **Flags:** `--wait-event load|domcontentloaded|networkidle`, `--timeout-ms`, `--wait-extra-ms`, `-o terminal|json|html|markdown`, `--output-file <path>`.

   #### 15. Audit Business Directory Presence
   Check whether a business appears on key local/business directories and whether the listing NAP matches the source website:
   ```bash
 seocore directories https://example.com
   ```

   Force the multi-engine HTTP cascade search mode:
   ```bash
 seocore directories https://example.com --provider cascade
   ```

   Use live browser search when HTML search engines are blocked:
   ```bash
 seocore directories https://example.com --provider playwright --show
   ```

   Export citation results as JSON:
   ```bash
 seocore directories https://example.com --json --output ./directories-report.json
   ```

   **Search providers:**
   - `auto`: Use `SERPAPI_KEY` if present, otherwise use the HTTP cascade and fall back to Playwright when needed.
   - `serpapi`: Most reliable live-search mode when `SERPAPI_KEY` is configured.
   - `cascade`: HTTP-first search chain using `Bing -> Brave -> Mojeek -> DuckDuckGo`.
   - `duckduckgo`: Force DuckDuckGo HTML search only.
   - `playwright`: Browser-driven live search for sites that block HTML endpoints.

   **Flags:** `--provider auto|serpapi|cascade|duckduckgo|playwright`, `--show`, `--concurrency` (default 4), `--max-candidates` (default 3), `--json`, `-f terminal|json`, `-o <path>`.

   **Typical statuses:** `Issues not found`, `Wrong Phone Number`, `Wrong Business Name`, `No Phone Number`, `Not Present`, `Search failed`.

   ### SDK Integration

   Import SEOCore directly into your Node/TypeScript backend:

   ```typescript
   import { SeoEngine } from '@seocore/engine';
   import { EventBus, ExecutionTier } from '@seocore/sdk';

   // Initialize the real-time event bus
   const eventBus = new EventBus();

   eventBus.on('page:loaded', (data) => {
   console.log(`Crawled: ${data.url} | Status: ${data.statusCode}`);
   });

   // Run audit using a tier
   const engine = new SeoEngine(eventBus);
   const result = await engine.run(
   'https://example.com', 
   { /* optional overrides here */ },
   ExecutionTier.STANDARD
   );

   console.log(`Overall Health Score: ${result.score}%`);
   ```

   ---

   ## ⚙️ Configuration

   Custom audits are defined via `seocore.config.json` or inline overrides.

   ### Configuration Schema

   | Option | Type | Default | Description |
   | :--- | :--- | :--- | :--- |
   | `tier` | `"fast" \| "standard" \| "deep" \| "enterprise"` | `"standard"` | Execution tier driving crawl limits, rules, and scoring. Overrides `preset`. |
   | `preset` | `"quick" \| "standard" \| "deep" \| "enterprise"` | `"standard"` | Scrape profile adjusting page/depth depth limits (legacy, use `tier`). |
   | `concurrency` | `number` | `5` | Maximum simultaneous page crawl requests. |
   | `maxDepth` | `number` | `3` | Distance of steps allowed from seed landing URL. |
   | `maxPages` | `number` | `100` | Hard cap on total crawled pages per audit. |
   | `rateLimitMs` | `number` | `100` | Delay spacing between concurrent requests. |
   | `retryCount` | `number` | `2` | Number of crawl attempts on 5xx failures. |
   | `playwrightEnabled`| `boolean` | `false` | Enable Playwright headless rendering for SPAs. |
   | `excludePatterns` | `string[]` | `[]` | Glob/wildcard path list to bypass. |
   | `includePatterns` | `string[]` | `[]` | Glob/wildcard path list restricted for crawling. |
   | `ruleOverrides` | `object` | `{}` | Disable, override weight/severity/findings for rules. Supports `findingSeverityOverrides`. |

   ### Example `seocore.config.json`

   ```json
   {
   "preset": "standard",
   "concurrency": 10,
   "maxPages": 500,
   "rateLimitMs": 50,
   "excludePatterns": [
      "/admin/*",
      "*/checkout/*",
      "*.pdf"
   ],
   "includePatterns": [
      "/blog/*",
      "/products/*"
   ],
   "ruleOverrides": {
      "missing-meta-description": {
         "severity": "error",
         "weight": 8
      },
      "duplicate-h1": {
         "enabled": false
      },
      "security-headers": {
         "severity": "warning",
         "findingSeverityOverrides": {
            "security-headers:missing-csp": "error"
         }
      }
   }
   }
   ```

   ---

   ## 👥 Contributing

   We welcome community contributions! Please read our guidelines to get started:

   1. **Fork the repo** and create your branch from `main`.
   2. Ensure you have Node 20+ installed.
   3. Write clean, modular TypeScript following existing packages patterns.
   4. Run tests before submitting a pull request:
      ```bash
      npm test
      ```
   5. Submit detailed PR descriptions mapping features to technical specifications.

   ---

   ## 📄 License

   This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for more details.
