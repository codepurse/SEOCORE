# SEOCORE Hreflang Validator Command Todo List

## Current Capabilities
- [PageNormalizer](file:///d:/Project/SEOCORE/packages/analyzers/src/index.ts#L136-L145) already extracts hreflang tags from pages
- [HreflangRule](file:///d:/Project/SEOCORE/packages/rules/src/index.ts#L2318-L2390) already checks basic single-page issues (self-references, x-default, language codes)

---

## Todo List

### Phase 1: Core Command (High Priority)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 1. Create HreflangValidator class | Build validator that can check bidirectional links, site-wide consistency | `packages/analyzers/src/hreflang-validator.ts` | Medium |
| 2. Add `hreflang` CLI command | Add command to `packages/cli/src/index.ts` | `packages/cli/src/index.ts` | Low |
| 3. Implement terminal reporter | Colored output with hreflang network, errors, warnings | `packages/cli/src/hreflang/reporter.ts` | Low |
| 4. Add JSON export | Support `--json` and `--output` flags | `packages/cli/src/hreflang/reporter.ts` | Low |

### Phase 2: Enhanced Features (Medium Priority)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 5. Add broken URL check | Validate that alternate URLs return 200 OK | `packages/analyzers/src/hreflang-validator.ts` | Medium |
| 6. Add `--deep` flag | Validate hreflang across all pages on the site | `packages/cli/src/index.ts` | Medium |
| 7. Generate visual hreflang map | Create ASCII or Mermaid map of the hreflang network | `packages/cli/src/hreflang/reporter.ts` | Low |
| 8. Add HTML export | Generate human-readable HTML report | `packages/cli/src/hreflang/reporter.ts` | Low |

### Phase 3: Advanced (Low Priority)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 9. Sitemap integration | Check hreflang sitemap entries (if present) | `packages/analyzers/src/hreflang-validator.ts` | Medium |
| 10. Hreflang comparison | Compare against competitor hreflang structures | `packages/cli/src/index.ts` | Medium |

---

## Implementation Details

### 1. HreflangValidator Class
**File:** `packages/analyzers/src/hreflang-validator.ts`

**Key features:**
- **Bidirectional link check**: If /en/ links to /es/, does /es/ link back to /en/?
- **Site-wide consistency check**: Do all pages in the same language group have consistent tags?
- **Broken URL check**: Are alternate URLs reachable?
- **Language code validation**: Already handled by HreflangRule, but we can enhance it

**Example usage:**
```typescript
import { HreflangValidator } from '@seocore/analyzers';
const validator = new HreflangValidator();
const results = validator.validate(allPages);
```

---

### 2. `hreflang` CLI Command
**CLI usage:**
```bash
# Basic check on landing page
seocore hreflang https://example.com

# Check all pages on the site
seocore hreflang https://example.com --deep

# Filter to specific language
seocore hreflang https://example.com --lang en,es

# Export to JSON
seocore hreflang https://example.com --json --output hreflang-report.json
```

**Command definition in `packages/cli/src/index.ts`:**
```typescript
// After other command definitions
program
  .command('hreflang')
  .description('Validate hreflang tags')
  .argument('<url>', 'Target URL')
  .option('--deep', 'Validate all pages on the site')
  .option('--lang <codes>', 'Filter to specific languages (comma-separated)')
  .option('--json', 'Output raw JSON')
  .option('-f, --format <format>', 'Output format: terminal, json, html')
  .option('-o, --output <path>', 'Export to file')
  .action(async (url, options) => {
    // Implementation
  });
```

---

### 3. Terminal Output Example
```
================================================================================
                         HREFLANG VALIDATION REPORT
================================================================================
Target: https://example.com
Checked: 2026-05-25T10:00:00Z

🌍 HREFLANG NETWORK OVERVIEW:
  • en: https://example.com/en/
  • es: https://example.com/es/
  • fr: https://example.com/fr/
  • x-default: https://example.com/

⚠️ WARNINGS:
  • x-default is missing from /es/ and /fr/

❌ ERRORS:
  • /es/ does NOT link back to /en/ (bidirectional check failed)
  • /fr/ links to https://example.com/fr/404 (broken URL)

✅ OKAY:
  • All language codes are valid
  • /en/ links to all alternates and has self-reference
```

---

## Acceptance Criteria
- Checks bidirectional links
- Checks for x-default consistency
- Validates all language codes
- Validates that alternate URLs are reachable
- Colored terminal output
- JSON export
- Backward-compatible (no breaking changes)
- Follows existing code patterns (picocolors, commander, etc.)

---

## Notes
- Uses existing PageNormalizer's hreflang extraction
- Uses existing HttpCrawler for checking broken URLs
- Follows code patterns in robots, sitemap, etc. commands
