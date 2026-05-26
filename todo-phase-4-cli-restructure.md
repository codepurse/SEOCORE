# Phase 4 — CLI Restructure

**Goal**: split `packages/cli/src/index.ts` (1448 lines, 18 commands) into focused per-command files. Group commands logically via subcommands. Extract shared option/validation/output helpers. **Zero command removal**. All existing invocations keep working via hidden aliases.

**Prerequisite**: Phase 1 (de-dupe), Phase 2 (engine slim), Phase 3 (rules split, AI-vis unified). Phase 4 can technically start after Phase 1 alone, but cleanest after Phase 3 because the AI-vis CLI override is gone.

**Risk**: low. Pure file reorganization + UX layer. No engine/rule/scoring touched. Failure mode = broken CLI invocation, caught immediately by smoke test.

**Estimated diff**: `cli/src/index.ts` 1448 lines → ~150 lines (program bootstrap + command registration). Net repo size grows slightly (~300 lines for shared helpers + new command file scaffolding), but every file is now <120 lines.

---

## Benefits

### Maintainability
- 1448-line god file → 18 command files, each <120 lines
- Single command edit no longer requires scrolling past 17 unrelated commands
- Shared helpers (URL validation, config builder, output writer, event handlers) defined once, not 18 times
- Spinner / event handlers / output writer consistent across commands automatically

### UX consistency
- Every command supports the same canonical flags: `--tier`, `--format`, `--output`, `--json`, `--verbose`, `--ci`
- Output file logic unified: `--format html` + `--output ./x.html` works identically everywhere
- Error message style, exit codes, color scheme uniform across commands
- `--help` text generated from shared option groups — no drift between commands

### Discoverability
- `seocore --help` shows grouped subcommands (`audit`, `inspect`, `analyze`, `compare`, `config`, `rules`, `tier`) instead of flat 18-command wall
- `seocore inspect --help` reveals related commands together (`robots`, `sitemap`, `schema`, `llms-txt`, `hreflang`, `backlinks`, `rank`, `screenshot`)
- New users find what they need without reading 18 entries

### Backward compatibility
- Every old top-level command kept as **hidden alias** forwarding to the grouped form
- Existing scripts, CI pipelines, documentation links keep working
- No deprecation cycle needed for end users; deprecation only inside the codebase

### Extensibility
- Adding a new command = new file in `commands/<group>/<name>.ts` + one register call
- Plugins (post-Phase-5) can contribute CLI commands via plugin lifecycle

---

## 0. Pre-flight: baseline CLI behavior

- [ ] Capture exit codes + stdout shape per command:
  - [ ] Run each of 18 commands with `--help`; save output to `tests/fixtures/phase-4-cli-help/<command>.txt`
  - [ ] Run each command against a fixture URL or file; save JSON output where applicable to `tests/fixtures/phase-4-cli-output/<command>.json`
  - [ ] Note exit codes for: success, validation failure, missing-argument, malformed-URL
- [ ] Document the canonical option contract that every command supports today vs. should support after Phase 4 (table in §1.1)

---

## 1. Define the canonical option/UX contract

### 1.1 Shared option groups
- [ ] Inventory existing options across commands (matrix: command × option). Identify drift:
  - [ ] Which commands accept `--tier` vs `--preset`?
  - [ ] Which commands accept `--json` vs `--format json`?
  - [ ] Which commands accept `--output`?
  - [ ] Which commands accept `--ci`?
  - [ ] Which commands accept `--verbose`?
- [ ] Document the canonical set every audit-touching command must support:
  ```
  --tier <fast|standard|deep|enterprise>
  --depth <n>
  --max-pages <n>
  --concurrency <n>
  --rate-limit <ms>
  --exclude <pattern...>
  --include <pattern...>
  ```
- [ ] Document the canonical set every output-producing command must support:
  ```
  --format <terminal|json|html|sarif>
  --output <path>
  --json                  (shortcut for --format json)
  --verbose
  --ci                    (silent, non-zero exit on findings)
  ```

### 1.2 Shared helpers — `packages/cli/src/shared/`
- [ ] Create directory: `packages/cli/src/shared/`
- [ ] `shared/options.ts`:
  ```ts
  import { Command } from 'commander';
  
  export function addCrawlOptions(cmd: Command): Command {
    return cmd
      .option('-t, --tier <tier>', 'fast|standard|deep|enterprise')
      .option('-p, --preset <preset>', 'quick|standard|deep|enterprise (legacy, use --tier)')
      .option('-d, --depth <n>', 'crawl depth', v => parseInt(v, 10))
      .option('-m, --max-pages <n>', 'max pages', v => parseInt(v, 10))
      .option('-c, --concurrency <n>', 'concurrency', v => parseInt(v, 10))
      .option('--rate-limit <ms>', 'rate limit', v => parseInt(v, 10))
      .option('--retry-count <n>', 'retry count', v => parseInt(v, 10))
      .option('--exclude <pattern...>', 'exclude patterns')
      .option('--include <pattern...>', 'include patterns')
      .option('--playwright', 'use playwright')
      .option('--lighthouse', 'use lighthouse')
      .option('--lighthouse-sample <n>', 'lighthouse sample count', v => parseInt(v, 10));
  }
  
  export function addOutputOptions(cmd: Command): Command {
    return cmd
      .option('-f, --format <fmt>', 'terminal|json|html|sarif', 'terminal')
      .option('-o, --output <path>', 'export path')
      .option('--json', 'shortcut for --format json', false)
      .option('-v, --verbose', 'verbose findings', false);
  }
  
  export function addCiOptions(cmd: Command): Command {
    return cmd
      .option('--ci', 'CI mode (no prompts, non-zero exit on failure)', false)
      .option('--fail-on <severities>', 'comma-separated severities triggering exit 1', 'critical,error');
  }
  
  export function addBudgetOptions(cmd: Command): Command {
    return cmd
      .option('--budget-lcp <ms>', 'LCP budget', v => parseInt(v, 10))
      .option('--budget-cls <n>', 'CLS budget', v => parseFloat(v))
      .option('--budget-inp <ms>', 'INP budget', v => parseInt(v, 10))
      .option('--budget-js <bytes>', 'JS payload budget', v => parseInt(v, 10));
  }
  ```
- [ ] `shared/validation.ts`:
  ```ts
  import pc from 'picocolors';
  
  export function validateUrl(url: string, label = 'URL'): void {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.error(pc.red(`Error: ${label} must start with http:// or https://`));
      process.exit(1);
    }
    try { new URL(url); } catch {
      console.error(pc.red(`Error: Invalid ${label}: ${url}`));
      process.exit(1);
    }
  }
  
  export function validateTier(tier: string | undefined): ExecutionTier | undefined {
    if (!tier) return undefined;
    const valid = ['fast', 'standard', 'deep', 'enterprise'];
    if (!valid.includes(tier)) {
      console.error(pc.red(`Error: Invalid tier "${tier}". Must be one of: ${valid.join(', ')}`));
      process.exit(1);
    }
    return tier as ExecutionTier;
  }
  
  export function validateOutputFormat(fmt: string): string {
    const valid = ['terminal', 'json', 'html', 'sarif', 'both', 'all'];
    if (!valid.includes(fmt)) {
      console.error(pc.red(`Error: Invalid format "${fmt}". Must be one of: ${valid.join(', ')}`));
      process.exit(1);
    }
    return fmt;
  }
  ```
- [ ] `shared/config-builder.ts`:
  ```ts
  /**
   * Build SeoConfig partial from common CLI options.
   * Used by audit, crawl, content, ai-visibility, schema, hreflang.
   */
  export function buildPartialConfig(options: any): Partial<SeoConfig> {
    const cfg: Partial<SeoConfig> = {};
    if (options.preset) cfg.preset = options.preset;
    if (options.depth !== undefined) cfg.maxDepth = options.depth;
    if (options.maxPages !== undefined) cfg.maxPages = options.maxPages;
    if (options.concurrency !== undefined) cfg.concurrency = options.concurrency;
    if (options.rateLimit !== undefined) cfg.rateLimitMs = options.rateLimit;
    if (options.retryCount !== undefined) cfg.retryCount = options.retryCount;
    if (options.exclude) cfg.excludePatterns = options.exclude;
    if (options.include) cfg.includePatterns = options.include;
    if (options.playwright) cfg.playwrightEnabled = true;
    if (options.lighthouse !== undefined) cfg.lighthouseEnabled = options.lighthouse;
    if (options.lighthouseSample !== undefined) cfg.lighthouseSampleCount = options.lighthouseSample;
    return cfg;
  }
  ```
- [ ] `shared/output-writer.ts`:
  ```ts
  /**
   * Unified output dispatcher. Every command uses this to write results.
   * Resolves --format / --json / --output consistently.
   */
  export interface OutputDispatch {
    result: any;
    terminalRender: () => void;
    jsonDefaultName: string;
    htmlExporter?: (result: any, path: string) => string;
    sarifExporter?: (result: any, path: string) => string;
  }
  
  export function dispatchOutput(opts: any, d: OutputDispatch): void {
    const fmt = opts.json ? 'json' : (opts.format ?? 'terminal');
    
    if (fmt === 'terminal') {
      d.terminalRender();
      return;
    }
    
    if (fmt === 'json' || fmt === 'both' || fmt === 'all') {
      const path = opts.output?.endsWith('.json') ? opts.output : `./${d.jsonDefaultName}.json`;
      writeFile(path, JSON.stringify(d.result, null, 2));
      console.log(pc.green(`✔ JSON exported to ${path}`));
    }
    
    if ((fmt === 'html' || fmt === 'all') && d.htmlExporter) {
      const path = opts.output?.endsWith('.html') ? opts.output : `./${d.jsonDefaultName}.html`;
      d.htmlExporter(d.result, path);
      console.log(pc.green(`✔ HTML exported to ${path}`));
    }
    
    if (fmt === 'sarif' && d.sarifExporter) {
      const path = opts.output?.endsWith('.sarif') ? opts.output : `./${d.jsonDefaultName}.sarif`;
      d.sarifExporter(d.result, path);
      console.log(pc.green(`✔ SARIF exported to ${path}`));
    }
  }
  ```
- [ ] `shared/event-handlers.ts`:
  ```ts
  /**
   * Standard EventBus listeners used by audit, crawl, content, schema, etc.
   * Eliminates duplication of inline pc.cyan/pc.gray/pc.green logging per command.
   */
  export function attachStandardEvents(bus: EventBus, opts: { verbose?: boolean } = {}): void {
    bus.on('crawl:start', d => console.log(pc.cyan(`\n🕷  Starting crawl on ${pc.bold(d.startUrl)}`)));
    bus.on('page:loaded', d => {
      const c = d.statusCode === 200 ? pc.green : pc.red;
      console.log(`  ${pc.gray('[Crawl]')} ${pc.white(d.url)} (${c(String(d.statusCode))}) - ${pc.yellow(d.loadTimeMs + 'ms')}`);
    });
    bus.on('dom:parsed', d => {
      if (opts.verbose) console.log(`  ${pc.gray('[Parse]')} links=${d.page.links.length} images=${d.page.images.length}`);
    });
    bus.on('analyzer:completed', d => console.log(pc.cyan(`🔍 Evaluating rules (${d.findingsCount} findings)`)));
    bus.on('score:calculated', () => console.log(pc.green('✔ Scoring done')));
  }
  ```
- [ ] `shared/index.ts` re-exports all helpers

### 1.3 Tests
- [ ] `packages/cli/src/shared/options.test.ts` — applying each option group to a fresh `Command` registers expected flags
- [ ] `packages/cli/src/shared/validation.test.ts` — `validateUrl` exits with code 1 on bad input; passes on good
- [ ] `packages/cli/src/shared/output-writer.test.ts` — `dispatchOutput` writes correct file paths per format

---

## 2. Define the new command grouping

### 2.1 Command tree

```
seocore
├── audit <url>                  # full pipeline audit (KEEP top-level — primary verb)
├── crawl <url>                  # crawl-only, no rules (KEEP top-level)
├── compare <a> <b>              # diff two audits (KEEP top-level)
│
├── inspect <subcommand>         # NEW group — single-aspect probes
│   ├── robots <url>             # was: robots
│   ├── sitemap <url>            # was: sitemap
│   ├── schema <url>             # was: schema
│   ├── llms-txt <url>           # was: llms-txt
│   ├── hreflang <url>           # was: hreflang
│   ├── backlinks <url>          # was: backlinks
│   ├── rank <keyword> <url>     # was: rank-check
│   └── screenshot <url>         # was: screenshot
│
├── analyze <subcommand>         # NEW group — analyzer-driven deep dives
│   ├── content <url>            # was: content (alias eeat)
│   └── ai-visibility <url>      # was: ai-visibility
│
├── config <subcommand>          # NEW group
│   ├── init                     # was: config:init
│   ├── validate [file]          # was: validate
│   └── show                     # NEW: print resolved effective config
│
├── rules <subcommand>           # NEW group
│   ├── list                     # was: rules:list
│   └── describe <id>            # NEW: dump full RuleDefinition for one rule
│
└── tier <subcommand>            # NEW group
    ├── list                     # was: tier:list
    └── describe <tier>          # NEW: dump full ExecutionTierConfig
```

### 2.2 Old command → new path mapping (with hidden aliases)

Every old command remains invokable verbatim. Implementation: keep both the new path AND a hidden alias.

| Old (preserved as hidden alias) | New canonical path | Status |
|---|---|---|
| `audit <url>` | `audit <url>` | unchanged top-level |
| `crawl <url>` | `crawl <url>` | unchanged top-level |
| `compare <a> <b>` | `compare <a> <b>` | unchanged top-level |
| `robots <url>` | `inspect robots <url>` | hidden alias |
| `sitemap <url>` | `inspect sitemap <url>` | hidden alias |
| `schema <url>` | `inspect schema <url>` | hidden alias |
| `llms-txt <url>` | `inspect llms-txt <url>` | hidden alias |
| `hreflang <url>` | `inspect hreflang <url>` | hidden alias |
| `backlinks <url>` | `inspect backlinks <url>` | hidden alias |
| `rank-check <kw> <url>` | `inspect rank <kw> <url>` | hidden alias |
| `screenshot <url>` | `inspect screenshot <url>` | hidden alias |
| `content <url>` (+ alias `eeat`) | `analyze content <url>` (+ alias `analyze eeat`) | hidden alias |
| `ai-visibility <url>` | `analyze ai-visibility <url>` | hidden alias |
| `config:init` | `config init` | hidden alias |
| `validate` | `config validate` | hidden alias |
| `rules:list` | `rules list` | hidden alias |
| `tier:list` | `tier list` | hidden alias |

- [ ] Implementation pattern in commander:
  ```ts
  // Define canonical
  program
    .command('inspect')
    .description('Single-aspect probes (robots, sitemap, schema, etc.)')
    .addCommand(robotsCommand())
    .addCommand(sitemapCommand())
    // ...
  
  // Hidden alias forwarding to canonical
  program
    .command('robots <url>', { hidden: true })
    .description('Alias for: inspect robots')
    .action((url, opts) => robotsHandler(url, opts));
  ```
- [ ] Pattern: each subcommand exports both `command(): Command` (for grouping) and `handler(args, opts): Promise<void>` (for direct invocation by aliases)

---

## 3. Extract commands into per-file modules

### 3.1 Directory structure
- [ ] Create:
  ```
  packages/cli/src/
    index.ts                          (~150 lines: bootstrap + register)
    shared/
      options.ts
      validation.ts
      config-builder.ts
      output-writer.ts
      event-handlers.ts
      spinner.ts                       (move from utils/spinner.ts)
      index.ts
    commands/
      audit.ts                         ← orig line 27-289
      crawl.ts                         ← orig line 290-346
      compare.ts                       ← orig line 1130-1313
      config/
        init.ts                        ← orig line 425-437
        validate.ts                    ← orig line 1325-1334
        show.ts                        (NEW)
        index.ts                       (group registration)
      rules/
        list.ts                        ← orig line 386-419
        describe.ts                    (NEW)
        index.ts
      tier/
        list.ts                        ← orig line 352-380
        describe.ts                    (NEW)
        index.ts
      inspect/
        robots.ts                      ← orig line 516-597
        sitemap.ts                     ← orig line 598-734
        schema.ts                      ← orig line 1314-1324 (mostly delegates)
        llms-txt.ts                    ← orig line 735-921
        hreflang.ts                    ← orig line 1335-1421
        backlinks.ts                   ← orig line 922-1041
        rank.ts                        ← orig line 1042-1129
        screenshot.ts                  ← orig line 1422-end
        index.ts
      analyze/
        content.ts                     ← orig line 475-515 (delegates to existing content/ folder)
        ai-visibility.ts               ← orig line 443-469
        index.ts
    content/                            (KEEP — analyzer logic, not CLI)
    ai-visibility/                      (KEEP — analyzer logic, not CLI)
    hreflang/                           (KEEP — analyzer logic, not CLI)
    validate/                           (KEEP — config validator logic)
    utils/                              (deprecate after spinner moved to shared/)
  ```

### 3.2 Per-command extraction recipe
For each command (18 total), the same mechanical recipe:

- [ ] Cut the `.command(...)` block from `packages/cli/src/index.ts`
- [ ] Paste into new file as named export `command(): Command`
- [ ] Extract the inline `.action(async (...) => { ... })` handler into a separate exported function `handler(args, opts): Promise<void>`
- [ ] Replace inline URL validation with `validateUrl(url)` from shared
- [ ] Replace inline tier validation with `validateTier(opts.tier)` from shared
- [ ] Replace inline partial config building with `buildPartialConfig(opts)` from shared
- [ ] Replace inline event listeners with `attachStandardEvents(bus, opts)` from shared
- [ ] Replace inline output writing with `dispatchOutput(opts, { ... })` from shared
- [ ] Register the canonical command in its group's `index.ts`
- [ ] Register the hidden top-level alias in `packages/cli/src/index.ts`

### 3.3 Order of extraction (low to high risk)

Sequence matters — start with simple commands, finish with `audit` (most complex):

- [ ] **Batch A — read-only utilities** (no audit pipeline):
  - [ ] `config init`
  - [ ] `config validate`
  - [ ] `rules list`
  - [ ] `tier list`
- [ ] **Batch B — single-aspect probes** (use `HttpCrawler` directly, no full pipeline):
  - [ ] `inspect robots`
  - [ ] `inspect sitemap`
  - [ ] `inspect llms-txt`
- [ ] **Batch C — single-aspect probes with full result formatting**:
  - [ ] `inspect hreflang`
  - [ ] `inspect backlinks`
  - [ ] `inspect rank`
  - [ ] `inspect screenshot`
- [ ] **Batch D — analyzer commands** (delegate to existing analyzer dirs):
  - [ ] `analyze ai-visibility`
  - [ ] `analyze content`
  - [ ] `inspect schema` (already mostly delegates)
- [ ] **Batch E — pipeline commands** (highest blast radius):
  - [ ] `crawl`
  - [ ] `compare`
  - [ ] `audit` (last; deepest options + lighthouse prompt + post-processing)

After each batch:
- [ ] Run smoke tests for the extracted batch
- [ ] Run unrelated commands to confirm no regression
- [ ] Commit

---

## 4. Add new sub-commands (filling discoverability gaps)

These were noted as gaps in the architecture review. Phase 4 introduces them since they're naturally placed in the new structure.

### 4.1 `config show`
- [ ] Print resolved effective `SeoConfig` after merging: defaults → preset/tier → file → env vars
- [ ] Useful for debugging "why is my config not being applied"
- [ ] ~30 lines: call `resolveConfig()` and JSON-pretty-print

### 4.2 `config validate [file]`
- [ ] Already exists at top level — promote and improve
- [ ] When file path omitted, validate `./seocore.config.json`
- [ ] Output: green tick + parsed config, or red error list with Zod path + message
- [ ] Exit 0 on valid, 1 on invalid (CI-friendly)

### 4.3 `rules describe <id>`
- [ ] Dump full `RuleDefinition` for a given rule ID
- [ ] Show: name, description, category, module, defaultSeverity, defaultWeight, tier gating, capability requirements, doc link
- [ ] Show effective settings after applying `seocore.config.json` overrides
- [ ] Error with helpful suggestion if rule ID not found ("Did you mean: missing-title?")

### 4.4 `tier describe <tier>`
- [ ] Dump full `ExecutionTierConfig` for the named tier
- [ ] Show: crawl settings, module activation, rule filter, scoring weights, scoring floors
- [ ] Format as table for terminal, JSON for `--json`

---

## 5. Rewrite the program bootstrap

### 5.1 New `packages/cli/src/index.ts` (~150 lines)
- [ ] Replace the entire 1448-line file with:
  ```ts
  #!/usr/bin/env node
  import { Command } from 'commander';
  import pc from 'picocolors';
  
  // Top-level commands
  import { auditCommand } from './commands/audit.js';
  import { crawlCommand } from './commands/crawl.js';
  import { compareCommand } from './commands/compare.js';
  
  // Subcommand groups
  import { inspectGroup } from './commands/inspect/index.js';
  import { analyzeGroup } from './commands/analyze/index.js';
  import { configGroup } from './commands/config/index.js';
  import { rulesGroup } from './commands/rules/index.js';
  import { tierGroup } from './commands/tier/index.js';
  
  // Hidden aliases (backward compat)
  import { registerLegacyAliases } from './commands/legacy-aliases.js';
  
  const program = new Command();
  
  program
    .name('seocore')
    .description('Enterprise-grade SEO Analysis Platform')
    .version('1.0.0');
  
  // Top-level
  program.addCommand(auditCommand());
  program.addCommand(crawlCommand());
  program.addCommand(compareCommand());
  
  // Grouped
  program.addCommand(inspectGroup());
  program.addCommand(analyzeGroup());
  program.addCommand(configGroup());
  program.addCommand(rulesGroup());
  program.addCommand(tierGroup());
  
  // Hidden aliases for old paths
  registerLegacyAliases(program);
  
  program.parseAsync(process.argv).catch(err => {
    console.error(pc.red(`Error: ${err.message}`));
    process.exit(1);
  });
  ```

### 5.2 `packages/cli/src/commands/legacy-aliases.ts`
- [ ] One central place for hidden aliases — easy to remove later when ready for breaking change:
  ```ts
  export function registerLegacyAliases(program: Command): void {
    // Each alias: hidden flag, identical option signature, forwards to canonical handler
    program.command('robots <url>', { hidden: true })
      .option('--json').option('-f, --format <fmt>').option('-o, --output <path>')
      .action((url, opts) => import('./inspect/robots.js').then(m => m.handler(url, opts)));
    
    program.command('sitemap <url>', { hidden: true })
      .option('--check-links').option('--json').option('-f, --format <fmt>').option('-o, --output <path>')
      .action((url, opts) => import('./inspect/sitemap.js').then(m => m.handler(url, opts)));
    
    // ... 14 more aliases
  }
  ```
- [ ] Add a `console.warn` (only when running interactively, NOT in `--ci`) prompting users to switch to the new path. Suppress in CI to avoid noisy CI logs.

---

## 6. Cross-cutting verification

### 6.1 Help output parity
- [ ] For each new canonical command, run `--help` and verify all options from the original appear (plus any new shared additions)
- [ ] Run `seocore --help` and verify grouped command tree renders cleanly
- [ ] Run `seocore inspect --help`, `seocore analyze --help`, `seocore config --help`, `seocore rules --help`, `seocore tier --help` — each shows their sub-commands

### 6.2 Behavior parity (legacy paths)
For every command preserved as hidden alias:
- [ ] Run old invocation: `npm run cli -- robots https://example.com --json` → save output
- [ ] Run new invocation: `npm run cli -- inspect robots https://example.com --json` → save output
- [ ] Diff: output must be byte-identical (modulo any new deprecation warning written to stderr)
- [ ] Exit code parity (success and failure cases)

### 6.3 Smoke matrix
- [ ] Run all 18 old invocations from `tests/fixtures/phase-4-cli-help/` baseline — all must pass
- [ ] Run all new canonical invocations — all must pass
- [ ] Run `seocore audit https://example.com --tier fast --format json --output ./tmp.json` → JSON exported, exit 0
- [ ] Run `seocore audit https://example.com --ci --fail-on critical` → if no critical findings, exit 0; if critical present, exit 1
- [ ] Run `seocore audit nonsense-url` → exit 1 with friendly error
- [ ] Run `seocore inspect rank "seo crawler" https://example.com` → produces same output as `seocore rank-check "seo crawler" https://example.com`

### 6.4 Build/test
- [ ] `npm run build` clean
- [ ] `npm test` green
- [ ] CLI bundle size: report before/after (should be similar or smaller due to better tree-shaking with per-command lazy imports)

---

## 7. Documentation updates

### 7.1 README.md
- [ ] Update the 17 numbered usage sections to use new canonical paths
- [ ] Keep a "Legacy command compatibility" note pointing out hidden aliases still work
- [ ] Add `seocore --help` ASCII tree snippet at top of CLI section so users see the structure at a glance

### 7.2 Inline command help
- [ ] Every `.description(...)` updated to be self-contained (no "see also" prose; commander's grouping handles discovery)
- [ ] Every option description starts with a noun ("Output format", "Maximum pages") for consistency

### 7.3 CHANGELOG
- [ ] List all path changes
- [ ] Note that legacy paths remain functional with deprecation warning
- [ ] Note new commands: `config show`, `rules describe`, `tier describe`

---

## 8. Optional UX polish (only if time)

Not required for Phase 4 completion. Do only after §6 passes:

- [ ] Auto-suggest on unknown command: `seocore audti https://...` → "Unknown command 'audti'. Did you mean 'audit'?"
- [ ] Color theme respects `NO_COLOR` env var (likely already via picocolors)
- [ ] Add `--quiet` mode (suppress info logs, only show final result)
- [ ] Progress bar for multi-page audits using `cli-progress` (currently only spinner)
- [ ] Tab completion script generator: `seocore completion bash > /etc/bash_completion.d/seocore`

---

## 9. Commit / PR strategy

One PR per batch from §3.3 (five PRs total) plus pre/post:

- [ ] **PR 1**: `feat(cli): shared option/validation/output helpers; canonical UX contract` (§1)
- [ ] **PR 2**: `refactor(cli): extract Batch A commands (config init/validate, rules list, tier list)` (§3.3 A + §4.2, §4.3, §4.4 new commands)
- [ ] **PR 3**: `refactor(cli): extract Batch B+C inspect commands` (§3.3 B + C)
- [ ] **PR 4**: `refactor(cli): extract Batch D analyzer commands` (§3.3 D)
- [ ] **PR 5**: `refactor(cli): extract Batch E pipeline commands (audit, crawl, compare); shrink index.ts to bootstrap` (§3.3 E + §5)
- [ ] **PR 6**: `docs(cli): update README, add CHANGELOG entries` (§7)

Each PR must pass §6 verification for the commands it touches.

---

## Definition of Done

- [ ] `packages/cli/src/index.ts` is ≤ 200 lines (bootstrap + registration only)
- [ ] Every command lives in its own file under `packages/cli/src/commands/`, each ≤ 150 lines
- [ ] Shared helpers in `packages/cli/src/shared/` are imported by every command (no per-command duplication of URL validation, partial config, event handlers, output writing)
- [ ] Every old invocation (`seocore robots`, `seocore rules:list`, `seocore config:init`, etc.) still works via hidden alias
- [ ] Every command in `seocore --help` is reachable by the canonical new path
- [ ] New commands added: `config show`, `rules describe <id>`, `tier describe <tier>`
- [ ] §6.2 behavior parity tests pass for all 17 legacy aliases
- [ ] Help output is grouped: `seocore --help` shows 8 top-level entries (3 verbs + 5 groups) instead of 18 flat commands
- [ ] README + CHANGELOG updated
- [ ] Build green, tests green

---

## Out of scope (deferred)

- **Phase 5**: Plugin packages (Playwright/Lighthouse/screenshots/rank-check move to plugins). Phase 4 leaves these as inline commands in `commands/inspect/`. Phase 5 will replace the implementations with plugin-provided versions while keeping the same CLI paths.
- **Phase 6**: Streaming pipeline, parallel rules, crawl cache
- **Future**: Tab completion, `--quiet`, progress bars (§8 optional polish)
- **Future**: JSON-RPC / IPC mode for editor integrations

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking an old command invocation used in someone's CI | Medium | High | Every old command preserved as hidden alias; §6.2 parity tests on every alias |
| Hidden alias diverges from canonical over time | Medium | Medium | Aliases call canonical handler via dynamic import — single implementation |
| Commander.js subcommand quirks (option inheritance, help formatting) | Medium | Medium | Build PR 1 first; smoke test grouping before extracting any command |
| `dispatchOutput` doesn't cover every command's output shape | Medium | Medium | Per command opt-in: command can render terminal output directly, then call dispatch for json/html only |
| Output format `--json` shortcut conflicts with `--format <fmt>` in some commands | Low | Low | Define precedence: `--json` overrides `--format` to `json` |
| Help text becomes verbose with shared options applied to every command | Low | Low | Group options visually via commander's `.option(..., { hideHelp: false })` API or split into "common" vs "command-specific" sections |
| Smoke tests pass but a rare option combination breaks | Medium | Medium | Capture pre-Phase-4 outputs for top-20 invocation patterns from CHANGELOG / docs; diff post-Phase-4 |
| Bundle size grows due to per-command files | Low | Low | Each command uses dynamic `import()` for heavy deps (already pattern in current code); per-file split helps tree-shake |
| Legacy alias deprecation warning is too noisy | Medium | Low | Suppress in CI (`process.env.CI` truthy or `--ci` flag set); only warn in interactive TTY |
| Refactor takes longer than estimated because of edge cases in old commands | High | Medium | Mechanical extraction discipline — no logic changes during file move; defer enhancements to follow-up PRs |
