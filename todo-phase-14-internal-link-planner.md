# Phase 14 — Internal Link Planner

**Goal**: upgrade the existing `seocore analyze link-plan <url>` MVP into a production-grade internal linking planner that turns crawl graph data into ranked, actionable source -> target recommendations.

**Important framing**:
- this is **site-level analysis**
- output is a list of **page-level internal linking recommendations**
- this is not backlink analysis
- this does not replace crawl graph scoring
- this takes graph diagnostics and turns them into "add these links here"

**Current state in repo**:
- `packages/cli/src/commands/analyze/link-plan.ts` already exists
- `packages/analyzers/src/link-plan.ts` already exists
- `packages/cli/src/commands/analyze/index.ts` already registers `link-plan`
- current MVP supports:
  - terminal output
  - JSON file export
  - `--top`
  - `--full`
  - `--depth`
  - `--max-pages`
- current analyzer already outputs:
  - `orphanPages`
  - `priorityPages`
  - `suggestions`
  - `hubs`

**What is missing today**:
- confidence scoring is shallow and mostly graph-shape based
- no numeric ranking beyond confidence sort
- no explicit dedupe/suppression for "source already links to target"
- topic matching is simple title/url overlap only
- utility/commercial classification is hardcoded pattern matching only
- no HTML export
- no summary counts or stable reporting contract beyond current JSON shape
- recommendations can be directionally right but not always strong enough for real implementation

**Scope**:
- harden existing feature
- keep CLI-first workflow
- use existing crawl graph fields before inventing new infra
- make recommendations more accurate and more explainable
- make output stable enough for downstream tooling and future UI

**Out of scope**:
- external backlink suggestions
- automatic CMS edits
- anchor text generation with LLMs
- content briefs
- cross-domain link planning
- revenue forecasting

**Risk**: medium. Main failure mode = generic or low-trust suggestions. Mitigation:
- keep ranking heuristics explicit
- show reasons and confidence inputs
- suppress weak/obvious bad recommendations
- add fixtures covering graph edge cases

---

## Success criteria

- [ ] `seocore analyze link-plan <url>` works end-to-end on medium sites
- [ ] command remains useful with crawl graph only
- [ ] orphan pages and underlinked priority pages are identified accurately
- [ ] suggested links are ranked and deduplicated cleanly
- [ ] planner avoids obvious junk suggestions:
  - [ ] self-links
  - [ ] utility-page spam
  - [ ] duplicate source -> target pairs
  - [ ] recommending links that already exist
- [ ] JSON output shape is stable and documented
- [ ] terminal output remains readable on medium-sized sites
- [ ] README includes examples and caveats

---

## Product contract

### Primary command

- [ ] Support:
  ```bash
  seocore analyze link-plan <url>
  seocore analyze link-plan <url> --format json
  seocore analyze link-plan <url> --format html
  seocore analyze link-plan <url> --top 20
  seocore analyze link-plan <url> --full
  ```

### Core behavior

- [ ] command performs site-level crawl/analysis
- [ ] output ranks **link recommendations**, not just weak pages
- [ ] each recommendation includes:
  - [ ] source page URL
  - [ ] target page URL
  - [ ] source title
  - [ ] target title
  - [ ] anchor theme
  - [ ] confidence
  - [ ] reason
  - [ ] ranking score
- [ ] planner must also output:
  - [ ] orphan pages
  - [ ] underlinked priority pages
  - [ ] strongest hubs

### CLI options

- [ ] Keep current flags:
  - [ ] `-f, --format <terminal|json|html>`
  - [ ] `-o, --output <path>`
  - [ ] `-t, --top <number>`
  - [ ] `--full`
  - [ ] `-d, --depth <number>`
  - [ ] `-m, --max-pages <number>`
- [ ] Add:
  - [ ] `--min-confidence <n>`
  - [ ] `--max-suggestions-per-target <n>`
  - [ ] `--verbose`

---

## Output contract

### Terminal sections

- [ ] `INTERNAL LINK PLANNER`
- [ ] `ORPHAN PAGES`
- [ ] `LOW-AUTHORITY PRIORITY PAGES`
- [ ] `SUGGESTED INTERNAL LINKS`
- [ ] `HIGH-LEVERAGE HUBS`
- [ ] `SUMMARY`

### JSON shape

- [ ] Lock normalized shape:
  ```ts
  interface PlannedTarget {
    url: string;
    title?: string;
    depth: number;
    inDegree: number;
    isOrphan: boolean;
    reason: string;
    score?: number;
  }

  interface HubSummary {
    url: string;
    outDegree: number;
    inDegree: number;
    authorityScore: number;
  }

  interface LinkSuggestion {
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

  interface LinkPlanResult {
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
  ```

### Output rules

- [ ] every suggestion must have a reason
- [ ] every suggestion must have an anchor theme
- [ ] score/confidence must be deterministic for same input
- [ ] JSON keys must remain stable once shipped

---

## Planner model

### Core outputs

- [ ] `orphanPages`
  - pages with `isOrphan` or zero `inDegree`
- [ ] `priorityPages`
  - commercially important or important-entity pages with weak internal support
- [ ] `hubs`
  - strong source pages with high authority / link reach
- [ ] `suggestions`
  - source -> target actions ranked by confidence and score

### Do not stop at graph diagnostics

- [ ] avoid returning only "here are orphan pages"
- [ ] ensure final output tells user **where to add links from**
- [ ] ensure suggestions are implementation-ready enough for SEO/content teams

### Scoring inputs

- [ ] suggested inputs:
  - [ ] source authority
  - [ ] source in-degree
  - [ ] target orphan/underlinked status
  - [ ] target importance
  - [ ] topic similarity
  - [ ] source utility penalty
  - [ ] target already-linked penalty

---

## Current code audit

### Existing implementation to preserve/refactor

- [ ] `packages/cli/src/commands/analyze/link-plan.ts`
  - [ ] keep command name and current basic flags
  - [ ] reduce inline output logic
  - [ ] add stable report/export path handling
- [ ] `packages/analyzers/src/link-plan.ts`
  - [ ] keep exported analyzer entry point
  - [ ] split large file into focused modules
  - [ ] add score + suppression phase

### Known gaps from current code

- [ ] `findRelatedPages()` relies on title keyword overlap + URL overlap only
- [ ] `calculateLinkConfidence()` ignores whether source already links to target
- [ ] priority scoring is shallow:
  - [ ] depth
  - [ ] commercial URL pattern
  - [ ] title length
  - [ ] presence of structured data
- [ ] related-page confidence path uses partial fake `HubSummary` values
- [ ] no HTML output even though feature would benefit from it
- [ ] no summary counts
- [ ] no explicit suppression for very weak topic matches

---

## Workstream 0 — Freeze current behavior

### Goal
Capture current MVP behavior before refactor so useful output does not regress.

### Tasks

- [ ] Add fixtures for current link-plan JSON output
- [ ] Capture terminal output snapshot for:
  - [ ] small crawl
  - [ ] full crawl
- [ ] Record current exit behavior on:
  - [ ] invalid URL
  - [ ] empty crawl graph
  - [ ] no orphan pages
- [ ] Document current command help output

### Acceptance criteria

- [ ] current MVP behavior reproducible in tests before major refactor

---

## Workstream 1 — Normalize graph inputs

### Goal
Make analyzer consume crawl graph/page state in a cleaner, more explicit way.

### Tasks

- [ ] Create `packages/analyzers/src/link-plan/`
- [ ] Add `packages/analyzers/src/link-plan/types.ts`
- [ ] Add `packages/analyzers/src/link-plan/inputs.ts`
- [ ] Add helper to derive normalized page graph facts:
  - [ ] `depth`
  - [ ] `inDegree`
  - [ ] `outDegree`
  - [ ] `authorityScore`
  - [ ] `isOrphan`
  - [ ] `hasStructuredData`
  - [ ] `isCommercial`
  - [ ] `isUtility`
- [ ] Add fallback behavior when `crawlGraph` absent:
  - [ ] derive as much as possible from `NormalizedPage`
  - [ ] do not crash

### Acceptance criteria

- [ ] analyzer no longer mixes raw page objects with ad hoc graph assumptions
- [ ] graph fields normalized before ranking/suggestion logic

---

## Workstream 2 — Target discovery hardening

### Goal
Improve which pages get flagged as needing links.

### Tasks

- [ ] Keep orphan detection:
  - [ ] zero `inDegree`
  - [ ] explicit `isOrphan`
- [ ] Improve priority-page detection:
  - [ ] commercial URL patterns
  - [ ] structured data signals (`Product`, `Service`, `Article`)
  - [ ] shallow important pages with low in-degree
  - [ ] optionally root/category pages with weak support
- [ ] Add target score model:
  - [ ] orphan boost
  - [ ] commercial/entity boost
  - [ ] shallow-depth boost
  - [ ] low in-degree boost
  - [ ] utility-page penalty
- [ ] Prevent obvious junk targets:
  - [ ] `/terms`
  - [ ] `/privacy`
  - [ ] `/login`
  - [ ] `/search`

### Acceptance criteria

- [ ] target list better reflects pages worth strengthening
- [ ] utility pages stop dominating output

---

## Workstream 3 — Source page ranking hardening

### Goal
Improve which pages are suggested as sources.

### Tasks

- [ ] keep hub extraction from:
  - [ ] high `outDegree`
  - [ ] high `authorityScore`
- [ ] add source score model:
  - [ ] authority
  - [ ] in-degree
  - [ ] non-utility bonus
  - [ ] topical relevance
  - [ ] outlink saturation penalty
- [ ] avoid low-trust sources:
  - [ ] utility pages
  - [ ] pages with huge noisy nav/footer role if detectable
  - [ ] pages already overloaded with outbound links

### Acceptance criteria

- [ ] strongest, most contextually relevant pages rise as sources
- [ ] low-quality sources suppressed

---

## Workstream 4 — Suggestion generation quality

### Goal
Turn source/target ranking into trustworthy source -> target actions.

### Tasks

- [ ] Split suggestion generation into:
  - [ ] source selection
  - [ ] topic matching
  - [ ] duplicate suppression
  - [ ] existing-link suppression
  - [ ] confidence/score calculation
- [ ] Add explicit check:
  - [ ] if source already links to target, do not suggest again
- [ ] Add max suggestions per target
- [ ] Add max suggestions per source
- [ ] Keep separate pathways:
  - [ ] orphan rescue
  - [ ] priority page reinforcement
- [ ] Sort by numeric score, then confidence

### Acceptance criteria

- [ ] suggestion list feels intentional, not brute-force
- [ ] duplicate or obvious no-op links largely removed

---

## Workstream 5 — Topic relevance and anchor theme improvement

### Goal
Improve matching quality without needing embeddings or LLMs.

### Tasks

- [ ] replace pure title keyword overlap with richer relevance inputs:
  - [ ] title overlap
  - [ ] H1 overlap
  - [ ] H2 overlap
  - [ ] URL segment overlap
  - [ ] optional keyword/token overlap from page text if cheap
- [ ] upgrade anchor theme generation:
  - [ ] prefer cleaned target title
  - [ ] fallback to meaningful URL segment
  - [ ] avoid generic outputs like `Learn more` unless nothing better exists
- [ ] add `sourceSignals` to explain topic match:
  - [ ] shared title term
  - [ ] shared heading term
  - [ ] shared path segment

### Acceptance criteria

- [ ] topic matching less noisy than current title-only heuristic
- [ ] anchor themes feel usable by humans

---

## Workstream 6 — CLI + reporting hardening

### Goal
Make command feel consistent with rest of SEOCore CLI.

### Tasks

- [ ] refactor `packages/cli/src/commands/analyze/link-plan.ts`
- [ ] use shared output/validation helpers where available
- [ ] add HTML export path:
  - [ ] orphan cards
  - [ ] suggestion table
  - [ ] hub summary
- [ ] add `--min-confidence`
- [ ] add `--max-suggestions-per-target`
- [ ] add `--verbose`
- [ ] terminal output polish:
  - [ ] show top suggestions before long orphan lists if needed
  - [ ] show summary counts
  - [ ] cap long lists cleanly

### Acceptance criteria

- [ ] help text consistent with other analyze commands
- [ ] terminal output readable without excessive scrolling
- [ ] HTML export useful for sharing internally

---

## Workstream 7 — Tests

### Unit tests

- [ ] orphan target scoring
- [ ] priority-page scoring
- [ ] source page scoring
- [ ] topic relevance calculator
- [ ] existing-link suppression
- [ ] confidence/score calculator
- [ ] anchor theme generation

### Integration tests

- [ ] `seocore analyze link-plan <fixture-site>` with heuristics only
- [ ] empty graph fallback
- [ ] JSON output snapshot stable
- [ ] HTML output snapshot stable

### Ranking test cases

- [ ] orphan page gets at least one strong source suggestion
- [ ] underlinked commercial page gets promoted
- [ ] self-links excluded
- [ ] utility-page sources suppressed
- [ ] already-linked source -> target pair suppressed
- [ ] suggestions sorted by score deterministically

---

## Workstream 8 — Documentation

### Tasks

- [ ] update README analyze section
- [ ] document command examples:
  - [ ] basic run
  - [ ] top N suggestions
  - [ ] JSON export
  - [ ] HTML export
- [ ] add caveats:
  - [ ] planner suggests likely internal links, not guaranteed ranking gains
  - [ ] output depends on crawl coverage quality
  - [ ] command is best on content-rich or medium-size sites

---

## Suggested file structure

- `packages/analyzers/src/link-plan.ts` (thin export / compatibility wrapper)
- `packages/analyzers/src/link-plan/types.ts`
- `packages/analyzers/src/link-plan/inputs.ts`
- `packages/analyzers/src/link-plan/targets.ts`
- `packages/analyzers/src/link-plan/sources.ts`
- `packages/analyzers/src/link-plan/relevance.ts`
- `packages/analyzers/src/link-plan/anchors.ts`
- `packages/analyzers/src/link-plan/score.ts`
- `packages/analyzers/src/link-plan/suggestions.ts`
- `packages/cli/src/commands/analyze/link-plan.ts`

---

## Recommended build order

1. Freeze current behavior
2. Normalize graph inputs
3. Harden target discovery
4. Harden source ranking
5. Improve suggestion generation
6. Improve topic matching + anchor theme
7. Harden CLI/reporting
8. Docs and fixture coverage

---

## Definition of done

- [ ] existing MVP command upgraded, not broken
- [ ] target pages worth strengthening surfaced accurately
- [ ] suggestions are ranked, deduped, and actionable
- [ ] existing-link and obvious bad-link suppression works
- [ ] output useful to SEO/content teams without manual interpretation
- [ ] JSON shape stable
- [ ] command ready as action layer above crawl graph diagnostics
