# SEOCore MVP-Ready Rule Implementation TODO

## Overview
Implement 5 new concrete, solid rules to make SEOCore scan MVP-ready and differentiated from competitors.

**Current Rules**: 36
**Target Rules**: 41 (+5 new)
**Estimated Implementation Time**: 2-3 hours
**Files to Modify**: 3-4

---

## New Rules to Implement

### 1. SecurityHeadersRule
**Priority**: High
**Category**: `security`
**Why**: Most competitors only check HSTS. We check full security suite.

**Checks**:
- [ ] CSP (Content-Security-Policy) header present and valid
- [ ] X-Frame-Options header (clickjacking protection)
- [ ] Referrer-Policy header (privacy/control)
- [ ] Cache-Control header (caching strategy)
- [ ] ETag header (bandwidth optimization)
- [ ] Strict-Transport-Security (HSTS) - already exists, consolidate

**Severity Mapping**:
- Missing CSP: `warning`
- Missing X-Frame-Options: `warning`
- Missing Referrer-Policy: `info`
- Missing Cache-Control: `info`
- Missing ETag: `info`

**Implementation File**: `packages/rules/src/security-headers-rule.ts`
**Test File**: `packages/rules/src/security-headers-rule.test.ts`

---

### 2. ImageOptimizationRule
**Priority**: High
**Category**: `performance`
**Why**: Concrete actionable checks beyond basic alt text.

**Checks**:
- [ ] Images missing width/height attributes (causes CLS)
- [ ] Images not using lazy loading (loading="lazy")
- [ ] Images not using modern formats (WebP/AVIF)
- [ ] Images exceeding size threshold (100KB+ without good reason)
- [ ] Missing srcset for responsive images
- [ ] Oversized images (display size vs actual size mismatch)

**Severity Mapping**:
- Missing dimensions: `warning`
- No lazy loading: `info`
- Not modern format: `info`
- Oversized (>100KB): `warning`
- Missing srcset: `info`

**Implementation File**: `packages/rules/src/image-optimization-rule.ts`
**Test File**: `packages/rules/src/image-optimization-rule.test.ts`

---

### 3. PaginationHealthRule
**Priority**: Medium-High
**Category**: `seo`
**Why**: Critical for e-commerce and large sites, often missed.

**Checks**:
- [ ] Pagination using rel=next/prev (or proper canonical)
- [ ] Infinite scroll without proper implementation
- [ ] View-all page canonicalization
- [ ] Pagination pages with unique content (not just list)
- [ ] Proper heading structure on paginated pages

**Severity Mapping**:
- Missing pagination signals: `warning`
- Infinite scroll issues: `info`
- View-all canonical issues: `warning`

**Implementation File**: `packages/rules/src/pagination-health-rule.ts`
**Test File**: `packages/rules/src/pagination-health-rule.test.ts`

---

### 4. InternalLinkDistributionRule
**Priority**: High
**Category**: `links`
**Why**: Our differentiator - graph theory approach to internal linking.

**Checks**:
- [ ] PageRank-style authority flow calculation
- [ ] Identify authority sinks (pages with high in-links, low out-links)
- [ ] Identify orphan pages with traffic potential
- [ ] Calculate internal link distribution score
- [ ] Detect pages with 0 internal links (true orphans)
- [ ] Suggest optimal linking structure

**Severity Mapping**:
- True orphan pages: `error`
- Authority sinks: `warning`
- Poor distribution: `info`

**Implementation File**: `packages/rules/src/internal-link-distribution-rule.ts`
**Test File**: `packages/rules/src/internal-link-distribution-rule.test.ts`

---

### 5. DuplicateContentSimilarityRule
**Priority**: Medium
**Category**: `seo`
**Why**: Beyond title matching - actual body content similarity.

**Checks**:
- [ ] Calculate body content similarity % between pages
- [ ] Identify near-duplicate pages (>80% similarity)
- [ ] Detect boilerplate content dominance
- [ ] Check for parameter-based duplicate content
- [ ] Identify print/mobile version duplicates

**Severity Mapping**:
- >90% similarity: `error`
- 80-90% similarity: `warning`
- High boilerplate %: `info`

**Implementation File**: `packages/rules/src/duplicate-content-similarity-rule.ts`
**Test File**: `packages/rules/src/duplicate-content-similarity-rule.test.ts`

---

## Implementation Steps

### Phase 1: Foundation (30 min)
- [ ] Create new `security` category in SDK types
- [ ] Update `ExecutionTierConfig` to include `security` in ruleFilter.categories
- [ ] Update all tier presets to include `security` category

### Phase 2: Rule Implementation (90 min)
- [ ] Implement `SecurityHeadersRule`
- [ ] Implement `ImageOptimizationRule`
- [ ] Implement `PaginationHealthRule`
- [ ] Implement `InternalLinkDistributionRule`
- [ ] Implement `DuplicateContentSimilarityRule`

### Phase 3: Integration (30 min)
- [ ] Register all new rules in `RuleEngine`
- [ ] Update `getRules()` to handle new `security` category
- [ ] Ensure tier filtering works with new rules

### Phase 4: Testing & Documentation (30 min)
- [ ] Write unit tests for each new rule
- [ ] Update README with new rules documentation
- [ ] Run full build and verify no errors
- [ ] Test with sample website

---

## Files to Modify

### Core Files
1. `packages/sdk/src/index.ts` - Add `security` to Category type
2. `packages/sdk/src/tier-config.ts` - Update tier presets
3. `packages/rules/src/index.ts` - Register new rules

### New Files
4. `packages/rules/src/security-headers-rule.ts`
5. `packages/rules/src/image-optimization-rule.ts`
6. `packages/rules/src/pagination-health-rule.ts`
7. `packages/rules/src/internal-link-distribution-rule.ts`
8. `packages/rules/src/duplicate-content-similarity-rule.ts`

### Test Files
9. `packages/rules/src/security-headers-rule.test.ts`
10. `packages/rules/src/image-optimization-rule.test.ts`
11. `packages/rules/src/pagination-health-rule.test.ts`
12. `packages/rules/src/internal-link-distribution-rule.test.ts`
13. `packages/rules/src/duplicate-content-similarity-rule.test.ts`

### Documentation
14. `README.md` - Update features and configuration

---

## Success Criteria

- [ ] All 5 new rules implemented and registered
- [ ] Build passes without errors
- [ ] Tests pass for all new rules
- [ ] Tier system correctly filters new rules
- [ ] README updated with new features
- [ ] Sample audit shows new findings

---

## Notes

- Keep rules focused and concrete
- Each finding must have actionable recommendation
- Use existing patterns from current rules
- Maintain backward compatibility
- Ensure tier filtering works correctly
