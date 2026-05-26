# Phase 9: Keyword Intelligence Improvements

## Goal
Upgrade keyword research from autocomplete-style generator into structured SEO keyword intelligence system.

Focus areas:
- smarter clustering
- brand/entity junk removal
- volume/difficulty provider hooks

## Priority Order
1. Remove brand/entity junk
2. Make clustering smarter
3. Add volume/difficulty provider hooks

Reason:
- noisy keywords poison clusters
- better clustering only works after cleanup
- provider metrics matter most after topic structure stable

## Scope

### In Scope
- keyword cleanup and filtering
- smarter topic clustering
- intent-aware grouping improvements
- provider integration hooks for volume/difficulty/CPC
- richer scoring pipeline
- structured JSON/CSV/report output updates

### Out of Scope
- full external provider implementation for every vendor in one pass
- full UI/dashboard
- competitor gap analysis
- SERP feature scraping

## Workstream 1: Remove Brand / Entity Junk

### Goal
Remove or down-rank low-value navigational/entity noise so output becomes topic-led instead of organization-led.

### Tasks
- [ ] Add noise-filter module in `packages/cli/src/keyword-research/`
- [ ] Add normalization pass before scoring/clustering
- [ ] Detect brand/entity-heavy keywords:
  - company names
  - facility names
  - organization names
  - state/local agency names
  - provider directory entities
  - employer/job-board style entities
- [ ] Detect business suffix patterns:
  - `inc`
  - `llc`
  - `ltd`
  - `corp`
  - `company`
  - `hospital`
  - `foundation`
- [ ] Detect likely navigational patterns:
  - exact business names
  - business + reviews
  - business + address
  - business + phone
  - business + login
- [ ] Add `keywordNoiseScore()` heuristic instead of hard delete only
- [ ] Support both:
  - hard filter
  - soft down-rank
- [ ] Add allowlist behavior when brand is clearly part of seed intent
- [ ] Add CLI flags:
  - `--include-brands`
  - `--strict-noise-filter`

### Acceptance Criteria
- [ ] `behavioral health` no longer dominated by company/facility names
- [ ] commercial topic terms preserved
- [ ] branded seeds still keep relevant brand terms

### Test Cases
- [ ] `behavioral health`
- [ ] `mental health clinic`
- [ ] `nike shoes`
- [ ] `hubspot crm`

## Workstream 2: Make Clustering Smarter

### Goal
Group keywords into real SEO topic clusters instead of repeated single-word buckets or giant fallback groups.

### Tasks
- [ ] Split current logic into dedicated modules:
  - `intent-classifier.ts`
  - `noise-filter.ts`
  - `topic-extractor.ts`
  - `cluster-builder.ts`
  - `scorer.ts`
- [ ] Add phrase extraction:
  - unigram support
  - bigram support
  - repeated phrase detection
  - noun-like phrase grouping
- [ ] Prefer cluster labels from recurring phrases, not only single tokens
- [ ] Add semantic bucket rules for common SEO topics:
  - services
  - treatment
  - clinics
  - symptoms
  - disorders
  - costs
  - reviews
  - comparisons
  - local care
  - careers
- [ ] Merge near-duplicate clusters:
  - `clinic` / `clinics`
  - `provider` / `providers`
  - `service` / `services`
  - `treatment center` / `treatment centers`
- [ ] Add cluster quality scoring:
  - cohesion
  - avg keyword score
  - intent consistency
  - semantic tightness
- [ ] Add pillar-vs-supporting cluster distinction
- [ ] Reduce size of catch-all cluster
- [ ] Rebalance cluster ranking so strongest strategic clusters surface first

### Acceptance Criteria
- [ ] same-topic phrases land in same cluster
- [ ] `General extensions` cluster becomes small fallback only
- [ ] output feels like premium keyword research grouping

### Test Cases
- [ ] `behavioral health`
- [ ] `real estate crm`
- [ ] `car accident lawyer`
- [ ] `project management software`

## Workstream 3: Add Volume / Difficulty Provider Hooks

### Goal
Prepare system for real SEO metrics without making current heuristic workflow dependent on external APIs.

### Tasks
- [ ] Create provider interface:
  - `getKeywordMetrics(keywords, lang, country)`
- [ ] Define normalized metric shape:
  - `searchVolume`
  - `keywordDifficulty`
  - `cpc`
  - `competition`
  - `provider`
  - `fetchedAt`
- [ ] Add provider registry:
  - mock provider
  - DataForSEO adapter hook
  - Google Ads / Keyword Planner hook
  - Semrush hook
  - Ahrefs hook
- [ ] Add config support in config package:
  - provider selection
  - API key/env vars
  - locale
  - region
  - rate limit
- [ ] Add caching layer for provider responses
- [ ] Add retry and batching support
- [ ] Blend heuristic score with provider metrics into final priority model
- [ ] Extend exports:
  - JSON
  - CSV
  - terminal
- [ ] Make provider optional:
  - if configured -> enrich metrics
  - if missing -> fallback to heuristic scoring only

### Acceptance Criteria
- [ ] engine works with no provider configured
- [ ] provider-enriched output includes volume/difficulty/CPC fields
- [ ] final ranking can use real market data

### Test Cases
- [ ] mock provider integration
- [ ] fallback without provider
- [ ] provider timeout/failure handling

## Suggested File Structure
- `packages/cli/src/keyword-research/intent-classifier.ts`
- `packages/cli/src/keyword-research/noise-filter.ts`
- `packages/cli/src/keyword-research/topic-extractor.ts`
- `packages/cli/src/keyword-research/cluster-builder.ts`
- `packages/cli/src/keyword-research/scorer.ts`
- `packages/cli/src/keyword-research/providers/types.ts`
- `packages/cli/src/keyword-research/providers/index.ts`
- `packages/cli/src/keyword-research/providers/mock.ts`

## Recommended Build Order
1. Brand/entity junk removal
2. Smarter clustering
3. Provider hooks
4. Final scoring rebalance
5. Reporter/output polish

## Definition of Done
- [ ] output grouped by useful topic clusters
- [ ] search intent separation clearer
- [ ] brand/entity noise controlled
- [ ] keyword ranking feels business-aware
- [ ] provider hooks ready for real metrics
- [ ] JSON/CSV output stable and structured
