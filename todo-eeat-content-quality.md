# SEOCORE E-E-A-T & Content Quality Command Todo List (MVP-Ready)

## Current SEOCORE Capabilities We'll Build On
- ✅ [SchemaOrgRule](file:///d:/Project/SEOCORE/packages/rules/src/index.ts#L278-L330) already checks for Organization/Person schema, sameAs links
- ✅ [AiVisibilityFetcher](file:///d:/Project/SEOCORE/packages/cli/src/ai-visibility/fetcher.ts) checks robots/llms.txt/sitemap
- ✅ [PageNormalizer](file:///d:/Project/SEOCORE/packages/analyzers/src/index.ts) extracts content, headings, links, and structured data
- ✅ [LinkAnalyzer](file:///d:/Project/SEOCORE/packages/analyzers/src/index.ts#L246-L352) already does authority and orphan page checks
- ✅ [BacklinksClient](file:///d:/Project/SEOCORE/packages/backlinks/src/index.ts) handles backlink intelligence
- ✅ [TerminalReporter](file:///d:/Project/SEOCORE/packages/reporter/src/terminal.ts) for consistent colored output
- ✅ [EventBus](file:///d:/Project/SEOCORE/packages/sdk/src/index.ts) for real-time progress

---

## Todo List

### Phase 1: Core MVP Command (P0 - Do This First)
| Task | Description | Files to Modify/Create | Complexity |
|------|-------------|------------------------|------------|
| 1. Create ContentAnalyzer class | Add readability scoring, keyword density, heading hierarchy analysis | `packages/analyzers/src/content-analyzer.ts` | Medium |
| 2. Create EeatAnalyzer class | Score Experience, Expertise, Authoritativeness, Trustworthiness | `packages/analyzers/src/eeat-analyzer.ts` | Medium |
| 3. Create AiCitationReadiness class | Check structured data completeness, citation signals | `packages/analyzers/src/ai-citation-readiness.ts` | Low |
| 4. Add `content` (or `eeat`) CLI command | Add top-level command to CLI | `packages/cli/src/index.ts` | Low |
| 5. Build terminal reporter | Colored, hierarchical output with breakdown by category | `packages/cli/src/content/reporter.ts` | Low |
| 6. Add JSON export | Support `--json`/`--format json`/`--output` flags | `packages/cli/src/content/reporter.ts` | Low |
| 7. Test end-to-end | Test on 2-3 sample sites to ensure MVP is working | - | Low |

### Phase 2: Enhancements (P1 - After MVP)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 8. Add `--deep` flag | Analyze all pages on the site (not just landing) | `packages/cli/src/index.ts` | Medium |
| 9. Add HTML reporter | Generate human-readable HTML report | `packages/cli/src/content/reporter.ts` | Low |
| 10. Integrate budget flags | Add `--budget-eeat`/`--budget-content` for CI | `packages/cli/src/index.ts` | Low |
| 11. Add category focus | `--focus experience,readability` for targeted checks | `packages/cli/src/index.ts` | Low |

### Phase 3: Advanced (P2 - Later)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 12. Add LLM analysis option | (Optional) Integrate with OpenAI/Anthropic for deeper content quality checks | `packages/analyzers/src/llm-content-analyzer.ts` | High |
| 13. Add keyword gap analysis | Compare content vs competitor keywords | - | Medium |

---

## Implementation Details

### 1. ContentAnalyzer Class
**File:** `packages/analyzers/src/content-analyzer.ts`

**Features to Implement:**
1. **Readability Scores** (Flesch-Kincaid Grade Level, Flesch Reading Ease)
2. **Keyword Density** (top 10 keywords, no stuffing checks)
3. **Content Structure Analysis** (heading hierarchy H1-H6, internal link density, paragraph length)
4. **Word Count & Content Length** checks

**Example Code Snippet:**
```typescript
export interface ContentAnalysis {
  readability: {
    fleschReadingEase: number;
    fleschKincaidGradeLevel: number;
  };
  keywords: Array<{ term: string; density: number; count: number }>;
  headings: { h1Count: number; h2Count: number; h3Count: number; hierarchy: boolean };
  wordCount: number;
  contentLengthScore: number; // 0-100
  internalLinkDensity: number;
}

export class ContentAnalyzer {
  analyze(html: string, normalizedPage: any): ContentAnalysis {
    // Implementation
  }

  // Helper functions for readability, keyword extraction, etc.
  private calculateReadability(text: string): { fleschReadingEase: number; fleschKincaidGradeLevel: number } { /* ... */ }
  private extractTopKeywords(text: string): Array<{ term: string; density: number; count: number }> { /* ... */ }
}
```

---

### 2. EeatAnalyzer Class
**File:** `packages/analyzers/src/eeat-analyzer.ts`

**Features to Implement (September 2025 Guidelines):**
| E-E-A-T Pillar | Checks |
|----------------|--------|
| **Experience** | First-hand experience signals (e.g., review schemas, product demo mentions, "I tested" language) |
| **Expertise** | Author bios, credentials (LinkedIn, university links), professional schema |
| **Authoritativeness** | Inbound authority links, backlink profile, domain authority signals |
| **Trustworthiness** | HTTPS, contact page, privacy policy, About Us page, Wikipedia/Wikidata links |

**Example Code Snippet:**
```typescript
export interface EeatAnalysis {
  overallScore: number; // 0-100
  pillars: {
    experience: number;
    expertise: number;
    authoritativeness: number;
    trustworthiness: number;
  };
  findings: Array<{ type: 'error' | 'warning' | 'success'; message: string; pillar: keyof EeatAnalysis['pillars'] }>;
}

export class EeatAnalyzer {
  async analyze(
    url: string,
    normalizedPage: any,
    crawlData?: any,
    backlinkData?: any,
  ): Promise<EeatAnalysis> {
    // Implementation
  }
}
```

---

### 3. AiCitationReadiness Class
**File:** `packages/analyzers/src/ai-citation-readiness.ts`

**Features to Implement:**
1. Check for structured data completeness (Product, Article, FAQPage, etc.)
2. Verify semantic HTML (citation-ready elements)
3. Check llms.txt presence and correct directives
4. Check clear attribution and authorship

**Example Code Snippet:**
```typescript
export interface AiCitationReadiness {
  score: number; // 0-100
  findings: Array<{ type: 'error' | 'warning' | 'success'; message: string }>;
}

export class AiCitationReadinessAnalyzer {
  analyze(normalizedPage: any, aiVisibilityData?: any): AiCitationReadiness {
    // Implementation
  }
}
```

---

### 4. CLI Command Definition
**File to Modify:** `packages/cli/src/index.ts`

**CLI Usage Examples:**
```bash
# Basic E-E-A-T & Content Quality check on single page
seocore content https://example.com/blog/post
seocore eeat https://example.com/blog/post # Alias

# Export JSON
seocore content https://example.com --json --output content-report.json

# Deep check all pages on site
seocore content https://example.com --deep

# Focus on specific categories
seocore content https://example.com --focus readability,trustworthiness

# CI mode with budgets
seocore content https://example.com --ci --budget-eeat 70 --budget-content 80
```

**Command Code:**
```typescript
// Add after "ai-visibility" command
program
  .command('content')
  .alias('eeat')
  .description('E-E-A-T & Content Quality analysis with AI citation readiness')
  .argument('<url>', 'Target URL')
  .option('--deep', 'Analyze all pages on site instead of just landing')
  .option('--focus <categories>', 'Focus on specific categories (comma-separated: experience,expertise,authoritativeness,trustworthiness,readability,keywords,structure)')
  .option('--json', 'Output raw JSON')
  .option('-f, --format <format>', 'Output format: terminal, json, html')
  .option('-o, --output <path>', 'Export to file')
  .option('--ci', 'Enable CI mode with non-zero exit codes')
  .option('--budget-eeat <score>', 'Fail CI if overall E-E-A-T score is below this number')
  .option('--budget-content <score>', 'Fail CI if overall content quality score is below this number')
  .option('-c, --config <path>', 'Path to seocore.config.json')
  .action(async (url, options) => {
    // Implementation using ContentAnalyzer, EeatAnalyzer, AiCitationReadiness
  });
```

---

### 5. Terminal Output Preview
```
================================================================================
             E-E-A-T & CONTENT QUALITY ANALYSIS REPORT
================================================================================
Target: https://example.com/blog/post
Date: 2026-05-25T14:30:00Z

📊 OVERALL SCORES:
  • E-E-A-T Score:          82/100 🟢
  • Content Quality Score:  75/100 🟢
  • AI Citation Readiness:  90/100 🟢

🏛️ E-E-A-T PILLARS:
  • Experience:       75/100 🟡 (Add "first-hand experience" language)
  • Expertise:        90/100 🟢
  • Authoritativeness:80/100 🟢
  • Trustworthiness:  85/100 🟢

📝 CONTENT QUALITY:
  • Readability:
    - Flesch Reading Ease: 65 (Plain English - good)
    - Flesch-Kincaid Grade Level: 8 (8th grade - good)
  • Keywords:
    - "project management software": 1.2% density (okay)
    - "saas project management": 0.8% density (okay)
  • Structure:
    - H1 count: 1 ✅
    - H2 count: 4 ✅
    - H3 count: 6 ✅
    - Internal link density: 2.3 links/100 words (good)

🚀 AI CITATION READINESS:
  • Structured data (Article schema): present ✅
  • llms.txt: present at /.well-known/llms.txt ✅
  • Semantic HTML: good ✅

⚠️ ISSUES TO FIX:
  • Medium: Add first-hand experience language to improve Experience pillar
  • Low: Add more internal links to relevant product pages

✅ STRENGTHS:
  • Author bio with LinkedIn link (great for Expertise)
  • Clear About Us and Contact pages (great for Trustworthiness)
  • Complete Article schema (great for AI citations)
```

---

## JSON Output Schema
```json
{
  "metadata": { "url": "https://example.com/blog/post", "date": "2026-05-25T14:30:00Z" },
  "scores": {
    "eeat": 82,
    "contentQuality": 75,
    "aiCitationReadiness": 90
  },
  "eeat": {
    "overall": 82,
    "pillars": {
      "experience": 75,
      "expertise": 90,
      "authoritativeness": 80,
      "trustworthiness": 85
    },
    "findings": [
      { "type": "warning", "message": "Add \"first-hand experience\" language", "pillar": "experience" }
    ]
  },
  "contentQuality": {
    "readability": { "fleschReadingEase": 65, "fleschKincaidGradeLevel": 8 },
    "keywords": [{ "term": "project management software", "density": 1.2, "count": 12 }],
    "structure": { "h1Count": 1, "h2Count": 4, "h3Count": 6 },
    "wordCount": 980
  },
  "aiCitationReadiness": {
    "score": 90,
    "structuredData": { "present": true, "types": ["Article"] },
    "llmsTxt": { "present": true },
    "semanticHtml": { "good": true }
  }
}
```

---

## Acceptance Criteria
- [ ] `seocore content <url>` runs and outputs readable terminal report
- [ ] Supports `--json`/`--format json`/`--output <file>`
- [ ] Follows existing code patterns (picocolors, commander, etc.)
- [ ] Backward-compatible (no breaking changes to existing commands)
- [ ] E-E-A-T breakdown by all 4 pillars
- [ ] Readability scores
- [ ] Content structure analysis
- [ ] AI citation readiness checks
- [ ] No external API calls required for MVP (keeps it free and fast)
- [ ] Works with existing `--config` flag

---

## Notes
- Leverages existing PageNormalizer for content extraction
- Leverages existing SchemaOrgRule logic for structured data checks
- Leverages existing AiVisibilityFetcher for llms.txt checks
- Follows code patterns in `robots`, `sitemap`, `ai-visibility` commands
- MVP doesn't require LLM integration (keeps it simple and fast)
