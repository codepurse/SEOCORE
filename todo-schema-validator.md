# SEOCORE Schema.org Validator Command Todo List

## Current Capabilities
- [PageNormalizer](file:///d:/Project/SEOCORE/packages/analyzers/src/index.ts#L144-L156) already extracts JSON-LD structured data
- Rules already check basic presence and JSON syntax (see [packages/rules/src/index.ts#L520-L566](file:///d:/Project/SEOCORE/packages/rules/src/index.ts#L520-L566))

---

## Todo List

### Phase 1: Core Validator (High Priority)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 1. Create Schema.org validator class | Build validator that uses Schema.org spec (JSON-LD + schema.org vocabulary) | `packages/analyzers/src/schema-validator.ts` | High |
| 2. Add `validate` CLI command | Add command to `packages/cli/src/index.ts` | `packages/cli/src/index.ts` | Low |
| 3. Implement terminal reporter | Colored output with schemas found, errors, warnings | `packages/cli/src/validate/reporter.ts` | Low |
| 4. Add JSON export | Support `--json` and `--output` flags | `packages/cli/src/validate/reporter.ts` | Low |
| 5. Add `--schema` flag | Filter validation to specific schema types (e.g., `--schema Article,Product`) | `packages/cli/src/index.ts` | Low |

### Phase 2: Enhanced Features (Medium Priority)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 6. Add Google-specific rich snippet checks | Validate against Google's rich snippets requirements | `packages/analyzers/src/schema-validator.ts` | Medium |
| 7. Add `--fix` hint mode | Suggest fixes for common schema issues | `packages/cli/src/validate/reporter.ts` | Medium |
| 8. Add `--deep` flag | Validate all pages on the site (not just the landing page) | `packages/cli/src/index.ts` | Medium |
| 9. Add HTML export | Generate HTML report with schema visualizations | `packages/cli/src/validate/reporter.ts` | Low |

### Phase 3: Advanced (Low Priority)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 10. Add Schema.org API integration | Use schema.org API for up-to-date vocab | `packages/analyzers/src/schema-validator.ts` | Medium |
| 11. Add microdata/RDFa support | Validate non-JSON-LD structured data | `packages/analyzers/src/index.ts`, `packages/analyzers/src/schema-validator.ts` | Medium |
| 12. Add schema comparison | Compare your schema against competitor schemas | `packages/cli/src/index.ts` | Medium |

---

## Implementation Details

### 1. Schema.org Validator Class
**File:** `packages/analyzers/src/schema-validator.ts`

**Key features:**
- Validate required fields per schema type
- Validate property names (no typos)
- Validate property types (ISO dates, URLs, etc.)
- Validate schema.org vocabulary compliance

**Example usage:**
```typescript
import { SchemaValidator } from '@seocore/analyzers';
const validator = new SchemaValidator();
const results = validator.validate(page.structuredData);
```

---

### 2. `validate` CLI Command
**CLI usage:**
```bash
# Basic validation
seocore validate https://example.com

# Filter by schema type
seocore validate https://example.com --schema Article,Product,FAQPage

# Export to JSON
seocore validate https://example.com --json --output schema-report.json

# Deep validation (all pages)
seocore validate https://example.com --deep
```

**Command definition in `packages/cli/src/index.ts`:**
```typescript
// After the other command definitions
program
  .command('validate')
  .description('Validate Schema.org structured data')
  .argument('<url>', 'Target URL')
  .option('--schema <types>', 'Filter to specific schema types (comma-separated)')
  .option('--json', 'Output raw JSON')
  .option('-f, --format <format>', 'Output format: terminal, json, html')
  .option('-o, --output <path>', 'Export to file')
  .option('--deep', 'Validate all pages (not just landing page)')
  .action(async (url, options) => {
    // Implementation
  });
```

---

### 3. Terminal Output Example
```
================================================================================
                       SCHEMA.ORG VALIDATION REPORT
================================================================================
Target: https://example.com
Checked: 2026-05-24T10:00:00Z

✅ Found 3 schemas:
  1. Product (valid)
  2. Article (⚠️ 2 warnings)
  3. FAQPage (❌ 1 error)

❌ FAQPage Issues:
  • Missing required field: mainEntity
  • Invalid property: "questionCount" (not a valid Schema.org property)

⚠️ Article Warnings:
  • Recommended field: author
  • datePublished should be ISO format (YYYY-MM-DD or ISO8601)

✅ Product:
  • All required fields present
  • Valid property types
```

---

## Acceptance Criteria
- Validates core Schema.org types: Article, Product, Organization, FAQPage, BreadcrumbList, etc.
- Checks required fields
- Checks valid property names/types
- Colored terminal output
- JSON export
- Backward-compatible (no breaking changes to existing commands)
- Follows existing code patterns (picocolors, commander, etc.)

---

## Notes
- Use existing PageNormalizer's structured data extraction
- Follow code patterns in other CLI commands (robots, sitemap, etc.)
- Consider using existing JSON-LD libraries if needed
