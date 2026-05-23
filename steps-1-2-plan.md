# Steps 1 & 2 Implementation Plan

This document outlines the technical design and concrete changes required to implement **Step 1 (Crawl Filters)** and **Step 2 (Redirect Tracking)**.

---

## Step 1: Crawl Filters (`excludePatterns` and `includePatterns`)

### Problem
`SeoEngine` currently enqueues all discovered internal links during a crawl without filtering. Users cannot exclude administrative paths (e.g., `/admin/**`), static assets, or restrict crawled URLs to specific path structures.

### Solution
Implement pattern matching inside the crawler pipeline before links are pushed to the execution queue.

#### 1. Helper function for Pattern Matching
Convert wildcard string patterns (like `/admin/*` or `*.pdf`) to JavaScript regular expressions:

```typescript
function patternToRegex(pattern: string): RegExp {
  // Escape regex special chars except '*' and '?'
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(regexStr, 'i');
}

export function isUrlMatch(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  try {
    const urlObj = new URL(url);
    const pathAndQuery = urlObj.pathname + urlObj.search;
    return patterns.some(pattern => {
      const regex = patternToRegex(pattern);
      return regex.test(pathAndQuery) || regex.test(url);
    });
  } catch {
    return false;
  }
}
```

#### 2. Integrating with `SeoEngine.ts`
Modify the `enqueue` function in `packages/engine/src/index.ts` to respect config filters:

```typescript
const enqueue = (url: string, depth: number) => {
  if (queued.has(url) || queued.size >= config.maxPages) {
    return;
  }

  // A. Check Exclude Patterns
  if (config.excludePatterns.length > 0 && isUrlMatch(url, config.excludePatterns)) {
    return;
  }

  // B. Check Include Patterns (if specified, URL must match at least one)
  if (config.includePatterns.length > 0 && !isUrlMatch(url, config.includePatterns)) {
    return;
  }

  queued.add(url);
  // ... rest of queue logic
};
```

---

## Step 2: Redirect Tracking via `redirect: 'manual'`

### Problem
`HttpCrawler` currently relies on the runtime's default redirect-following behavior (`redirect: 'follow'`). This masks HTTP 3xx status codes, making it impossible to detect redirect chains, loops, or validate temporary vs. permanent redirects.

### Solution
1. Update `CrawlResult` interface to support redirect history.
2. Configure `fetch` with `redirect: 'manual'`.
3. Handle redirect hops manually in `HttpCrawler`.

#### 1. Update `CrawlResult` and `NormalizedPage`
Add fields to capture hops in `packages/sdk/src/index.ts`:

```typescript
export interface RedirectHop {
  url: string;
  statusCode: number;
}

export interface CrawlResult {
  url: string;
  html?: string;
  statusCode: number;
  loadTimeMs: number;
  contentType: string;
  error?: string;
  redirectChain?: RedirectHop[]; // Ordered list of intermediate redirects
}

export interface NormalizedPage {
  // ... existing fields
  redirectChain?: RedirectHop[];
}
```

#### 2. Manual Redirect Resolution in `HttpCrawler`
Refactor `packages/crawler/src/index.ts` to manually resolve up to 5 redirect hops:

```typescript
export class HttpCrawler implements Crawler {
  async crawl(url: string, config: SeoConfig): Promise<CrawlResult> {
    let currentUrl = url;
    const redirectChain: RedirectHop[] = [];
    const maxRedirects = 5;
    let attempts = 0;
    const maxAttempts = (config.retryCount ?? 2) + 1;

    while (attempts < maxAttempts) {
      attempts++;
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual', // Intercept 3xx redirect actions
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        clearTimeout(timeoutId);
        const loadTimeMs = Date.now() - startTime;
        const contentType = response.headers.get('content-type') || 'text/html';

        // Detect 3xx redirects
        if (response.status >= 300 && response.status <= 399) {
          const location = response.headers.get('location');
          if (!location) {
            return {
              url: currentUrl,
              statusCode: response.status,
              loadTimeMs,
              contentType,
              error: 'Redirect header location missing',
              redirectChain,
            };
          }

          const resolvedRedirectUrl = new URL(location, currentUrl).href;

          // Detect redirect loops
          if (redirectChain.some(hop => hop.url === resolvedRedirectUrl) || resolvedRedirectUrl === url) {
            return {
              url: currentUrl,
              statusCode: response.status,
              loadTimeMs,
              contentType,
              error: 'Circular redirect detected',
              redirectChain: [...redirectChain, { url: resolvedRedirectUrl, statusCode: response.status }],
            };
          }

          redirectChain.push({ url: currentUrl, statusCode: response.status });

          if (redirectChain.length >= maxRedirects) {
            return {
              url: resolvedRedirectUrl,
              statusCode: response.status,
              loadTimeMs,
              contentType,
              error: 'Max redirects exceeded',
              redirectChain,
            };
          }

          // Follow the redirect to the next hop
          currentUrl = resolvedRedirectUrl;
          attempts = 0; // Reset attempts for the redirected URL target
          continue;
        }

        if (!response.ok) {
          if (response.status >= 500 && attempts < maxAttempts) {
            const delay = (config.rateLimitMs ?? 100) * attempts;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return {
            url: currentUrl,
            statusCode: response.status,
            loadTimeMs,
            contentType,
            error: `HTTP Error: ${response.status} ${response.statusText}`,
            redirectChain,
          };
        }

        const html = await response.text();
        return {
          url: currentUrl,
          html,
          statusCode: response.status,
          loadTimeMs,
          contentType,
          redirectChain,
        };
      } catch (err: any) {
        if (attempts < maxAttempts) {
          const delay = (config.rateLimitMs ?? 100) * attempts;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return {
          url: currentUrl,
          statusCode: 0,
          loadTimeMs: Date.now() - startTime,
          contentType: 'none',
          error: err.message || 'Unknown network error',
          redirectChain,
        };
      }
    }

    return {
      url: currentUrl,
      statusCode: 0,
      loadTimeMs: 0,
      contentType: 'none',
      error: 'Max retries exceeded',
      redirectChain,
    };
  }
}
```

#### 3. Propagate Redirect Chain in Normalizer
Update `PageNormalizer.normalize` in `packages/analyzers/src/index.ts` to copy `redirectChain`:

```typescript
export class PageNormalizer {
  static normalize(result: CrawlResult): NormalizedPage {
    const { url, html, statusCode, loadTimeMs, contentType, redirectChain } = result;

    const normalized: NormalizedPage = {
      url,
      statusCode,
      loadTimeMs,
      contentType,
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      hreflang: [],
      structuredData: [],
      redirectChain, // Set property
    };
    // ... rest of normalizer code
  }
}
```
