# SEOCORE Compare Command Enhancement Roadmap

## Current Features
- Compare URLs or JSON audit files
- `--focus` flag (technical, content, ai-visibility)
- Custom site names with `--name1`/`--name2`
- Overall winner + category scores
- Structural differences (pages, depth, orphans)
- Key gaps and priority opportunities

---

## Enhancement Todo List

### High Priority
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 1. Add `--focus backlinks` | Compare backlink profiles (domain authority, link quality, anchor text) | `packages/reporter/src/compare.ts` | Medium |
| 2. Add export options | Export comparison results to JSON and HTML | `packages/cli/src/index.ts`, `packages/reporter/src/compare.ts` | Low |
| 3. Add historical comparison | Allow comparing a site against its own past audit (JSON file) | `packages/cli/src/index.ts`, `packages/reporter/src/compare.ts` | Low |
| 4. Improve gap priority scoring | Calculate ROI for fixes (score impact vs effort) | `packages/reporter/src/compare.ts` | Medium |

### Medium Priority
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 5. Add ASCII score chart | Visual side-by-side score comparison | `packages/reporter/src/compare.ts` | Low |
| 6. Add `--focus mobile` | Compare mobile SEO specifically | `packages/reporter/src/compare.ts` | Low |
| 7. Side-by-side page comparison | Audit and compare specific pages (e.g., `/home` vs `/home`) | `packages/cli/src/index.ts`, `packages/reporter/src/compare.ts` | Medium |
| 8. Add crawl throttle options for competitor | Add `--throttle` flag to avoid hitting competitor too hard | `packages/cli/src/index.ts` | Low |

### Low Priority
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 9. Add CSV export | Export comparison summary to CSV | `packages/reporter/src/compare.ts` | Low |
| 10. Add `--focus keyword` placeholder | Future-proof for keyword gap analysis (requires keyword data source) | `packages/cli/src/index.ts`, `packages/reporter/src/compare.ts` | Low |
| 11. Add competitive takeaway generator | Auto-generate actionable insights based on gaps | `packages/reporter/src/compare.ts` | Medium |

---

## Implementation Details

### 1. `--focus backlinks`
**What to add:**
- Compare backlink counts, domain authority, anchor text distributions
- Show backlink gaps: domains linking to competitor but not you
- Use existing `BacklinkIntelligenceData` from SDK

**Code change example in `packages/reporter/src/compare.ts`:**
```typescript
// After line 344, add a backlink comparison section
if (siteA.backlinkData && siteB.backlinkData) {
  console.log(pc.bold('BACKLINK GAP ANALYSIS:'));
  // Compare domain metrics, link quality, etc.
}
```

---

### 2. Export Options
**New flags:**
```bash
seocore compare <source1> <source2> --format json --output comparison.json
seocore compare <source1> <source2> --format html --output comparison.html
```

**Implementation:**
- Add `--format`/`--output` flags to compare command
- Create `CompareReporter.exportJson()` and `CompareReporter.exportHtml()` methods

---

### 3. Historical Comparison
**Example usage:**
```bash
# Compare current site vs past audit
seocore audit https://yoursite.com --format json --output today.json
# ... later ...
seocore compare today.json https://yoursite.com --name1 "Yesterday" --name2 "Today"
```

**Current support:** This already works! Just need better documentation and maybe a `--historical` alias/flag for clarity.

---

### 4. ASCII Score Chart
**Example output:**
```
CATEGORY PERFORMANCE COMPARISON
────────────────────────────────────────────────────
               Site A   Site B   Gap
────────────────────────────────────────────────────
Overall SEO      82       78      +4 ██████░░░
Performance      75       82      -7 ░░░█████
Indexing         90       85      +5 █████░░░░
```

**Implementation in `packages/reporter/src/compare.ts`:**
```typescript
private static printScoreChart(catScores: any) {
  // Generate ASCII bar chart
}
```

---

## Acceptance Criteria
- All existing compare functionality still works
- New features are backward-compatible
- New flags are documented in `--help`
- Exports validate against expected schemas

---

## Notes
- Follow existing code patterns in `compare.ts`
- Use `picocolors` for colored output
- Keep the CLI interface consistent with other commands
