# SEOCORE MVP Implementation Roadmap

## Phase 1: Quick Wins (Week 1-2)
**Goal:** Ship `llms-txt` command + CI mode/SARIF to make the tool immediately differentiated and CI-ready.

---

## Feature 1: `llms-txt` Command — AI Crawler Discovery Checker

### Why
`llms.txt` is becoming the `robots.txt` for AI crawlers (GPTBot, ClaudeBot, PerplexityBot). The existing `ai-visibility` fetcher already grabs `llms.txt` but does nothing with it. A dedicated command is a 2026 competitive differentiator no other SEO CLI has.

### CLI Design

```bash
seocore llms-txt <url> [options]

Options:
  --json                  Output raw JSON
  -f, --format <format>   Output format: terminal, json (default: terminal)
  -o, --output <path>     Export to file
  --check-bots <bots>     Comma-separated bot list (default: GPTBot,ClaudeBot,PerplexityBot,Google-Extended)
  --check-well-known      Also check /.well-known/llms.txt (default: true)
  --verbose               Show full directive parsing details
```

### Expected Output (Terminal)

```
==================================================
           LLMS.TXT CHECKER
==================================================
Target URL:     https://example.com
Checked At:     2026-05-24T10:00:00Z

LLMS.TXT DISCOVERY:
  /llms.txt           ✓ Found (HTTP 200, 1.2KB)
  /.well-known/llms.txt ✗ Not Found (HTTP 404)

DIRECTIVE SUMMARY:
  Total Sections:     3
  Total Allow Rules:  12
  Total Disallow Rules: 2

AI BOT ANALYSIS:
  ✓ GPTBot            Allowed /blog, /docs, /api
  ✓ ClaudeBot         Allowed /blog, /docs
  ✗ PerplexityBot     No explicit directive (falls through to *)
  ✓ Google-Extended   Allowed /blog

RECOMMENDATIONS:
  ⚠ PerplexityBot has no explicit rules. Add "User-agent: PerplexityBot" section.
  ⚠ /.well-known/llms.txt is missing. Consider adding for standards compliance.
```

### Expected Output (JSON)

```json
{
  "url": "https://example.com",
  "checkedAt": "2026-05-24T10:00:00Z",
  "discovery": {
    "llmsTxt": { "url": "https://example.com/llms.txt", "statusCode": 200, "found": true, "sizeBytes": 1200 },
    "wellKnownLlmsTxt": { "url": "https://example.com/.well-known/llms.txt", "statusCode": 404, "found": false }
  },
  "parsing": {
    "sections": 3,
    "totalAllowRules": 12,
    "totalDisallowRules": 2,
    "parseErrors": []
  },
  "botAnalysis": [
    { "bot": "GPTBot", "allowedPaths": ["/blog", "/docs", "/api"], "blockedPaths": [], "status": "allowed" },
    { "bot": "ClaudeBot", "allowedPaths": ["/blog", "/docs"], "blockedPaths": [], "status": "allowed" },
    { "bot": "PerplexityBot", "allowedPaths": [], "blockedPaths": [], "status": "implicit" },
    { "bot": "Google-Extended", "allowedPaths": ["/blog"], "blockedPaths": [], "status": "allowed" }
  ],
  "recommendations": [
    "PerplexityBot has no explicit rules. Add a 'User-agent: PerplexityBot' section.",
    "/.well-known/llms.txt is missing. Consider adding for standards compliance."
  ]
}
```

### Implementation Plan

| Step | Task | File(s) | Complexity |
|------|------|---------|------------|
| 1.1 | Create `LlmsTxtParser` class in `packages/crawler/src/` | `packages/crawler/src/llms-txt-parser.ts` | Low |
| 1.2 | Add `llms-txt` CLI command in `packages/cli/src/index.ts` | `packages/cli/src/index.ts` | Low |
| 1.3 | Create terminal formatter for llms-txt output | `packages/cli/src/llms-txt/reporter.ts` | Low |
| 1.4 | Add unit tests for parser edge cases | `packages/crawler/src/llms-txt-parser.test.ts` | Low |

### Parser Spec

The `llms.txt` format is robots.txt-like but with Markdown-friendly conventions:

```
# Example llms.txt

User-agent: GPTBot
Allow: /blog
Allow: /docs
Disallow: /admin

User-agent: ClaudeBot
Allow: /blog
Disallow: /private

# Default for all other AI crawlers
User-agent: *
Allow: /public
Disallow: /
```

**Parsing rules:**
- Lines starting with `#` are comments
- `User-agent:` starts a new section
- `Allow:` and `Disallow:` apply to the current section's user-agents
- Blank lines reset the current section (or are ignored)
- Case-insensitive matching for user-agent names
- Paths are literal prefix matches (like robots.txt)

---

## Feature 2: CI Mode + SARIF Export

### Why
Developers won't adopt a tool that doesn't fail CI builds on SEO regressions. SARIF is the standard format for GitHub Advanced Security, GitLab Code Quality, and Azure DevOps. This makes SEOCORE production-ready for engineering teams.

### CLI Design

```bash
seocore audit <url> --ci [options]

New Options:
  --ci                    Enable CI mode (no interactive prompts, non-zero exit codes)
  --fail-on <severities>  Comma-separated severities that trigger exit code 1 (default: critical,error)
  --budget-lcp <ms>       Largest Contentful Paint budget in ms
  --budget-cls <number>   Cumulative Layout Shift budget
  --budget-inp <ms>       Interaction to Next Paint budget in ms
  --budget-js <bytes>     Total JavaScript payload budget
  --format sarif          Export SARIF v2.1.0 format
  -o, --output <path>     Output file path for SARIF/JSON
```

### Exit Code Behavior

| Exit Code | Condition |
|-----------|-----------|
| 0 | Audit passed. No findings matching `--fail-on`. All budgets met. |
| 1 | Findings matching `--fail-on` severity were found. |
| 2 | Performance budget(s) exceeded. |
| 3 | Both findings AND budget violations. |
| 4 | Audit crashed (network error, invalid URL, etc.). |

### SARIF Output Structure

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": {
      "driver": {
        "name": "SEOCORE",
        "version": "1.0.0",
        "informationUri": "https://github.com/seocore/seocore",
        "rules": [
          {
            "id": "missing-meta-description",
            "name": "Missing Meta Description",
            "shortDescription": { "text": "Page is missing a meta description tag." },
            "fullDescription": { "text": "Meta descriptions are critical for CTR and indexing. Each page should have a unique, 120-160 character description." },
            "defaultConfiguration": { "level": "warning" },
            "helpUri": "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name/description"
          }
        ]
      }
    },
    "results": [
      {
        "ruleId": "missing-meta-description",
        "level": "warning",
        "message": { "text": "Page is missing a meta description tag." },
        "locations": [{
          "physicalLocation": {
            "artifactLocation": { "uri": "https://example.com/page" },
            "region": { "startLine": 1, "startColumn": 1 }
          }
        }],
        "fixes": [{
          "description": { "text": "Add a <meta name=\"description\" content=\"...\"> tag in the <head> section." }
        }]
      }
    ],
    "properties": {
      "seocore": {
        "overallScore": 72,
        "pagesAudited": 10,
        "categoryScores": {
          "indexing": 85,
          "metadata": 60,
          "performance": 78
        }
      }
    }
  }]
}
```

### Implementation Plan

| Step | Task | File(s) | Complexity |
|------|------|---------|------------|
| 2.1 | Add `SarifReporter` class in `packages/reporter/src/` | `packages/reporter/src/sarif.ts` | Medium |
| 2.2 | Add `--ci`, `--fail-on`, `--budget-*` flags to `audit` command | `packages/cli/src/index.ts` | Low |
| 2.3 | Implement CI mode logic (no prompts, exit codes) | `packages/cli/src/index.ts` | Low |
| 2.4 | Implement budget checking against `AuditResult` | `packages/cli/src/ci-budgets.ts` | Medium |
| 2.5 | Map SEOCORE rule definitions to SARIF `reportingDescriptor` | `packages/reporter/src/sarif.ts` | Medium |
| 2.6 | Add tests for exit code behavior | `packages/cli/src/ci.test.ts` | Low |

### SARIF Severity Mapping

| SEOCORE Severity | SARIF Level |
|------------------|-------------|
| critical | error |
| error | error |
| warning | warning |
| info | note |

### Budget Check Logic

```typescript
interface BudgetResult {
  metric: string;
  budget: number;
  actual: number;
  passed: boolean;
}

function checkBudgets(result: AuditResult, budgets: BudgetConfig): BudgetResult[] {
  const results: BudgetResult[] = [];
  
  if (budgets.lcp !== undefined) {
    const pagesWithLcp = Object.values(result.pages).filter(p => p.coreWebVitals);
    const avgLcp = pagesWithLcp.reduce((sum, p) => sum + (p.coreWebVitals?.lcp ?? 0), 0) / pagesWithLcp.length;
    results.push({ metric: 'LCP', budget: budgets.lcp, actual: avgLcp, passed: avgLcp <= budgets.lcp });
  }
  
  if (budgets.cls !== undefined) {
    const pagesWithCls = Object.values(result.pages).filter(p => p.coreWebVitals);
    const avgCls = pagesWithCls.reduce((sum, p) => sum + (p.coreWebVitals?.cls ?? 0), 0) / pagesWithCls.length;
    results.push({ metric: 'CLS', budget: budgets.cls, actual: avgCls, passed: avgCls <= budgets.cls });
  }
  
  if (budgets.inp !== undefined) {
    const pagesWithInp = Object.values(result.pages).filter(p => p.coreWebVitals);
    const avgInp = pagesWithInp.reduce((sum, p) => sum + (p.coreWebVitals?.inp ?? 0), 0) / pagesWithInp.length;
    results.push({ metric: 'INP', budget: budgets.inp, actual: avgInp, passed: avgInp <= budgets.inp });
  }
  
  if (budgets.js !== undefined) {
    const totalJs = Object.values(result.pages).reduce((sum, p) => sum + (p.resources?.jsSizeBytes ?? 0), 0);
    results.push({ metric: 'JS Payload', budget: budgets.js, actual: totalJs, passed: totalJs <= budgets.js });
  }
  
  return results;
}
```

---

## Phase 1 Task Checklist

### llms-txt Command
- [ ] 1.1 Create `LlmsTxtParser` with section-based directive parsing
- [ ] 1.2 Add `llms-txt` command to CLI with all flags
- [ ] 1.3 Implement terminal reporter with colored output
- [ ] 1.4 Implement JSON reporter
- [ ] 1.5 Add parser unit tests (comments, sections, wildcards, malformed)
- [ ] 1.6 Add integration test for full command

### CI Mode + SARIF
- [ ] 2.1 Create `SarifReporter` class with full SARIF v2.1.0 schema
- [ ] 2.2 Add `--ci` flag (disables interactive prompts, enables exit codes)
- [ ] 2.3 Add `--fail-on` flag with severity filtering
- [ ] 2.4 Add `--budget-lcp`, `--budget-cls`, `--budget-inp`, `--budget-js` flags
- [ ] 2.5 Implement budget checking logic
- [ ] 2.6 Implement exit code calculation
- [ ] 2.7 Map all 36 rules to SARIF `reportingDescriptor`
- [ ] 2.8 Add CI mode tests (exit codes, budget failures, SARIF output)
- [ ] 2.9 Update README with CI integration examples (GitHub Actions, GitLab CI)

---

## Acceptance Criteria

### llms-txt
- [ ] Command `seocore llms-txt https://example.com` runs without errors
- [ ] Parses `llms.txt` with multiple `User-agent` sections correctly
- [ ] Detects missing `llms.txt` and reports it
- [ ] Checks `/.well-known/llms.txt` automatically
- [ ] JSON output matches spec structure
- [ ] Terminal output is colored and readable

### CI Mode
- [ ] `seocore audit https://example.com --ci` never prompts interactively
- [ ] Exit code 0 when no critical/error findings and budgets pass
- [ ] Exit code 1 when findings match `--fail-on` severity
- [ ] Exit code 2 when performance budgets exceeded
- [ ] SARIF output validates against schema
- [ ] GitHub Actions workflow example works

---

## Notes

- Follow existing code patterns: `picocolors` for terminal colors, `commander` for CLI, `node-fetch` for HTTP
- The `llms.txt` parser should live in `packages/crawler/src/` alongside `SitemapParser`
- SARIF reporter should live in `packages/reporter/src/` alongside `JsonReporter` and `HtmlReporter`
- Both features should support `--output` for file export
- Keep changes backward-compatible: existing commands and flags must continue working
