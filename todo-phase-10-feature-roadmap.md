# Phase 10 — High-Value Product Features

**Goal**: add the next 5 product features that increase real-world utility, CI value, and future SaaS readiness without rewriting SEOCore. Keep changes incremental. Reuse current engine, rule system, graph analysis, and CLI structure.

**Priority order**:
1. Audit snapshots + diff (`--save`, `--diff`)
2. Explain + dry-run UX (`--dry-run`, `rules explain`, `tier explain`)
3. Schema graph explorer (`analyze schema-graph`)
4. Internal link planner (`analyze link-plan`)
5. Search opportunities (`analyze opportunities` with GSC/CrUX data hooks)

**Scope**:
- ship practical CLI-first workflows
- keep top-level architecture stable
- favor config + analysis additions over deep engine rewrites
- make each feature independently releasable

**Out of scope**:
- hosted dashboard
- full plugin marketplace UX
- daemon monitoring / background schedulers
- broad AI/LLM integrations beyond data hooks for future work

**Dependencies**:
- Phase 4 CLI restructure should be in good shape or near-complete
- current JSON export from `audit` must stay stable
- current crawl graph and rule metadata stay source-of-truth

**Risk**: medium. Biggest risk = adding too much surface area at once and creating CLI drift. Mitigation:
- build one feature at a time
- keep each feature behind explicit command/flag contract
- add fixture tests for CLI help and JSON output
- no hidden magic beyond well-defined defaults

---

## Success criteria

- [ ] `seocore audit <url> --save` stores reusable audit snapshot automatically
- [ ] `seocore audit <url> --diff` compares against latest saved snapshot for same URL
- [ ] `--diff --ci` fails only on defined regressions, not on improvements
- [ ] `seocore audit <url> --dry-run` shows planned tier/modules/rules/page budget without crawling
- [ ] `seocore rules explain <rule-id>` works
- [ ] `seocore tier explain <tier>` works
- [ ] `seocore analyze schema-graph <url>` explains entity graph relationships and broken references
- [ ] `seocore analyze link-plan <url>` produces actionable internal linking suggestions
- [ ] `seocore analyze opportunities <url>` works with no external provider configured and enriches output when data sources exist
- [ ] README updated with examples for every shipped feature

---

## Build order

1. Audit snapshots + diff
2. Explain + dry-run
3. Schema graph explorer
4. Internal link planner
5. Search opportunities

Reason:
- diff provides immediate CI/user value and creates baseline/history foundation
- explain/dry-run reduces confusion before adding more CLI surface
- schema graph explorer reuses analyzers already in repo and surfaces hidden value fast
- link planner reuses existing crawl graph
- opportunities depends on stable diff/reporting/data-source patterns

---

## Workstream 1 — Audit snapshots + diff

### Goal
Turn one-off audits into comparable snapshots with very low-friction CLI UX.

### Product contract

- [ ] Support:
  ```bash
  seocore audit <url> --save
  seocore audit <url> --diff
  seocore audit <url> --save --diff
  seocore audit <url> --diff --ci
  ```
- [ ] `--save` means:
  - [ ] run normal audit
  - [ ] save JSON snapshot automatically
  - [ ] generate file name from normalized host + timestamp
- [ ] `--diff` means:
  - [ ] run normal audit
  - [ ] load latest saved snapshot for same normalized URL/host
  - [ ] compare current result to saved snapshot
  - [ ] print human-readable diff summary
- [ ] `--save --diff` means:
  - [ ] compare current run against previous snapshot
  - [ ] save current run as newest snapshot after diff completes
- [ ] `--diff --ci` means:
  - [ ] fail with non-zero exit code on regression
  - [ ] do not fail on improvements-only runs
- [ ] clear error if `--diff` requested and no saved snapshot exists

### Storage contract

- [ ] Pick default snapshot directory:
  - [ ] `./.seocore/history/` if running inside project
  - [ ] allow override via env var `SEOCORE_HISTORY_DIR`
- [ ] Use safe directory scheme:
  ```text
  .seocore/history/
    example.com/
      2026-05-27T20-45-00Z.json
      2026-05-28T09-15-00Z.json
  ```
- [ ] Save metadata fields:
  - [ ] `url`
  - [ ] `host`
  - [ ] `savedAt`
  - [ ] `cliVersion`
  - [ ] `tier`
  - [ ] `snapshotPath`
- [ ] Save full `AuditResult` payload in JSON

### Diff contract

- [ ] Define regression rules for MVP:
  - [ ] score decreased
  - [ ] category score decreased
  - [ ] new `critical` or `error` findings
  - [ ] existing finding severity increased
- [ ] Define improvement rules:
  - [ ] score increased
  - [ ] findings resolved
  - [ ] severity reduced
- [ ] Ignore pure timestamp/config noise in diff
- [ ] Compare findings by stable key:
  - [ ] `ruleId`
  - [ ] `url`
  - [ ] `subCheck`
- [ ] Output summary sections:
  - [ ] `BASELINE`
  - [ ] `SCORE DELTA`
  - [ ] `NEW ISSUES`
  - [ ] `FIXED ISSUES`
  - [ ] `SEVERITY CHANGES`
  - [ ] `CATEGORY DELTAS`

### Tasks

- [ ] Create `packages/cli/src/history/`
- [ ] Add `packages/cli/src/history/path-utils.ts`
- [ ] Add `packages/cli/src/history/snapshot-store.ts`
- [ ] Add `packages/cli/src/history/diff.ts`
- [ ] Add `packages/cli/src/history/reporter.ts`
- [ ] Extend `packages/cli/src/commands/audit.ts`:
  - [ ] `--save`
  - [ ] `--diff`
  - [ ] optional `--history-dir <path>`
- [ ] Add helper to resolve latest snapshot for URL
- [ ] Add helper to write snapshot atomically
- [ ] Add regression exit-code logic under `--ci`
- [ ] Add tests:
  - [ ] save snapshot path generation
  - [ ] no-baseline error path
  - [ ] new finding regression detection
  - [ ] resolved finding improvement detection
  - [ ] `--save --diff` updates newest snapshot correctly
- [ ] Update README examples

### Acceptance criteria

- [ ] first `--save` run succeeds without asking for filename
- [ ] second `--diff` run compares to latest snapshot for same URL automatically
- [ ] diff output easy to scan in terminal
- [ ] CI fails on genuine regressions only

---

## Workstream 2 — Explain + dry-run UX

### Goal
Reduce user confusion around tiers, rules, and what a command will do before it starts crawling.

### Product contract

- [ ] Support:
  ```bash
  seocore audit <url> --dry-run
  seocore rules explain <rule-id>
  seocore tier explain <tier>
  ```
- [ ] `--dry-run` prints:
  - [ ] resolved tier
  - [ ] enabled modules
  - [ ] expected crawler type
  - [ ] page/depth/concurrency limits
  - [ ] number of active rules
  - [ ] output format targets
- [ ] `rules explain` prints:
  - [ ] rule name
  - [ ] category
  - [ ] module
  - [ ] default severity
  - [ ] default weight
  - [ ] tier support
  - [ ] short description
  - [ ] documentation link if present
- [ ] `tier explain` prints:
  - [ ] crawl settings
  - [ ] module activation
  - [ ] scoring settings summary
  - [ ] intended use case

### Tasks

- [ ] Add `packages/cli/src/commands/rules/explain.ts`
- [ ] Add `packages/cli/src/commands/tier/explain.ts`
- [ ] Extend `packages/cli/src/commands/audit.ts` with `--dry-run`
- [ ] Add helper `packages/cli/src/shared/explain.ts`
- [ ] Expose stable rule metadata lookup from active rule registry
- [ ] Ensure `--dry-run` uses resolved config path and tier merging logic, but does not crawl
- [ ] Add tests:
  - [ ] `audit --dry-run` prints resolved modules
  - [ ] `rules explain missing-title` works
  - [ ] unknown rule id returns clear error
  - [ ] `tier explain deep` output stable
- [ ] Update README examples

### Acceptance criteria

- [ ] users can inspect planned work without running audit
- [ ] users can understand a rule without reading source files
- [ ] tier behavior visible directly from CLI

---

## Workstream 3 — Schema graph explorer

### Goal
Turn existing structured-data extraction into a first-class analysis command that shows entity relationships, broken references, and schema completeness clearly.

### Product contract

- [ ] Support:
  ```bash
  seocore analyze schema-graph <url>
  seocore analyze schema-graph <url> --format json
  seocore analyze schema-graph <url> --format html
  seocore analyze schema-graph <url> --format mermaid
  ```
- [ ] Output sections:
  - [ ] `ENTITY SUMMARY`
  - [ ] `GRAPH RELATIONSHIPS`
  - [ ] `BROKEN OR MISSING REFERENCES`
  - [ ] `SCHEMA COVERAGE`
- [ ] Graph output must show:
  - [ ] node type
  - [ ] node id / `@id` when present
  - [ ] outbound references
  - [ ] unresolved references
  - [ ] duplicate entity collisions

### Analysis contract

- [ ] Reuse existing schema extraction:
  - [ ] JSON-LD
  - [ ] Microdata
  - [ ] RDFa if already normalized
- [ ] Reuse existing graph stitching logic where possible
- [ ] Classify graph issues:
  - [ ] missing referenced entity
  - [ ] dangling `@id`
  - [ ] duplicate logical entity with conflicting fields
  - [ ] weakly connected graph / isolated nodes
  - [ ] important entity type missing expected relationships
- [ ] Prioritize common SEO entity types:
  - [ ] `Organization`
  - [ ] `WebSite`
  - [ ] `WebPage`
  - [ ] `Article`
  - [ ] `BreadcrumbList`
  - [ ] `Product`
  - [ ] `Person`

### Tasks

- [ ] Add `packages/cli/src/commands/analyze/schema-graph.ts`
- [ ] Add `packages/analyzers/src/schema-graph-report.ts`
- [ ] Reuse `schema-graph.ts`, `schema-validator.ts`, and `ontology-parser.ts` where possible
- [ ] Add renderer helpers:
  - [ ] terminal summary renderer
  - [ ] JSON serializer
  - [ ] Mermaid graph exporter
  - [ ] HTML report renderer
- [ ] Define result shape:
  ```ts
  interface SchemaGraphAnalysisResult {
    url: string;
    generatedAt: string;
    nodes: SchemaEntityNode[];
    edges: SchemaEntityEdge[];
    isolatedNodes: SchemaEntityNode[];
    unresolvedReferences: UnresolvedSchemaReference[];
    conflicts: SchemaEntityConflict[];
    coverage: SchemaCoverageSummary;
  }
  ```
- [ ] Add tests:
  - [ ] graph builds from valid JSON-LD fixture
  - [ ] unresolved `@id` reference reported
  - [ ] duplicate conflicting entities reported
  - [ ] Mermaid output stable
  - [ ] HTML export stable
- [ ] Update README examples

### Acceptance criteria

- [ ] command exposes schema graph value already hidden in analyzers
- [ ] broken references and entity collisions visible immediately
- [ ] output useful for debugging real schema problems, not raw JSON dumps

---

## Workstream 4 — Internal link planner

### Goal
Turn crawl graph metrics into actionable link recommendations instead of only diagnostic scores.

### Product contract

- [ ] Support:
  ```bash
  seocore analyze link-plan <url>
  seocore analyze link-plan <url> --top 20
  seocore analyze link-plan <url> --format json
  ```
- [ ] Output sections:
  - [ ] `ORPHAN PAGES`
  - [ ] `LOW-AUTHORITY PRIORITY PAGES`
  - [ ] `SUGGESTED INTERNAL LINKS`
  - [ ] `HIGH-LEVERAGE HUBS`
- [ ] Suggestions include:
  - [ ] source page
  - [ ] target page
  - [ ] why source chosen
  - [ ] suggested anchor text or anchor theme
  - [ ] confidence/priority score

### Heuristics

- [ ] prioritize orphan pages first
- [ ] prioritize commercially important URLs when detectable:
  - [ ] `/product`
  - [ ] `/service`
  - [ ] schema `Product` / `Service`
- [ ] choose sources with:
  - [ ] high authority
  - [ ] topic relevance
  - [ ] low outbound clutter
- [ ] avoid absurd suggestions:
  - [ ] self-links
  - [ ] duplicate exact source/target pairs
  - [ ] footer/nav utility pages as main recommendation unless no better source

### Tasks

- [ ] Add `packages/analyzers/src/link-plan.ts`
- [ ] Add `packages/cli/src/commands/analyze/link-plan.ts`
- [ ] Reuse `CrawlGraphBuilder` outputs
- [ ] Add simple content similarity heuristic:
  - [ ] title overlap
  - [ ] heading overlap
  - [ ] optional keyword overlap
- [ ] Define JSON output shape:
  ```ts
  interface LinkPlanResult {
    url: string;
    generatedAt: string;
    orphanPages: PlannedTarget[];
    priorityPages: PlannedTarget[];
    suggestions: LinkSuggestion[];
    hubs: HubSummary[];
  }
  ```
- [ ] Add tests:
  - [ ] orphan page gets at least one source suggestion
  - [ ] suggestions sorted by score
  - [ ] self-links excluded
  - [ ] JSON output stable
- [ ] Update README examples

### Acceptance criteria

- [ ] output feels actionable, not academic
- [ ] recommendations based on current crawl graph, not fabricated guesses
- [ ] command useful on medium-sized sites without custom setup

---

## Workstream 5 — Search opportunities

### Goal
Combine crawl findings with optional search-performance data so SEOCore can prioritize what matters most.

### Product contract

- [ ] Support:
  ```bash
  seocore analyze opportunities <url>
  seocore analyze opportunities <url> --format json
  seocore analyze opportunities <url> --with-gsc
  seocore analyze opportunities <url> --with-crux
  ```
- [ ] Command must still work with no external provider configured
- [ ] With no provider:
  - [ ] use crawl findings + heuristics only
  - [ ] still rank opportunities
- [ ] With provider:
  - [ ] enrich pages with impressions / CTR / position / field CWV where available

### Opportunity model

- [ ] Example opportunity types:
  - [ ] high-impression page with weak metadata
  - [ ] page ranking near page 1 with fixable on-page issues
  - [ ] strong content page blocked by poor internal linking
  - [ ] page with field CWV issue and high search visibility
  - [ ] important page missing structured data
- [ ] Define normalized output:
  ```ts
  interface SearchOpportunity {
    id: string;
    url: string;
    title?: string;
    type: 'metadata' | 'performance' | 'indexing' | 'internal-links' | 'schema' | 'content';
    priority: 'high' | 'medium' | 'low';
    reason: string;
    supportingMetrics: Record<string, number | string>;
    recommendedActions: string[];
  }
  ```

### Data-source foundation

- [ ] Reuse or extend existing data-source/plugin pattern
- [ ] Add interfaces for:
  - [ ] GSC page/query metrics
  - [ ] CrUX field CWV metrics
- [ ] Keep adapters optional:
  - [ ] no API key = no crash
  - [ ] unavailable provider = degrade gracefully

### Tasks

- [ ] Add `packages/analyzers/src/opportunities.ts`
- [ ] Add `packages/cli/src/commands/analyze/opportunities.ts`
- [ ] Add provider interfaces in appropriate package:
  - [ ] GSC normalized types
  - [ ] CrUX normalized types
- [ ] Add config support for provider settings if not already sufficient
- [ ] Add ranking heuristic:
  - [ ] visibility weight
  - [ ] issue severity
  - [ ] estimated business impact
  - [ ] ease-of-fix bias
- [ ] Add tests:
  - [ ] no-provider fallback
  - [ ] high-impression low-CTR page rises to top
  - [ ] performance opportunity uses field CWV when present
  - [ ] output stable in JSON
- [ ] Update README examples

### Acceptance criteria

- [ ] useful output even with no external integrations
- [ ] provider-enriched output clearly better, not required
- [ ] recommendations feel prioritized, not generic

---

## Shared implementation tasks

### CLI consistency

- [ ] every new command supports canonical output flags:
  - [ ] `--format`
  - [ ] `--output`
  - [ ] `--json` shortcut only if still part of existing contract
  - [ ] `--verbose` where applicable
- [ ] help text for new commands follows current CLI style

### SDK / types

- [ ] move new result interfaces into stable location if reused across packages
- [ ] avoid `any` in new command handlers
- [ ] keep JSON outputs versionable

### Testing

- [ ] add per-command smoke tests
- [ ] add JSON snapshot tests for new outputs
- [ ] add regression fixtures for diff engine

### Documentation

- [ ] update README command list if new subcommands added
- [ ] add examples for each feature
- [ ] mention limitations and non-goals explicitly

---

## Definition of done

- [ ] all 5 features work from CLI end-to-end
- [ ] no existing audit/crawl behavior regressed
- [ ] outputs documented and tested
- [ ] snapshot/diff semantics predictable
- [ ] schema graph feature surfaces existing analyzer value cleanly
- [ ] new features feel additive, not bloated
