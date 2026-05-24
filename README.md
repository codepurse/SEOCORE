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

   1. **High-Performance Concurrent Crawler**:
      - Built-in rate-limiting, custom backoff delays, retry policies, and timeout handlers.
      - Respects robots.txt directives and extracts URLs from `sitemap.xml` automatically.
   2. **Path Filtering (Inclusions/Exclusions)**:
      - Restrict audits using wildcards (e.g. `/blog/*` or `*.html`).
      - Block admin sections or static resource patterns.
   3. **Deep Redirect Hop & Loop Tracking**:
      - Manual redirection handling intercepts 3xx responses.
      - Traces complete redirect chains (statusCode and hops) and catches circular redirect loops.
4. **Unified Structured Data & Entity Graph Auditor**:
   - Compiles Schema.org JSON-LD, Microdata, RDFa elements from raw source HTML and Playwright rendering.
   - Stitches nodes into an Entity Graph, resolves referencing pointers deeply, and maps DAG layouts safely.
   - Evaluates E-E-A-T markers (sameAs links pointing to Wikipedia/Wikidata/LinkedIn).
   - Cross-checks schema values (price, title, canonical URL) against HTML headers, canonicals, and OpenGraph/Twitter card tags.
5. **Crawl Graph & Link Authority Analysis**:
   - Computes in-degree, out-degree, and custom authority scores (PageRank style).
   - Flags orphan pages and structural dead ends.
6. **AI Visibility & LLM Crawler Directives Auditor**:
   - Evaluates brand visibility and structured indexing across search engines, chatbots, and AI crawlers.
   - Strictly validates crawlability configurations (robots.txt, sitemaps).
   - Audits `llms.txt` and `/.well-known/llms.txt` rules for GPTBot, ClaudeBot, PerplexityBot, and Google-Extended.
7. **Mobile SEO Scorer & Evaluator**:
   - Evaluates mobile usability (viewport meta, responsive layouts, navigation toggle detection, tap targets).
   - Scores mobile performance (simulated Core Web Vitals including throttled mobile LCP, mobile CLS, JS payload and requests).
   - Verifies responsive design quality (CSS media queries, fluid layouts, standard mobile breakpoints).
   - Audits mobile indexing readiness (content parity, structured data validity, mobile-first canonical configuration).
   - Enforces `isVerifiable()` guards and strict empty states (non-pass by default) under static crawls, capping unverified performance scores at 50 to ensure high scores require real runtime validation.
8. **Outbound Authority Links & Google Rank Checker**:
   - Analyzes backlink domains metrics (authority counts, referring domains, spam scores).
   - Verifies keywords visibility inside Google Top 10 Search Results via serpapi or headless browser automation.
9. **Competitive Site Comparer**:
   - Compares health metrics, performance budgets, metadata, and link structures across two different URLs or exported JSON audits.
10. **Optional Headless Rendering**:
    - Boot Playwright to parse single-page apps (SPAs) that require client-side execution.
11. **Production-Ready Reporting**:
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

   The core CLI executable can be invoked using `npm run cli` or linked locally.

   #### 1. Initialize Configuration
   Generate a default `seocore.config.json` configuration file at your project root:
   ```bash
   npm run cli -- config:init
   ```

   #### 2. Run a Site Audit
   Audit a website's landing page (default standard preset):
   ```bash
   npm run cli -- audit https://example.com
   ```

   Export audit as HTML report:
   ```bash
   npm run cli -- audit https://example.com --format html --output ./seocore-report.html
   ```

   #### 3. Deep Multi-Page Audit
   Recursively crawl and audit up to 50 pages up to a depth of 3:
   ```bash
   npm run cli -- audit https://example.com --full --depth 3 --max-pages 50
   ```

   #### 4. Run Crawler Only
   Map site structure and list HTTP responses without executing SEO rules or scoring:
   ```bash
   npm run cli -- crawl https://example.com --depth 2 --max-pages 100
   ```

   #### 5. List SEO Validation Rules
   See all registered rules, severity levels, and category assignments:
   ```bash
   npm run cli -- rules:list
   ```

   #### 6. Analyze AI Visibility & Structure
   Evaluate search engine/chatbot discovery, metadata structure, citation readiness, and entity mapping:
   ```bash
   npm run cli -- ai-visibility https://example.com
   ```

   Output results in raw JSON:
   ```bash
   npm run cli -- ai-visibility https://example.com --json
   ```

   #### 7. Validate Schema.org Structured Data & Entity Graph
   Validate Schema.org JSON-LD, Microdata, and RDFa structures. Performs E-E-A-T trust audits, metadata integrity cross-checks, and builds dynamic visual entity graphs (DAG):
   ```bash
   npm run cli -- schema https://example.com
   ```

   Filter validation to specific schema types:
   ```bash
   npm run cli -- schema https://example.com --schema Article,Product
   ```

   Export schema validation in SARIF format:
   ```bash
   npm run cli -- schema https://example.com --format sarif --output ./schema-report.sarif
   ```

   #### 8. Check robots.txt Directives
   Verify robots.txt access rules, exclusions, and sitemap references:
   ```bash
   npm run cli -- robots https://example.com
   ```

   #### 9. Check sitemap.xml Coverage
   Analyze sitemap.xml and verify all linked URLs are reachable:
   ```bash
   npm run cli -- sitemap https://example.com --check-links
   ```

   #### 10. Audit LLMs Directives
   Verify `llms.txt` and `/.well-known/llms.txt` rules for AI crawlers like GPTBot, ClaudeBot, and PerplexityBot:
   ```bash
   npm run cli -- llms-txt https://example.com
   ```

   #### 11. Analyze Domain Backlinks
   Extract backlink profiles and analyze referring domain authority and spam scores:
   ```bash
   npm run cli -- backlinks https://example.com
   ```

   #### 12. Google Rank Checker
   Check if a target website ranks in Google's top 10 organic results for a given keyword:
   ```bash
   npm run cli -- rank-check "seo crawler" https://example.com
   ```

   #### 13. Compare Site Audits
   Compare SEO health scores, metadata differences, and performance metrics across two websites or audit files:
   ```bash
   npm run cli -- compare https://site-a.com https://site-b.com --focus technical
   ```

   ### SDK Integration

   Import SEOCore directly into your Node/TypeScript backend:

   ```typescript
   import { SeoEngine } from '@seocore/engine';
   import { EventBus } from '@seocore/sdk';

   // Initialize the real-time event bus
   const eventBus = new EventBus();

   eventBus.on('page:loaded', (data) => {
   console.log(`Crawled: ${data.url} | Status: ${data.statusCode}`);
   });

   // Run audit
   const engine = new SeoEngine(eventBus);
   const result = await engine.run('https://example.com', {
   preset: 'standard',
   maxPages: 10,
   maxDepth: 2,
   });

   console.log(`Overall Health Score: ${result.score}%`);
   ```

   ---

   ## ⚙️ Configuration

   Custom audits are defined via `seocore.config.json` or inline overrides.

   ### Configuration Schema

   | Option | Type | Default | Description |
   | :--- | :--- | :--- | :--- |
   | `preset` | `"quick" \| "standard" \| "deep" \| "enterprise"` | `"standard"` | Scrape profile adjusting page/depth depth limits. |
   | `concurrency` | `number` | `5` | Maximum simultaneous page crawl requests. |
   | `maxDepth` | `number` | `3` | Distance of steps allowed from seed landing URL. |
   | `maxPages` | `number` | `100` | Hard cap on total crawled pages per audit. |
   | `rateLimitMs` | `number` | `100` | Delay spacing between concurrent requests. |
   | `retryCount` | `number` | `2` | Number of crawl attempts on 5xx failures. |
   | `playwrightEnabled`| `boolean` | `false` | Enable Playwright headless rendering for SPAs. |
   | `excludePatterns` | `string[]` | `[]` | Glob/wildcard path list to bypass. |
   | `includePatterns` | `string[]` | `[]` | Glob/wildcard path list restricted for crawling. |
   | `ruleOverrides` | `object` | `{}` | Disable, override weight/severity for rules. |

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
