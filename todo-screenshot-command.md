# SEOCORE Screenshot Command Todo List (MVP-Ready)

## Current SEOCORE Capabilities We'll Build On
- ✅ Full Playwright integration already exists ([PlaywrightCrawler](file:///d:/Project/SEOCORE/packages/crawler/src/index.ts#L489-L630))
- ✅ Playwright is already installed as a dependency (package.json)
- ✅ Existing CLI structure and output patterns

---

## Todo List

### Phase 1: Core MVP Command (P0 - Do This First)
| Task | Description | Files to Modify/Create | Complexity |
|------|-------------|------------------------|------------|
| 1. Add `screenshot` CLI command | Add top-level screenshot command | `packages/cli/src/index.ts` | Low |
| 2. Implement screenshot functionality | Use Playwright to capture screenshots at different viewports | `packages/cli/src/screenshot.ts` | Low |
| 3. Add terminal reporter | Colored output showing which screenshots were captured | `packages/cli/src/screenshot.ts` | Low |

### Phase 2: Enhancements (P1 - After MVP)
| Task | Description | Files to Modify | Complexity |
|------|-------------|-----------------|------------|
| 4. Add `--deep` flag | Capture screenshots for all pages on the site | `packages/cli/src/index.ts` | Medium |
| 5. Add `--full-page` flag | Capture full-page (not just viewport) screenshots | `packages/cli/src/screenshot.ts` | Low |
| 6. Add `--device` flag | Use Playwright device descriptors (iPhone, Android, etc.) | `packages/cli/src/screenshot.ts` | Low |

---

## Implementation Details

### 1. CLI Command Definition
**File to Modify:** `packages/cli/src/index.ts`

**CLI Usage Examples:**
```bash
# Basic screenshot of landing page (desktop viewport)
seocore screenshot https://example.com

# Capture mobile, tablet, desktop screenshots
seocore screenshot https://example.com --breakpoints mobile,tablet,desktop

# Full-page screenshot
seocore screenshot https://example.com --full-page

# Use Playwright device descriptors
seocore screenshot https://example.com --device "iPhone 15 Pro"

# Capture screenshots for all pages on site
seocore screenshot https://example.com --deep

# Specify output directory
seocore screenshot https://example.com --output ./screenshots/
```

**Command Code:**
```typescript
// Add after "rank-check" command
program
  .command('screenshot')
  .description('Capture visual screenshots of target page/site')
  .argument('<url>', 'Target URL')
  .option('--breakpoints <sizes>', 'Viewport breakpoints (comma-separated: mobile,tablet,desktop)')
  .option('--device <name>', 'Use Playwright device descriptor (e.g., "iPhone 15 Pro")')
  .option('--full-page', 'Capture full-page screenshots (not just viewport)')
  .option('--deep', 'Capture screenshots for all pages on site instead of just landing')
  .option('-o, --output <path>', 'Output directory for screenshots (default: ./screenshots)')
  .option('-c, --config <path>', 'Path to seocore.config.json')
  .action(async (url, options) => {
    // Implementation
  });
```

---

### 2. Screenshot Implementation File
**File to Create:** `packages/cli/src/screenshot.ts`

**Example Code Snippet:**
```typescript
import pc from 'picocolors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page, devices } from 'playwright';
import { HttpCrawler, SitemapParser, RobotsTxt } from '@seocore/crawler';
import { loadConfig } from '@seocore/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIEWPORT_SIZES = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

export async function captureScreenshots(
  url: string,
  options: {
    breakpoints?: string;
    device?: string;
    fullPage?: boolean;
    deep?: boolean;
    output?: string;
    config?: string;
  },
) {
  const config = await loadConfig(options.config);
  const outputDir = options.output || path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  let targetUrls: string[] = [url];
  if (options.deep) {
    // Use existing sitemap parser to get all URLs
    const sitemapParser = new SitemapParser();
    const sitemapUrls = await sitemapParser.parse(url);
    if (sitemapUrls.length > 0) {
      targetUrls = sitemapUrls.map(u => u.url);
    }
  }

  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.error(pc.red('Playwright is required but not installed!'));
    console.log('Run `npm install -g playwright` or `npx playwright install chromium`');
    process.exit(1);
  }

  const browser = await playwright.chromium.launch({ headless: true });
  console.log(`${pc.bold('🚀 SEOCORE Screenshot')}`);
  console.log('='.repeat(80));
  console.log(`Target:         ${url}`);
  console.log(`Output dir:     ${outputDir}`);
  console.log(`Deep crawl:     ${options.deep ? 'yes' : 'no'}`);
  console.log('='.repeat(80));

  for (const targetUrl of targetUrls) {
    console.log(`\n${pc.cyan('📸 Processing:')} ${targetUrl}`);
    await captureForUrl(browser, targetUrl, outputDir, options);
  }

  await browser.close();
  console.log(`\n${pc.bold(pc.green('✅ Done!'))} All screenshots saved to ${outputDir}`);
}

async function captureForUrl(
  browser: Browser,
  url: string,
  outputDir: string,
  options: any,
) {
  const urlSlug = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9-_]/g, '_');

  if (options.device) {
    // Use Playwright device descriptor
    const device = devices[options.device];
    if (!device) {
      console.warn(`  ${pc.yellow('⚠️ Device not found:')} ${options.device}`);
      return;
    }
    const context = await browser.newContext(device);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const screenshotPath = path.join(outputDir, `${urlSlug}-${options.device.replace(/\s/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: options.fullPage });
    console.log(`  ${pc.green('✓')} Saved: ${screenshotPath}`);
    await context.close();
    return;
  }

  // Use specified breakpoints
  const breakpoints = options.breakpoints
    ? options.breakpoints.split(',').map(b => b.trim().toLowerCase())
    : ['desktop'];

  for (const breakpoint of breakpoints) {
    const size = VIEWPORT_SIZES[breakpoint as keyof typeof VIEWPORT_SIZES];
    if (!size) {
      console.warn(`  ${pc.yellow('⚠️ Invalid breakpoint:')} ${breakpoint}`);
      continue;
    }
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const screenshotPath = path.join(outputDir, `${urlSlug}-${breakpoint}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: options.fullPage });
    console.log(`  ${pc.green('✓')} Saved: ${screenshotPath}`);
    await context.close();
  }
}
```

---

### 3. Terminal Output Preview
```
================================================================================
                        SEOCORE SCREENSHOT COMMAND
================================================================================
Target:         https://example.com
Output dir:     ./screenshots
Deep crawl:     no
================================================================================

📸 Processing: https://example.com
  ✓ Saved: ./screenshots/example_com-desktop.png

✅ Done! All screenshots saved to ./screenshots
```

With `--breakpoints mobile,tablet,desktop`:
```
📸 Processing: https://example.com
  ✓ Saved: ./screenshots/example_com-mobile.png
  ✓ Saved: ./screenshots/example_com-tablet.png
  ✓ Saved: ./screenshots/example_com-desktop.png

✅ Done! All screenshots saved to ./screenshots
```

---

## Acceptance Criteria
- [ ] `seocore screenshot <url>` runs and captures desktop screenshot
- [ ] Supports `--breakpoints mobile,tablet,desktop`
- [ ] Supports `--device "iPhone 15 Pro"`
- [ ] Supports `--full-page`
- [ ] Supports `--output` to specify directory
- [ ] Follows existing code patterns (picocolors, commander, etc.)
- [ ] Backward-compatible (no breaking changes to existing commands)
- [ ] Uses Playwright which is already installed as a dependency

---

## Notes
- Builds on existing Playwright integration
- Follows code patterns in `robots`, `sitemap`, etc. commands
- Leverages existing SitemapParser for `--deep` flag
