# Phase 3 — Rule Monolith Split + AI-Visibility Pipeline Unification

**Goal**: break `packages/rules/src/index.ts` (3598 lines, 41 classes) into focused module packages. Introduce `BaseRule` to kill boilerplate. Route AI-visibility through the rule pipeline instead of a CLI override.

**Prerequisite**: Phase 1 (de-dupe), Phase 2 (engine slim, plugin registry live, `dataSources` Map, backlink plugin extracted).

**Risk**: medium-high. Touches every rule. Mitigated by:
- Mechanical extraction (zero logic changes per rule)
- Per-rule snapshot parity test (input fixture → expected findings)
- 7 atomic PRs, one per new package

**Estimated diff**: `packages/rules` 3598 lines → ~50 line shim. Net repo gain ~600 lines of test surface; net code shrink ~410 lines (BaseRule absorbs boilerplate).

---

## Benefits summary

### Maintainability
- 3598-line monolith → 41 single-purpose files
- BaseRule kills ~10 lines × 41 rules = ~410 lines of boilerplate
- New rule = new file, zero merge conflict surface
- Test colocation: `mobile-performance.ts` + `mobile-performance.test.ts` next to each other

### Correctness
- `findingSeverityOverrides` (added to Zod in Phase 1) finally applied to all 41 rules, not only `SecurityHeadersRule`
- Tier `modules` activation map finally respected end-to-end (Phase 2 wired registry; Phase 3 tags each rule with its module)
- Single AI-visibility code path — no drift between CLI `runAiVisibility` and `AiExtractabilityRule` family
- Typed `subCheck` field replaces fragile `f.id.includes('missing-viewport')` string matching in scoring (`packages/scoring-core/src/mobile-scoring.ts` and similar)

### Performance
- Tree-shakeable per tier: `--tier fast` loads only `rules-core` (~5 modules), not all 41
- Cold start drop: enterprise audit parses all rules; fast audit currently does too (waste)
- Foundation for lazy module loading in Phase 5

### Extensibility
- Third-party rule packages drop in via plugin registry without touching core
- Per-rule capability declaration (`requires: ['playwright']`) means engine knows which rules to skip under HTTP-only crawl
- AI-visibility experiments isolated to one package

---

## 0. Pre-flight: snapshot before any changes

Without this, you can't verify mechanical extraction stays mechanical.

- [ ] Create `tests/fixtures/phase-3-baseline/` directory
- [ ] Capture pre-Phase-3 outputs (with Phases 1+2 merged):
  - [ ] `npm run cli -- audit https://example.com --tier fast --format json --output tests/fixtures/phase-3-baseline/fast.json`
  - [ ] `npm run cli -- audit https://example.com --tier standard --format json --output tests/fixtures/phase-3-baseline/standard.json`
  - [ ] `npm run cli -- audit https://example.com --tier deep --format json --output tests/fixtures/phase-3-baseline/deep.json` (skip if Playwright unavailable)
- [ ] Capture per-rule findings on a local HTML fixture (controlled DOM)
  - [ ] Add `tests/fixtures/canonical-page.html` (page with known title, meta, headings, images, canonical, robots, schema)
  - [ ] Build `tests/fixtures/expected-findings.json` by running each rule against it via vitest
- [ ] Commit these baseline fixtures **before any extraction work**
- [ ] Define equality rule for parity:
  - [ ] Findings must match **by `ruleId + url + subCheck`** ignoring `id` hash suffix (since BaseRule re-derives hashes)
  - [ ] `score` must match exactly
  - [ ] `categories[].score` must match exactly

---

## 1. Add `BaseRule` template + extend types

### 1.1 Extend `RuleDefinition` in `packages/sdk/src/index.ts:235-244`

- [ ] Add `module` field (matches `ModuleActivation` keys in `tier-config.ts`):
  ```ts
  export type RuleModule =
    | 'core'           // metadata, indexing, links, accessibility, seo (always loaded)
    | 'performance'
    | 'mobile'
    | 'ai_visibility'
    | 'security'
    | 'eeat'
    | 'hreflang'
    | 'backlinks';
  
  export interface RuleDefinition {
    id: string;
    name: string;
    description: string;
    category: Category;
    module: RuleModule;                                       // NEW (required)
    tier?: ExecutionTier[];                                   // NEW (optional override)
    requires?: ('playwright' | 'lighthouse' | 'network')[];   // NEW (optional)
    defaultSeverity: Severity;
    defaultWeight: number;
    documentationLink?: string;
  }
  ```

### 1.2 Extend `Finding` for typed sub-checks

- [ ] Add `subCheck?: string` to `Finding` interface in `packages/sdk/src/index.ts:92-102`:
  ```ts
  export interface Finding {
    id: string;
    ruleId: string;
    subCheck?: string;       // NEW — e.g. 'viewport', 'csp-unsafe-inline', 'lcp-poor'
    severity: Severity;
    category: Category;
    url: string;
    message: string;
    recommendation: string;
    evidence?: string;
    documentationLink?: string;
  }
  ```

### 1.3 Implement `BaseRule` in `packages/rule-utils/src/base-rule.ts`

- [ ] Create new file:
  ```ts
  import {
    Rule, RuleDefinition, RuleEvaluationContext, Finding,
    NormalizedPage, Severity,
  } from '@seocore/sdk';
  import { createFindingId, getRuleSettings, RuleSettings } from './finding-helpers.js';
  
  /**
   * Findings emitted by check() may omit derivable fields; BaseRule fills them.
   */
  export interface PartialFinding {
    url: string;
    subCheck?: string;
    message: string;
    recommendation: string;
    evidence?: string;
    severity?: Severity;  // optional override per sub-check
  }
  
  export abstract class BaseRule implements Rule {
    abstract definition: RuleDefinition;
    
    async evaluate(page: NormalizedPage, ctx: RuleEvaluationContext): Promise<Finding[]> {
      const settings = getRuleSettings(this.definition, ctx.config);
      if (!settings.enabled) return [];
      
      const partials = await this.check(page, ctx, settings);
      return partials.map(p => this.finalize(p, settings));
    }
    
    /** Subclasses implement only the actual detection logic. */
    protected abstract check(
      page: NormalizedPage,
      ctx: RuleEvaluationContext,
      settings: RuleSettings,
    ): Promise<PartialFinding[]>;
    
    private finalize(p: PartialFinding, s: RuleSettings): Finding {
      const finalSeverity =
        s.findingSeverityOverrides?.[`${this.definition.id}:${p.subCheck ?? ''}`]
        ?? p.severity
        ?? s.severity;
      
      return {
        id: createFindingId(this.definition.id, p.url, p.subCheck),
        ruleId: this.definition.id,
        subCheck: p.subCheck,
        severity: finalSeverity,
        category: this.definition.category,
        url: p.url,
        message: p.message,
        recommendation: p.recommendation,
        evidence: p.evidence,
        documentationLink: this.definition.documentationLink,
      };
    }
  }
  ```
- [ ] Extend `RuleSettings` in `packages/rule-utils/src/finding-helpers.ts` to include `findingSeverityOverrides?: Record<string, Severity>`
- [ ] Export `BaseRule` from `packages/rule-utils/src/index.ts`

### 1.4 Tests

- [ ] `packages/rule-utils/src/base-rule.test.ts`:
  - [ ] Disabled rule (override `enabled: false`) returns `[]` without calling `check()`
  - [ ] `check()` returning empty array yields zero findings
  - [ ] `severity` override resolves: subCheck-specific > rule-level > default
  - [ ] `findingSeverityOverrides['rule-id:sub-check']` matches correctly
  - [ ] `id` is deterministic for same `(ruleId, url, subCheck)`
  - [ ] `category` always taken from definition (subclass can't override)

---

## 2. Promote `packages/rules-core` as canonical home

`packages/rules-core/src/index.ts` already exists (stub from earlier refactor). Build it out.

### 2.1 Directory structure
- [ ] Create subdirectories:
  ```
  packages/rules-core/src/
    metadata/
      missing-title.ts          ← MissingTitleRule       (orig line 51)
      duplicate-title.ts        ← DuplicateTitleRule     (orig line 102)
      missing-meta-description.ts ← MissingMetaDescriptionRule (orig line 145)
      canonical-issues.ts       ← CanonicalIssuesRule    (orig line 407)
      social-meta.ts            ← SocialMetaRule         (orig line 2205)
    indexing/
      noindex.ts                ← NoIndexRule            (orig line 482)
      missing-structured-data.ts ← MissingStructuredDataRule (orig line 518)
      missing-robots-txt.ts     ← MissingRobotsTxtRule   (orig line 570)
      missing-sitemap-xml.ts    ← MissingSitemapXmlRule  (orig line 611)
    links/
      broken-links.ts           ← BrokenLinksRule        (orig line 304)
      orphan-page.ts            ← OrphanPageRule         (orig line 869)
      internal-linking.ts       ← InternalLinkingRule    (orig line 2586)
      internal-link-distribution.ts ← InternalLinkDistributionRule (orig line 3359)
      pagination-health.ts      ← PaginationHealthRule   (orig line 3301)
    accessibility/
      missing-h1.ts             ← MissingH1Rule          (orig line 196)
      multiple-h1.ts            ← MultipleH1Rule         (orig line 231)
      missing-alt-text.ts       ← MissingAltTextRule     (orig line 267)
    seo/
      content-quality.ts        ← ContentQualityRule     (orig line 2520)
      duplicate-content-similarity.ts ← DuplicateContentSimilarityRule (orig line 3407)
    rule-engine.ts              ← RuleEngine             (orig line 3492)
    index.ts
  ```

### 2.2 Per-rule mechanical extraction
For each rule above, the same recipe (one PR per category):

- [ ] Copy class from `packages/rules/src/index.ts` to new file
- [ ] Convert `implements Rule` → `extends BaseRule`
- [ ] Split `evaluate()` body:
  - [ ] Move guard `const { enabled, severity } = getRuleSettings(...)` → handled by BaseRule, delete
  - [ ] Move finding-construction to `return [{ url, subCheck, message, recommendation, evidence }]` (omit `id`, `ruleId`, `severity`, `category`, `documentationLink` — BaseRule fills)
  - [ ] Rename `evaluate` → `protected async check`
- [ ] Add `module: 'core'` to `definition`
- [ ] If rule has multiple branches emitting different finding types, assign `subCheck` strings: e.g. `MissingTitleRule` already differentiates "missing" vs "too-long" — use `subCheck: 'too-long'`
- [ ] Add unit test file next to it: `<rule-name>.test.ts`
- [ ] Update existing tests in `packages/rules/src/index.test.ts` that reference this rule to import from new path

### 2.3 Rebuild `RuleEngine` in `rule-engine.ts`
- [ ] Move `RuleEngine` class from `packages/rules/src/index.ts:3492-3597`
- [ ] Replace hardcoded `defaultRules` array with constructor injection:
  ```ts
  export class RuleEngine {
    private readonly rules: Rule[] = [];
    
    constructor(initialRules: Rule[] = []) {
      this.rules.push(...initialRules);
    }
    
    registerRule(rule: Rule): void { this.rules.push(rule); }
    registerRules(rules: Rule[]): void { this.rules.push(...rules); }
    
    getRules(config: SeoConfig, tierConfig?: ExecutionTierConfig): Rule[] {
      return this.rules.filter(rule => this.shouldRun(rule, config, tierConfig));
    }
    
    private shouldRun(rule: Rule, config: SeoConfig, tier?: ExecutionTierConfig): boolean {
      const { enabled } = getRuleSettings(rule.definition, config);
      if (!enabled) return false;
      if (!tier) return true;
      
      // NEW: module gate (Phase 3 enables this)
      const moduleKey = rule.definition.module === 'core' ? 'core' : rule.definition.module;
      if (rule.definition.module !== 'core' && !tier.modules[moduleKey as keyof ModuleActivation]) {
        return false;
      }
      
      // existing category gate
      if (!tier.ruleFilter.categories.includes(rule.definition.category)) return false;
      
      // existing severity gate
      const severityOrder: Severity[] = ['info', 'warning', 'error', 'critical'];
      if (severityOrder.indexOf(rule.definition.defaultSeverity)
          < severityOrder.indexOf(tier.ruleFilter.minSeverity)) return false;
      
      return true;
    }
    
    async run(/* unchanged signature */): Promise<Finding[]> { /* unchanged */ }
  }
  
  export function createDefaultRuleEngine(): RuleEngine {
    return new RuleEngine(getCoreRules());
  }
  
  export function getCoreRules(): Rule[] {
    return [
      new MissingTitleRule(), new DuplicateTitleRule(), new MissingMetaDescriptionRule(),
      new CanonicalIssuesRule(), new SocialMetaRule(),
      new NoIndexRule(), new MissingStructuredDataRule(),
      new MissingRobotsTxtRule(), new MissingSitemapXmlRule(),
      new BrokenLinksRule(), new OrphanPageRule(), new InternalLinkingRule(),
      new InternalLinkDistributionRule(), new PaginationHealthRule(),
      new MissingH1Rule(), new MultipleH1Rule(), new MissingAltTextRule(),
      new ContentQualityRule(), new DuplicateContentSimilarityRule(),
    ];
  }
  ```
- [ ] Update `packages/rules-core/src/index.ts` to export everything: rules + `RuleEngine` + `createDefaultRuleEngine` + `getCoreRules`

### 2.4 Engine wiring
- [ ] `packages/engine/src/index.ts:20` — replace `from '@seocore/rules'` with `from '@seocore/rules-core'`
- [ ] `packages/engine/src/index.ts:52` — replace `new RuleEngine()` with `createDefaultRuleEngine()`
- [ ] Add module-package auto-loading in `engine.run()` (extend Phase 2's `loadPluginsForTier` pattern):
  ```ts
  // After tier resolution, before rule engine runs:
  if (tierConfig?.modules.performance) {
    const { getPerformanceRules } = await import('@seocore/rules-performance');
    this.ruleEngine.registerRules(getPerformanceRules());
  }
  if (tierConfig?.modules.mobile) {
    const { getMobileRules } = await import('@seocore/rules-mobile');
    this.ruleEngine.registerRules(getMobileRules());
  }
  if (tierConfig?.modules.aiVisibility) {
    const { getAiVisibilityRules } = await import('@seocore/rules-ai-visibility');
    this.ruleEngine.registerRules(getAiVisibilityRules());
  }
  if (tierConfig?.modules.security !== false) {  // security on by default in all tiers
    const { getSecurityRules } = await import('@seocore/rules-security');
    this.ruleEngine.registerRules(getSecurityRules());
  }
  if (tierConfig?.modules.hreflang) {
    const { getHreflangRules } = await import('@seocore/rules-hreflang');
    this.ruleEngine.registerRules(getHreflangRules());
  }
  ```

---

## 3. Create `@seocore/rules-performance`

### 3.1 Package scaffold
- [ ] Create `packages/rules-performance/` with `package.json`, `tsconfig.json`, `src/`
- [ ] Dependencies: `@seocore/sdk`, `@seocore/rule-utils`
- [ ] Add to monorepo workspaces (already covered by `packages/*` glob)

### 3.2 Extract rules
- [ ] `low-performance-score.ts` ← `LowPerformanceScoreRule` (orig line 652) — set `module: 'performance'`, `requires: ['lighthouse']`
- [ ] `lcp-metric.ts` ← `LcpMetricRule` (orig line 702) — `module: 'performance'`, `subCheck: 'lcp-poor' | 'lcp-needs-improvement'`
- [ ] `cls-metric.ts` ← `ClsMetricRule` (orig line 753) — same pattern
- [ ] `resource-size.ts` ← `ResourceSizeRule` (orig line 804) — `subCheck: 'js-heavy' | 'css-heavy' | 'image-heavy' | 'page-heavy'`
- [ ] `image-optimization.ts` ← `ImageOptimizationRule` (orig line 3186) — `module: 'performance'`
- [ ] `caching-headers.ts` ← `CachingHeadersRule` (orig line 3134) — `module: 'performance'`

### 3.3 Entry point
- [ ] `packages/rules-performance/src/index.ts`:
  ```ts
  export * from './low-performance-score.js';
  export * from './lcp-metric.js';
  export * from './cls-metric.js';
  export * from './resource-size.js';
  export * from './image-optimization.js';
  export * from './caching-headers.js';
  
  export function getPerformanceRules(): Rule[] {
    return [
      new LowPerformanceScoreRule(),
      new LcpMetricRule(),
      new ClsMetricRule(),
      new ResourceSizeRule(),
      new ImageOptimizationRule(),
      new CachingHeadersRule(),
    ];
  }
  ```

### 3.4 Tests
- [ ] One test file per rule, asserting `check()` output for fixture inputs
- [ ] Package-level test: `getPerformanceRules()` returns 6 rules, all with `module === 'performance'`

---

## 4. Create `@seocore/rules-mobile`

### 4.1 Package scaffold
- [ ] `packages/rules-mobile/` scaffolded same as 3.1

### 4.2 Extract rules
- [ ] `mobile-usability.ts` ← `MobileUsabilityRule` (orig line 1374) — `module: 'mobile'`
- [ ] `mobile-performance.ts` ← `MobilePerformanceRule` (orig line 1549) — `module: 'mobile'`, `requires: ['playwright']` for full accuracy
- [ ] `mobile-responsive-design.ts` ← `MobileResponsiveDesignRule` (orig line 1753) — `module: 'mobile'`
- [ ] `mobile-indexing-readiness.ts` ← `MobileIndexingReadinessRule` (orig line 1855) — `module: 'mobile'`

### 4.3 Typed sub-checks (critical for scoring)
The mobile sub-scorer in `packages/scoring-core/src/mobile-scoring.ts` currently string-matches finding IDs (`f.id.includes('missing-viewport')` etc.). Phase 3 cleans this up.

- [ ] Define canonical sub-check IDs as const enum in `packages/rules-mobile/src/sub-checks.ts`:
  ```ts
  export const MOBILE_SUBCHECKS = {
    USABILITY_VIEWPORT_MISSING: 'usability-viewport-missing',
    USABILITY_VIEWPORT_INVALID: 'usability-viewport-invalid',
    USABILITY_INLINE_STYLES: 'usability-inline-styles',
    USABILITY_FIXED_WIDTH: 'usability-fixed-width',
    USABILITY_NO_NAV: 'usability-no-nav',
    USABILITY_POOR_NAV: 'usability-poor-nav',
    USABILITY_NO_TAP_TARGETS: 'usability-no-tap-targets',
    USABILITY_TAP_TARGET_ISSUE: 'usability-tap-target',
    PERF_LCP_POOR: 'perf-lcp-poor',
    PERF_LCP_NEEDS_IMPROVEMENT: 'perf-lcp-needs-improvement',
    PERF_LCP_UNVERIFIABLE: 'perf-lcp-unverifiable',
    PERF_CLS_POOR: 'perf-cls-poor',
    PERF_CLS_NEEDS_IMPROVEMENT: 'perf-cls-needs-improvement',
    PERF_CLS_UNVERIFIABLE: 'perf-cls-unverifiable',
    PERF_JS_EXCESSIVE: 'perf-js-excessive',
    PERF_JS_HEAVY: 'perf-js-heavy',
    PERF_JS_UNVERIFIABLE: 'perf-js-unverifiable',
    PERF_IMG_HEAVY: 'perf-img-heavy',
    PERF_IMG_NONE: 'perf-img-none',
    PERF_IMG_UNVERIFIABLE: 'perf-img-unverifiable',
    PERF_RENDER_BLOCKING: 'perf-render-blocking',
    PERF_UNVERIFIABLE: 'perf-unverifiable',
    RESPONSIVE_NO_MEDIA_QUERIES: 'responsive-no-media-queries',
    RESPONSIVE_NO_INLINE_STYLES: 'responsive-no-inline-styles',
    RESPONSIVE_FIXED_LAYOUT: 'responsive-fixed-layout',
    RESPONSIVE_NO_BREAKPOINTS: 'responsive-no-breakpoints',
    RESPONSIVE_BREAKPOINTS_UNVERIFIABLE: 'responsive-breakpoints-unverifiable',
    INDEXING_HIDDEN_CONTENT: 'indexing-hidden-content',
    INDEXING_MISSING_SCHEMA: 'indexing-missing-schema',
    INDEXING_MISSING_CANONICAL: 'indexing-missing-canonical',
    INDEXING_CANONICAL_MISMATCH: 'indexing-canonical-mismatch',
  } as const;
  ```
- [ ] Rules use these constants when emitting findings
- [ ] Update `packages/scoring-core/src/mobile-scoring.ts` to **read `finding.subCheck`** instead of `finding.id.includes(...)` — direct equality check, no string scanning
- [ ] Export `MOBILE_SUBCHECKS` from `rules-mobile/index.ts` so scoring-core can import it (or move to `sdk` if avoiding circular deps)

### 4.4 Entry + tests (mirrors §3.3, §3.4)

---

## 5. Create `@seocore/rules-ai-visibility` + unify AI pipeline

### 5.1 Audit existing AI logic
- [ ] Read `packages/cli/src/ai-visibility/index.ts` — capture exact granularity it produces (the breakdown returned to CLI override)
- [ ] Read `packages/analyzers/src/ai-citation-readiness.ts` (3307 bytes per ls) — analyzer used by both paths
- [ ] List which checks live in `runAiVisibility` but NOT in the 6 AI rule classes — these are the gaps to close

### 5.2 Package scaffold
- [ ] `packages/rules-ai-visibility/` scaffolded

### 5.3 Extract + enhance rules
- [ ] `ai-extractability.ts` ← `AiExtractabilityRule` (orig line 909)
- [ ] `ai-entity-clarity.ts` ← `AiEntityClarityRule` (orig line 997)
- [ ] `ai-citation-readiness.ts` ← `AiCitationReadinessRule` (orig line 1076)
- [ ] `ai-structural-organization.ts` ← `AiStructuralOrganizationRule` (orig line 1171)
- [ ] `ai-retrieval-friendliness.ts` ← `AiRetrievalFriendlinessRule` (orig line 1243)
- [ ] `ai-authority-signals.ts` ← `AiAuthoritySignalsRule` (orig line 1312)
- [ ] All set `module: 'ai_visibility'`

### 5.4 Close gaps from `runAiVisibility`
For each gap identified in 5.1:
- [ ] If gap is a check (e.g. "validates `/.well-known/llms.txt`"), add as new sub-check on the most relevant existing rule
- [ ] If gap is a whole category (e.g. dedicated llms.txt validation), add as new rule with `module: 'ai_visibility'`
- [ ] Each new sub-check gets a `MOBILE_SUBCHECKS`-style constant in `packages/rules-ai-visibility/src/sub-checks.ts`

### 5.5 Update CLI to use unified pipeline
- [ ] `packages/cli/src/index.ts` — the `audit` command's post-engine AI-vis override block (Phase 1 cleaned this; Phase 3 removes it entirely):
  - [ ] **Delete** the entire `aiVisBreakdown` post-processing block (whatever survived Phase 1)
  - [ ] `result.categories.ai_visibility.score` now comes from `ScoringEngine` directly via the unified AI rule findings
- [ ] `packages/cli/src/ai-visibility/index.ts` (the standalone command):
  - [ ] Replace internal analysis logic with: run `SeoEngine` at `tier=fast` with `modules.aiVisibility=true` + only AI category enabled
  - [ ] Output formatter consumes `result.categories.ai_visibility` + `result.findings.filter(f => f.category === 'ai_visibility')`
  - [ ] Public CLI command `seocore ai-visibility <url>` behavior unchanged for end users — exit code, JSON shape, terminal output all preserved
- [ ] Add `--module-only <module>` flag to `audit` (optional convenience) for running a single module without spinning a custom config

### 5.6 Update `scoring-core` AI sub-scoring
- [ ] Same treatment as mobile: `packages/scoring-core/src/ai-scoring.ts` reads `finding.subCheck` not `finding.id.includes(...)`

### 5.7 Entry + tests
- [ ] `getAiVisibilityRules()` returns all 6+
- [ ] Snapshot test: `seocore ai-visibility <fixture-url>` produces same terminal output as pre-Phase-3 (parity is the bar)

---

## 6. Create `@seocore/rules-security`

### 6.1 Package scaffold
- [ ] `packages/rules-security/` scaffolded

### 6.2 Extract rules
- [ ] `security-https.ts` ← `SecurityRule` (orig line 2394) — renamed for clarity, `module: 'security'`
- [ ] `security-headers.ts` ← `SecurityHeadersRule` (orig line 2653) — the big one, ~480 lines. Move as-is, no logic change. `module: 'security'`

### 6.3 Sub-check constants
`SecurityHeadersRule` is the **one rule that already uses `findingSeverityOverrides`**. Preserve its sub-check ID scheme verbatim; just document it:
- [ ] Add `packages/rules-security/src/sub-checks.ts` with all CSP/HSTS/etc constants matching what `packages/scoring-core/src/security-scoring.ts` (Phase 1) reads
- [ ] Verify Phase 1's `security-scoring.ts` reads from typed `subCheck` field (if Phase 1 used string-include, refactor now)

### 6.4 Entry + tests
- [ ] `getSecurityRules()` returns 2 rules
- [ ] Test: existing `seocore.config.json` `security-headers.findingSeverityOverrides['security-headers:missing-csp']: 'error'` still produces `severity: 'error'` finding (regression test for the Phase-1 schema fix actually wiring through)

---

## 7. Create `@seocore/rules-hreflang`

### 7.1 Package scaffold + extract
- [ ] `packages/rules-hreflang/` scaffolded
- [ ] `hreflang.ts` ← `HreflangRule` (orig line 2319), `module: 'hreflang'`

### 7.2 Note on EEAT
EEAT logic lives in `packages/analyzers/src/eeat-analyzer.ts`, **not as Rule classes**. Current `ContentQualityRule` (orig line 2520) covers some content quality but no dedicated EEAT rules exist.

Decision for Phase 3 (don't fabricate scope):
- [ ] **Keep EEAT as analyzer** for now (do NOT create `rules-eeat` package this phase)
- [ ] Route EEAT findings through the pipeline: `packages/cli/src/content/index.ts` already uses the analyzer; have it emit findings into `RuleEvaluationContext.dataSources.set('eeat', { status: 'ok', data: analysis })`
- [ ] Add a single `EeatScoreRule` in `rules-core/seo/` that reads `dataSources.get('eeat')` and emits findings with `subCheck: 'experience' | 'expertise' | 'authority' | 'trust'`
- [ ] Defer full EEAT rule split to a future phase if needed

### 7.3 Entry + tests
- [ ] `getHreflangRules()` returns 1 rule
- [ ] Test using `packages/analyzers/src/hreflang-validator.ts` fixtures

---

## 8. Engine + rule-utils cleanup

### 8.1 Update `packages/rules` to deprecation shim
- [ ] Replace `packages/rules/src/index.ts` (3598 lines) with re-export shim (~50 lines):
  ```ts
  /**
   * @deprecated Use @seocore/rules-core, @seocore/rules-performance, etc.
   * This shim preserves backward compat for one release.
   */
  export * from '@seocore/rules-core';
  export * from '@seocore/rules-performance';
  export * from '@seocore/rules-mobile';
  export * from '@seocore/rules-ai-visibility';
  export * from '@seocore/rules-security';
  export * from '@seocore/rules-hreflang';
  
  console.warn('[@seocore/rules] Deprecated — import from @seocore/rules-{module} instead');
  ```
- [ ] Mark `packages/rules/package.json` `"deprecated": "Use @seocore/rules-{module} packages"`

### 8.2 Remove inline duplicates
- [ ] Delete `packages/rules/src/index.ts` lines 5-44 (inline `createFindingId`, `getRuleSettings`, `hasConfiguredBacklinkSources`, `getPrimaryBacklinkPage`) — already in `rule-utils`, only existed because monolith couldn't depend on rule-utils cleanly

### 8.3 Verify no internal consumers left
- [ ] `rg "from '@seocore/rules'" packages/` — should only match the shim itself and tests; production code should import from specific module packages
- [ ] Migrate remaining direct consumers (e.g. `packages/cli/src/index.ts:9`, engine if any)

---

## 9. CLI cleanup (consumes Phase 3 outputs)

### 9.1 Remove AI-visibility override remnants
- [ ] `packages/cli/src/index.ts` — the `audit` command should NO LONGER post-process AI-visibility. Engine now emits proper findings; ScoringEngine handles the score.
- [ ] Remove `import { runAiVisibility } from './ai-visibility/index.js'` from the audit command path (the standalone `ai-visibility` command keeps its own thin wrapper, see §5.5)

### 9.2 Add `--module` flag for granular runs (optional, nice-to-have)
- [ ] `seocore audit <url> --module ai_visibility,mobile` — overrides tier's `modules` flags
- [ ] Useful for CI gates targeting one concern

---

## 10. Cross-cutting verification

### 10.1 Per-rule parity
- [ ] For each of the 41 rules, run the rule against the canonical HTML fixture (§0)
- [ ] Findings must equal expected by `(ruleId, url, subCheck, severity, message)` — full byte-equality except `id` hash (regenerated by BaseRule)
- [ ] Single test file `tests/parity/rules-parity.test.ts` automates this against `tests/fixtures/expected-findings.json`

### 10.2 Tier audit parity
- [ ] `npm run cli -- audit https://example.com --tier fast --format json` diff vs `tests/fixtures/phase-3-baseline/fast.json`:
  - [ ] `score` exact match
  - [ ] `categories[].score` exact match
  - [ ] `findings` length match
  - [ ] `findings` content match by `(ruleId, url, subCheck)` (sort both arrays first)
- [ ] Same for standard + deep tiers

### 10.3 `findingSeverityOverrides` regression test
- [ ] Add fixture `seocore.config.json` with overrides on FIVE different rules (one per module: core, performance, mobile, ai_visibility, security)
- [ ] Run audit, assert each rule's findings have the overridden severity
- [ ] **This is the key correctness improvement of Phase 3** — pre-Phase-3 only SecurityHeadersRule respected this; post-Phase-3 all rules do via BaseRule

### 10.4 Module gating regression test
- [ ] Run audit with custom `tierConfig.modules = { core: true, performance: false, mobile: false, aiVisibility: false, backlinks: false, hreflang: false }`
- [ ] Assert `result.findings.filter(f => f.category === 'performance').length === 0`
- [ ] Assert `result.findings.filter(f => f.category === 'mobile_seo').length === 0`
- [ ] Pre-Phase-3 this would fail (rules ran regardless of module flag, only category filter applied)

### 10.5 Build + test
- [ ] `npm run build` clean
- [ ] `npm test` green
- [ ] `npm run cli -- rules:list` lists 41+ rules (may grow if §5.4 gaps closed)
- [ ] `npm run cli -- tier:list` unchanged
- [ ] Manual smoke: every CLI command (`audit`, `crawl`, `content`, `ai-visibility`, `schema`, `robots`, `sitemap`, `llms-txt`, `backlinks`, `hreflang`, `rank-check`, `compare`, `screenshot`, `tier:list`, `rules:list`, `config:init`, `validate`) runs to completion

---

## 11. Commit / PR strategy

Seven PRs in dependency order. Each PR is small, focused, mergeable independently after PR 1:

- [ ] **PR 1**: `feat(sdk,rule-utils): add module + subCheck fields, BaseRule template` (§1)
- [ ] **PR 2**: `refactor(rules-core): extract metadata + indexing + links + accessibility + seo rules from monolith` (§2)
- [ ] **PR 3**: `feat(rules-performance): new package` (§3)
- [ ] **PR 4**: `feat(rules-mobile): new package + typed sub-checks in scoring-core` (§4)
- [ ] **PR 5**: `feat(rules-ai-visibility): new package, unify CLI pipeline, kill aiVisBreakdown override` (§5, §9.1)
- [ ] **PR 6**: `feat(rules-security): new package, preserve findingSeverityOverrides parity` (§6)
- [ ] **PR 7**: `feat(rules-hreflang): new package + EEAT-via-dataSources rule; deprecate @seocore/rules shim` (§7, §8)

Each PR must pass §10 parity tests for the rules it touches.

---

## Definition of Done

- [ ] `packages/rules/src/index.ts` reduced from 3598 lines to ~50-line deprecation shim
- [ ] `BaseRule` in `@seocore/rule-utils`; every rule extends it (verify via `rg "extends BaseRule" packages/rules-*/src/`)
- [ ] Six new rule packages exist: `rules-core`, `rules-performance`, `rules-mobile`, `rules-ai-visibility`, `rules-security`, `rules-hreflang`
- [ ] `RuleDefinition.module` field is required and populated on all 41 rules
- [ ] `Finding.subCheck` field used in all multi-branch rules
- [ ] `packages/scoring-core/src/mobile-scoring.ts` and `ai-scoring.ts` read `finding.subCheck` (typed), not `finding.id.includes(...)` (stringly-typed)
- [ ] `tierConfig.modules` gating works: setting `modules.performance = false` produces zero performance findings
- [ ] `findingSeverityOverrides` works for **all** rules, not just `SecurityHeadersRule` — regression test passes
- [ ] No `aiVisBreakdown`/`runAiVisibility` post-processing in CLI audit command — AI-vis is a normal pipeline citizen
- [ ] Standalone `seocore ai-visibility <url>` produces identical user-visible output as pre-Phase-3
- [ ] All §10 parity tests pass (score exact, findings equal by key)
- [ ] Build green, tests green, all 17 CLI commands functional
- [ ] No regression in any existing snapshot fixture

---

## Out of scope (deferred)

- **Phase 4**: CLI restructure — subcommands, shared option builders, command file split
- **Phase 5**: Move Playwright + Lighthouse + screenshots + rank-check to plugin packages
- **Phase 6**: Streaming pipeline (drop HTML post-rules), parallel rule execution per page, persistent crawl cache
- **Future**: Dedicated `@seocore/rules-eeat` package (Phase 3 uses analyzer + thin rule shim per §7.2). Promote to full package when EEAT logic grows

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mechanical extraction introduces logic drift | Medium | High | §10.1 per-rule parity test catches any behavioral change |
| `findingSeverityOverrides` now applying everywhere changes existing scores for users with overrides | Low | Medium | Existing `seocore.config.json` only overrides `security-headers` — no user impact. Document in CHANGELOG |
| `BaseRule.finalize` regenerates `id` differently than handcrafted ID | Medium | Low | Equality by `(ruleId, url, subCheck)` not by `id` string — `id` is opaque to consumers |
| Module-gating breaks consumers who relied on rules running regardless of tier | Low | Medium | Document the gate as bug-fix (Phase 3 is the FIRST time tier modules actually work); CHANGELOG note |
| AI-visibility unification changes the standalone command's exit code or JSON shape | Medium | High | §5.5 explicit snapshot test for `seocore ai-visibility` output |
| Sub-check string constants drift between rules package and scoring-core | Medium | Medium | Export constants from rules package; scoring-core imports them — single source of truth |
| Mobile/AI scoring becomes stricter when typed sub-checks replace fuzzy string matching | Medium | Medium | Scoring fixtures regenerated; document any score deltas in CHANGELOG |
| Circular dep between scoring-core and rules-mobile (both want sub-check constants) | Low | High | Move constants to `@seocore/sdk` if circularity appears |
| Plugin authors with custom `Rule` classes break on `RuleDefinition.module` being required | Medium | Medium | Mark `module` optional in SDK with default `'core'`; emit deprecation warning if absent |
| Deprecation shim `@seocore/rules` causes stale builds | Low | Low | Keep shim functional for one minor release; remove in 2.0 |
