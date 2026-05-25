# Phase 1 — Architecture Cleanup: De-duplicate

**Goal**: kill drift from half-finished refactor. Single source of truth for scoring, schema, weights.
**Risk**: low. No features removed. No CLI commands changed. No SDK external signatures broken.
**Estimated diff**: ~340 lines deleted, ~6 added. Two latent bugs fixed.

---

## 1. Delete `packages/scoring`, migrate to `scoring-core`

### 1.1 Audit current state
- [ ] Confirm `packages/scoring-core/src/engine.ts` has full `ScoringEngine.calculate({ findings, pagesAudited, config, tierConfig, ruleDefinitions })` API
- [ ] Confirm `packages/scoring-core/src/mobile-scoring.ts` exists and is functional
- [ ] Confirm `packages/scoring-core/src/ai-scoring.ts` exists and is functional
- [ ] Diff old `packages/scoring/src/index.ts` against `scoring-core/engine.ts` — list any logic missing in new

### 1.2 Port missing sub-scorers
- [ ] Move mobile sub-score block (`packages/scoring/src/index.ts:116-309`) into `scoring-core/mobile-scoring.ts` as `calculateMobileScore(findings, pagesAudited): MobileSubScores`
- [ ] Create `packages/scoring-core/src/security-scoring.ts` with `calculateSecurityScore(findings, pagesAudited, floors): number` ported from `packages/scoring/src/index.ts:311-383`
- [ ] Wire mobile + security sub-scorers into `scoring-core/engine.ts` (call after base category loop, replace `categories.mobile_seo.score` + `categories.security.score`)
- [ ] Export both from `scoring-core/index.ts`

### 1.3 Switch engine import
- [ ] `packages/engine/src/index.ts:21` — change `from '@seocore/scoring'` to `from '@seocore/scoring-core'`
- [ ] `packages/engine/src/index.ts:289` — update call shape:
  ```ts
  const scoringResult = ScoringEngine.calculate({
    findings,
    pagesAudited: visited.size,
    config,
    tierConfig: tierConfig ?? TIER_PRESETS.standard,
    ruleDefinitions: ruleDefs,
  });
  ```
- [ ] Check `packages/engine/src/index.test.ts` — update any direct `ScoringEngine` imports/mocks

### 1.4 Switch CLI import
- [ ] Grep for `@seocore/scoring` across `packages/cli/src/**` — update each to `@seocore/scoring-core`
- [ ] Same for `packages/reporter/src/**` if present

### 1.5 Tests
- [ ] Port `packages/scoring/src/index.test.ts` to `packages/scoring-core/src/engine.test.ts`
- [ ] Add test: mobile sub-scoring produces same result as old engine for canonical fixture
- [ ] Add test: security sub-scoring same
- [ ] Add test: total weighted score matches old engine within ±1 point for standard tier fixture

### 1.6 Delete old package
- [ ] Delete `packages/scoring/` folder
- [ ] Remove `@seocore/scoring` from any `package.json` `dependencies` blocks (cli, engine, reporter)
- [ ] Run `npm install` to refresh workspace links
- [ ] Run `npm run build` — must succeed
- [ ] Run `npm test` — must pass

---

## 2. Fix Zod schema — `packages/config/src/index.ts`

### 2.1 Add missing fields
- [ ] Hoist `SeverityEnum`:
  ```ts
  const SeverityEnum = z.enum(['critical', 'error', 'warning', 'info']);
  ```
- [ ] Add `tier` to top-level `SeoConfigSchema`:
  ```ts
  tier: z.enum(['fast', 'standard', 'deep', 'enterprise']).optional(),
  ```
- [ ] Add `lighthouseEnabled`:
  ```ts
  lighthouseEnabled: z.boolean().default(false),
  ```
- [ ] Extend `ruleOverrides` inner shape with `findingSeverityOverrides`:
  ```ts
  z.object({
    enabled: z.boolean().optional(),
    severity: SeverityEnum.optional(),
    weight: z.number().min(1).max(10).optional(),
    findingSeverityOverrides: z.record(z.string(), SeverityEnum).optional(),
  })
  ```
- [ ] Replace inline severity enum at line 57 with `SeverityEnum` (DRY)

### 2.2 Wire `tier` into resolver
- [ ] `resolveConfig(partial, configFile)` — if `merged.tier`, map to tier preset and apply crawl settings BEFORE Zod parse (so file-level tier persists like CLI `--tier`)
- [ ] Ensure CLI `--tier` still overrides file `tier`

### 2.3 Update type
- [ ] Add `tier?: ExecutionTier` to `SeoConfig` interface in `packages/sdk/src/index.ts`
- [ ] Verify no breakage: `tsc --noEmit` per package

### 2.4 Tests
- [ ] Add `packages/config/src/index.test.ts` (if missing) with:
  - [ ] Round-trip: parse `seocore.config.json` → re-serialize → re-parse equal
  - [ ] `findingSeverityOverrides` survives parse (regression test for the silent-strip bug)
  - [ ] `tier: 'deep'` in file applies deep-tier crawl settings
  - [ ] `lighthouseEnabled: true` survives parse

### 2.5 Documentation
- [ ] Update README configuration table — add `tier`, `lighthouseEnabled`, `findingSeverityOverrides` rows
- [ ] Confirm `seocore.config.json` example in README shows `findingSeverityOverrides` correctly nested

---

## 3. Kill CLI weight duplicate — `packages/cli/src/index.ts:148-184`

### 3.1 Locate duplicate
- [ ] Confirm inline `CATEGORY_WEIGHTS` constant lives at `packages/cli/src/index.ts:160-170` inside `audit` command
- [ ] Confirm manual weighted-sum loop at `packages/cli/src/index.ts:172-180`

### 3.2 Replace with canonical scoring call
- [ ] Add import at top of `packages/cli/src/index.ts`:
  ```ts
  import { ScoringEngine } from '@seocore/scoring-core';
  ```
- [ ] Replace lines 148-184 with:
  ```ts
  let aiVisBreakdown: any = null;
  try {
    const { runAiVisibility } = await import('./ai-visibility/index.js');
    const aiVis = await runAiVisibility(url, { silent: true });
    aiVisBreakdown = aiVis.breakdown;

    if (aiVis && result.categories.ai_visibility) {
      // Override category score with the granular AI-vis result
      result.categories.ai_visibility.score = aiVis.score;
      result.categories.ai_visibility.totalDeductions =
        Math.round((100 - aiVis.score) * 10) / 10;

      // Re-aggregate using the SAME tier weights the audit used (no duplicate constants)
      const activeTier = tier ?? 'standard';
      const tierConfig = TIER_PRESETS[activeTier];
      const weights = tierConfig.scoring.categoryWeights;

      let weightedSum = 0;
      let weightTotal = 0;
      for (const cat of Object.keys(result.categories) as Category[]) {
        const w = weights[cat];
        if (w !== undefined) {
          weightedSum += result.categories[cat].score * w;
          weightTotal += w;
        }
      }
      result.score = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 100;
    }
  } catch {
    // Fail gracefully — keep base score
  }
  ```
- [ ] Note: mid-term (Phase 3) replace this entire block by emitting AI-vis as real findings and letting `ScoringEngine.calculate` handle aggregation natively. For Phase 1, just remove the duplicate constants.

### 3.3 Verify weight source
- [ ] Confirm `TIER_PRESETS.fast.scoring.categoryWeights` differs from standard — fast tier should now produce a different total score (currently CLI forces standard weights for every tier)
- [ ] Confirm `TIER_PRESETS[tier].scoring.categoryWeights` is the **only** weight constant referenced by CLI

### 3.4 Tests
- [ ] Add CLI integration test: run `audit --tier fast <fixture-url>` → verify total score uses fast-tier weights, not standard
- [ ] Snapshot test for audit pipeline against canonical fixture

---

## 4. Cross-cutting verification

- [ ] `npm run build` — clean
- [ ] `npm test` — all green
- [ ] Manual smoke: `npm run cli -- audit https://example.com --tier fast`
- [ ] Manual smoke: `npm run cli -- audit https://example.com --tier standard --format json`
- [ ] Manual smoke: `npm run cli -- audit https://example.com --tier deep` (skip if Playwright not installed)
- [ ] Manual smoke: `npm run cli -- tier:list` — confirm output unchanged
- [ ] Manual smoke: `npm run cli -- rules:list` — confirm rule count unchanged (41)
- [ ] Manual smoke: `npm run cli -- config:init` in a tmp dir — confirm generated config validates round-trip

---

## 5. Cleanup

- [ ] Move root-level debug artifacts to `.tmp/` or `tests/fixtures/`:
  - [ ] `audit.log`
  - [ ] `debug-google-results.html`
  - [ ] `debug-rank-checker.ts`
  - [ ] `test-*.json`, `test-*.ts`, `test-*.mjs`, `test-*.html` (root)
  - [ ] `seocore-report.html` (21MB!)
- [ ] Add to `.gitignore`:
  ```
  .tmp/
  *.log
  seocore-report.*
  debug-*
  test-audit-*.json
  test-content-report.*
  test-schema-report.*
  ```

---

## 6. Commit strategy

Three separate commits for clean review:

- [ ] `refactor(scoring): consolidate into scoring-core, delete scoring package`
- [ ] `fix(config): add missing tier, lighthouseEnabled, findingSeverityOverrides to Zod schema`
- [ ] `refactor(cli): remove duplicate CATEGORY_WEIGHTS, use tier scoring config`

---

## Definition of Done

- [ ] `packages/scoring/` no longer exists
- [ ] Engine, CLI, reporter all import from `@seocore/scoring-core`
- [ ] `seocore.config.json` with `findingSeverityOverrides` actually overrides finding severity at runtime (validated via test)
- [ ] `audit --tier fast` produces score weighted by fast-tier `categoryWeights`, not hardcoded standard weights
- [ ] No `CATEGORY_WEIGHTS` declared anywhere except `packages/sdk/src/tier-config.ts`
- [ ] Build green, tests green, smoke tests pass
- [ ] README config table updated

---

## Out of scope (future phases)

- Phase 2: extract PageRank + backlinks from engine
- Phase 3: split rules monolith into module packages, route AI-vis through Finding pipeline
- Phase 4: CLI restructure (subcommands, shared option builders)
- Phase 5: wire plugin manifest, move Playwright/Lighthouse to plugins
- Phase 6: streaming pipeline, parallel rules, crawl cache
