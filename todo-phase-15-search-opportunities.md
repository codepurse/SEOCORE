# Phase 15 — Search Opportunities

**Goal**: upgrade the existing `seocore analyze opportunities <url>` MVP into a production-grade prioritization feature that turns crawl findings and optional search-performance data into a ranked action list.

**Important framing**:
- this is **site-level analysis**
- output is a ranked list of **page-level opportunities**
- this does **not** replace enterprise audit
- this consumes crawl/audit data and turns it into "what should we fix first?"

**Current state in repo**:
- `packages/cli/src/commands/analyze/opportunities.ts` already exists
- `packages/analyzers/src/opportunities.ts` already exists
- `packages/cli/src/commands/analyze/index.ts` already registers `opportunities`
- current MVP supports:
  - terminal output
  - JSON file export
  - optional `--with-gsc --gsc-file <path>`
  - placeholder `--with-crux`
  - heuristic opportunities across:
    - metadata
    - performance
    - indexing
    - internal-links
    - schema
    - content

**What is missing today**:
- no provider abstraction
- CrUX path is stubbed, not implemented
- ranking is simple `high|medium|low`, no explicit score
- terminal output works, but output contract is not fully hardened
- command runs direct crawl/analyze path, but has limited config/reporting consistency
- data normalization for GSC/CrUX is thin
- duplicate or overlapping opportunities can surface per page
- no clear "business impact" ranking model

**Scope**:
- harden existing feature
- keep CLI-first workflow
- allow useful output with no external provider configured
- enrich output when GSC / CrUX data exists
- make output stable enough for CI, downstream tooling, and future UI

**Out of scope**:
- hosted dashboard
- direct OAuth login flow for GSC in this phase
- full competitor gap analysis
- keyword cannibalization engine
- revenue attribution modeling
- LLM-generated recommendations

**Risk**: medium-high. Main failure mode = generic or misleading prioritization. Mitigation:
- rank using explicit, explainable heuristics
- keep "reason" and metrics visible in output
- degrade gracefully when data providers absent
- add fixture-based tests for ranking edge cases

---

## Success criteria

- [ ] `seocore analyze opportunities <url>` works end-to-end with crawl heuristics only
- [ ] command remains useful without GSC or CrUX configured
- [ ] GSC-enriched runs produce clearly better prioritization than heuristic-only runs
- [ ] CrUX-enriched runs affect performance opportunity ranking when field CWV exists
- [ ] output explains **why** each page is prioritized
- [ ] opportunities are ranked, deduplicated, and grouped cleanly
- [ ] JSON output shape is stable and documented
- [ ] terminal output remains readable on medium-sized sites
- [ ] README includes realistic examples and caveats

---

## Product contract

### Primary command

- [ ] Support:
  ```bash
  seocore analyze opportunities <url>
  seocore analyze opportunities <url> --format json
  seocore analyze opportunities <url> --format html
  seocore analyze opportunities <url> --with-gsc --gsc-file ./gsc-pages.json
  seocore analyze opportunities <url> --with-crux
  seocore analyze opportunities <url> --full
  seocore analyze opportunities <url> --top 25
  ```

### Core behavior

- [ ] command performs site-level crawl/analysis
- [ ] output ranks **pages/opportunities**, not only raw findings
- [ ] each opportunity includes:
  - [ ] target page URL
  - [ ] opportunity type
  - [ ] priority
  - [ ] numeric score
  - [ ] reason summary
  - [ ] supporting metrics
  - [ ] recommended actions
- [ ] command can run in three data modes:
  - [ ] `heuristics`
  - [ ] `gsc`
  - [ ] `gsc + crux`

### CLI options

- [ ] Keep current flags:
  - [ ] `-f, --format <terminal|json|html>`
  - [ ] `-o, --output <path>`
  - [ ] `--with-gsc`
  - [ ] `--gsc-file <path>`
  - [ ] `--with-crux`
  - [ ] `--full`
  - [ ] `-d, --depth <number>`
  - [ ] `-m, --max-pages <number>`
- [ ] Add:
  - [ ] `--top <n>` limit shown/exported top items
  - [ ] `--min-priority <low|medium|high>`
  - [ ] `--data-mode <heuristics|gsc|hybrid>` optional override if needed
  - [ ] `--verbose` show ranking inputs and suppressed items

---

## Output contract

### Terminal sections

- [ ] `SEARCH OPPORTUNITIES`
- [ ] `DATA SOURCE`
- [ ] `HIGH PRIORITY`
- [ ] `MEDIUM PRIORITY`
- [ ] `LOW PRIORITY`
- [ ] `SUMMARY`

### JSON shape

- [ ] Lock normalized shape:
  ```ts
  interface SearchOpportunity {
    id: string;
    url: string;
    title?: string;
    type: 'metadata' | 'performance' | 'indexing' | 'internal-links' | 'schema' | 'content';
    priority: 'high' | 'medium' | 'low';
    score: number;
    reason: string;
    supportingMetrics: Record<string, number | string>;
    recommendedActions: string[];
    sourceSignals: string[];
  }

  interface OpportunitiesResult {
    url: string;
    generatedAt: string;
    dataSource: 'heuristics' | 'gsc' | 'gsc+crux';
    enrichedPages: number;
    scannedPages: number;
    opportunities: SearchOpportunity[];
    summary: {
      high: number;
      medium: number;
      low: number;
      byType: Record<SearchOpportunity['type'], number>;
    };
  }
  ```

### Output rules

- [ ] every opportunity must have at least one recommendation
- [ ] every opportunity must have a non-empty reason
- [ ] score must be deterministic for same input
- [ ] JSON keys must remain stable once shipped

---

## Opportunity model

### Opportunity types in MVP

- [ ] `metadata`
  - title / meta problems on visible pages
  - weak CTR opportunity when GSC available
- [ ] `performance`
  - poor CWV or resource-heavy pages with meaningful visibility
- [ ] `indexing`
  - pages with ranking potential but crawl/index blockers
- [ ] `internal-links`
  - orphan / weakly linked pages with value signals
- [ ] `schema`
  - important pages missing structured data or rich-result eligibility
- [ ] `content`
  - thin / mismatched / low-intent pages with ranking or CTR upside

### Do not turn this into raw findings dump

- [ ] collapse multiple low-level findings into one higher-level page opportunity where possible
- [ ] avoid one opportunity per finding unless truly necessary
- [ ] prefer "page needs metadata fix" over 4 nearly identical metadata items

### Priority model

- [ ] final priority determined by numeric score buckets
- [ ] suggested score inputs:
  - [ ] search visibility
  - [ ] issue severity
  - [ ] business importance
  - [ ] fix effort
  - [ ] confidence

---

## Current code audit

### Existing implementation to preserve/refactor

- [ ] `packages/cli/src/commands/analyze/opportunities.ts`
  - [ ] keep command name and existing basic flags
  - [ ] reduce inline file-loading and output logic
  - [ ] move data loading into dedicated helpers/modules
- [ ] `packages/analyzers/src/opportunities.ts`
  - [ ] keep exported analyzer entry point
  - [ ] split large file into focused modules
  - [ ] add numeric ranking and dedupe phase

### Known gaps from current code

- [ ] CrUX loader only warns and returns empty array
- [ ] GSC loader accepts loose JSON but has no normalized validation layer
- [ ] opportunities sort only by priority enum, not by score
- [ ] analyzer stores internal mutable maps; acceptable for MVP but should be cleaned up
- [ ] no HTML output even though feature would benefit from it
- [ ] no summary counts by type
- [ ] no suppression/merge strategy for overlapping page opportunities

---

## Workstream 0 — Freeze current behavior

### Goal
Capture what exists before refactoring so MVP behavior does not silently regress.

### Tasks

- [ ] Add fixtures for current opportunities JSON output
- [ ] Capture terminal output snapshot for:
  - [ ] no external data
  - [ ] GSC-enriched run
- [ ] Record current exit behavior on:
  - [ ] invalid URL
  - [ ] missing GSC file
  - [ ] empty crawl result
- [ ] Document current command help output

### Acceptance criteria

- [ ] current MVP behavior reproducible in tests before heavy refactor

---

## Workstream 1 — Normalize data sources

### Goal
Replace ad hoc data loading with explicit provider-normalization layer.

### Tasks

- [ ] Create `packages/analyzers/src/opportunities/`
- [ ] Add `packages/analyzers/src/opportunities/types.ts`
- [ ] Add `packages/analyzers/src/opportunities/providers.ts`
- [ ] Add `packages/analyzers/src/opportunities/normalizers.ts`
- [ ] Move `GscMetrics`, `CruxMetrics`, `PageSearchData` to stable analyzer submodule or sdk-facing location
- [ ] Add normalized provider shapes:
  ```ts
  interface NormalizedGscPageMetrics {
    url: string;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  }

  interface NormalizedCruxPageMetrics {
    url: string;
    lcp?: number;
    cls?: number;
    inp?: number;
  }
  ```
- [ ] Add GSC import normalizer:
  - [ ] accept array-based page exports
  - [ ] map `url | page | pageUrl`
  - [ ] validate numeric fields
  - [ ] skip malformed rows with warning count
- [ ] Add CrUX input contract:
  - [ ] local JSON import first
  - [ ] optional API adapter hook later
- [ ] Keep provider path optional:
  - [ ] no file / no provider = heuristics only
  - [ ] malformed file = warning, not crash

### Acceptance criteria

- [ ] GSC/CrUX inputs normalized before analyzer sees them
- [ ] malformed rows do not crash command
- [ ] provider data can be unit-tested separately from analyzer logic

---

## Workstream 2 — Ranking engine hardening

### Goal
Turn current heuristic list into deterministic, explainable ranking.

### Tasks

- [ ] Split `packages/analyzers/src/opportunities.ts` into:
  - [ ] `engine.ts`
  - [ ] `metadata.ts`
  - [ ] `performance.ts`
  - [ ] `indexing.ts`
  - [ ] `internal-links.ts`
  - [ ] `schema.ts`
  - [ ] `content.ts`
  - [ ] `score.ts`
  - [ ] `dedupe.ts`
- [ ] Add numeric score model, example dimensions:
  - [ ] visibility score
  - [ ] severity score
  - [ ] business-value score
  - [ ] ease-of-fix modifier
  - [ ] confidence modifier
- [ ] Map numeric score to priority:
  - [ ] `high`
  - [ ] `medium`
  - [ ] `low`
- [ ] Add `sourceSignals` array so each opportunity explains its inputs
- [ ] Add page opportunity dedupe:
  - [ ] collapse repeated metadata findings for same URL
  - [ ] collapse repeated indexing findings for same URL
  - [ ] keep distinct opportunity types separate
- [ ] Ensure final sort:
  - [ ] highest score first
  - [ ] tie-break by priority
  - [ ] tie-break by URL

### Acceptance criteria

- [ ] same input always yields same order
- [ ] high-value pages surface before low-value noise
- [ ] duplicate opportunities reduced substantially

---

## Workstream 3 — Opportunity heuristics by type

### Goal
Make each opportunity class more accurate and less generic.

### Metadata

- [ ] strengthen CTR-based opportunity logic:
  - [ ] high impressions + low CTR + metadata findings = high priority
  - [ ] avoid elevating pages with no visibility signal unless issue cluster is large
- [ ] add action synthesis:
  - [ ] missing title
  - [ ] weak / empty meta description
  - [ ] duplicate title patterns when detectable

### Performance

- [ ] prefer CrUX field data over heuristics when available
- [ ] use page resources/coreWebVitals when CrUX absent
- [ ] only high-prioritize performance issues on visible / important pages

### Indexing

- [ ] boost pages with strong visibility or strategic depth
- [ ] ensure canonical/noindex/robots issues map to clean action text
- [ ] suppress low-value utility pages when appropriate

### Internal links

- [ ] reuse crawl graph fields:
  - [ ] `isOrphan`
  - [ ] `inDegree`
  - [ ] `authorityScore`
  - [ ] `depth`
- [ ] promote orphan pages with impressions / conversions hints
- [ ] avoid over-prioritizing clearly low-value utility pages

### Schema

- [ ] use actual structured-data presence and page importance
- [ ] where possible infer likely schema need from URL/title/content pattern
- [ ] later hook into schema graph / validator output if available

### Content

- [ ] avoid naive `message.includes('content')` only
- [ ] use content-related findings more explicitly
- [ ] combine low CTR + ranking visibility + weak content signals for stronger opportunities

### Acceptance criteria

- [ ] each opportunity class has clearer, less noisy triggers
- [ ] recommendations feel page-specific, not template boilerplate

---

## Workstream 4 — CLI + reporting hardening

### Goal
Make command feel consistent with rest of SEOCore CLI.

### Tasks

- [ ] refactor `packages/cli/src/commands/analyze/opportunities.ts`
- [ ] use shared output/validation helpers where available
- [ ] add `--top <n>`
- [ ] add `--min-priority`
- [ ] add `--verbose`
- [ ] add HTML export path:
  - [ ] simple summary cards
  - [ ] grouped by priority
  - [ ] metrics table per opportunity
- [ ] terminal output polish:
  - [ ] show top opportunities first
  - [ ] show summary by type
  - [ ] cap long action lists cleanly

### Acceptance criteria

- [ ] command help consistent with other analyze commands
- [ ] terminal output readable without scrolling through noise
- [ ] HTML export useful for sharing internally

---

## Workstream 5 — Config and provider integration

### Goal
Prepare for richer data sources without making them mandatory.

### Tasks

- [ ] review whether provider config belongs in `packages/config/src/index.ts`
- [ ] if needed, add minimal opportunity-provider config:
  - [ ] `searchData.gscExportPath`
  - [ ] `searchData.cruxPath`
  - [ ] future provider fields
- [ ] keep command-line override behavior explicit
- [ ] do not require provider config for base command

### Acceptance criteria

- [ ] command works with zero extra config
- [ ] provider path can come from config or CLI

---

## Workstream 6 — Tests

### Unit tests

- [ ] GSC normalizer
- [ ] CrUX normalizer
- [ ] score calculator
- [ ] dedupe logic
- [ ] metadata opportunity scoring
- [ ] performance opportunity scoring
- [ ] internal-link orphan prioritization

### Integration tests

- [ ] `seocore analyze opportunities <fixture-site>` with heuristics only
- [ ] same command with GSC fixture
- [ ] same command with CrUX fixture
- [ ] invalid GSC file path warns and continues
- [ ] JSON output snapshot stable

### Ranking test cases

- [ ] high impressions + low CTR + metadata issues => top metadata opportunity
- [ ] page ranking near page 1 + indexing issue => high priority
- [ ] orphan page with impressions => high priority internal-links
- [ ] slow page with poor field CWV + visibility => high priority performance
- [ ] missing schema on important product-like page => medium/high priority schema opportunity

---

## Workstream 7 — Documentation

### Tasks

- [ ] update README analyze section
- [ ] document command examples:
  - [ ] heuristics only
  - [ ] with GSC file
  - [ ] with CrUX data
  - [ ] JSON export
  - [ ] HTML export
- [ ] add caveats:
  - [ ] opportunities are prioritization hints, not guaranteed ranking outcomes
  - [ ] external search data improves quality but is optional
  - [ ] command is site-level analysis with page-level recommendations

---

## Suggested file structure

- `packages/analyzers/src/opportunities.ts` (thin export / compatibility wrapper)
- `packages/analyzers/src/opportunities/types.ts`
- `packages/analyzers/src/opportunities/providers.ts`
- `packages/analyzers/src/opportunities/normalizers.ts`
- `packages/analyzers/src/opportunities/engine.ts`
- `packages/analyzers/src/opportunities/score.ts`
- `packages/analyzers/src/opportunities/dedupe.ts`
- `packages/analyzers/src/opportunities/metadata.ts`
- `packages/analyzers/src/opportunities/performance.ts`
- `packages/analyzers/src/opportunities/indexing.ts`
- `packages/analyzers/src/opportunities/internal-links.ts`
- `packages/analyzers/src/opportunities/schema.ts`
- `packages/analyzers/src/opportunities/content.ts`
- `packages/cli/src/commands/analyze/opportunities.ts`

---

## Recommended build order

1. Freeze current behavior
2. Normalize GSC/CrUX input
3. Add ranking score + dedupe
4. Harden heuristics per opportunity type
5. Improve CLI/reporting
6. Add config/provider polish
7. Docs and fixture coverage

---

## Definition of done

- [ ] existing MVP command upgraded, not broken
- [ ] opportunities are ranked by deterministic score
- [ ] GSC data materially improves prioritization
- [ ] CrUX path no longer stub-only
- [ ] output useful with and without providers
- [ ] JSON shape stable
- [ ] command ready to act as prioritization layer above enterprise audit
