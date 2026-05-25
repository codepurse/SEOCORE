# `seocore images` — Image Audit Command

Audits page/site images for SEO, accessibility, performance, and caching issues.

## Usage

```bash
seocore images <url> [options]
```

## Options

* `--crawl`                 Site-wide crawl (default: single URL only)
* `--playwright`            Enable Playwright rendering for layout metrics and LCP detection
* `--threshold-kb <kb>`     Oversized image budget in KB (default: 200)
* `-f, --format <format>`   Output format: `json` or `html` (default: `html`)
* `-o, --output <path>`     Export report path
* `--concurrency <num>`     Parallel image fetches (default: 5)
* `--max-images <num>`      Safety cap for `--crawl` (default: 500)
* `--user-agent <str>`      Override User-Agent header
* `--timeout <ms>`          Timeout in milliseconds (default: 10000)

## Rules Evaluated

1. **Payload Weight (`image-weight`)**: Flags individual images exceeding the budget, and pages exceeding 1.5MB total payload.
2. **Format (`image-format`)**: Recommends modern WebP/AVIF formats instead of legacy JPEGs/PNGs, and video instead of animated GIFs.
3. **Delivery (`image-delivery`)**: Flags instances where natural dimensions are much larger than rendered width/height (Playwright only).
4. **Loading (`image-loading`)**: Warns when above-fold images are lazy-loaded, or offscreen images are loaded eagerly.
5. **Layout Shift (`image-cls`)**: Detects layout shift risks caused by missing width/height attributes or aspect ratios.
6. **LCP Optimization (`image-lcp`)**: Audits LCP images for priority preloading, high fetchpriority, eager loading, and modern format.
7. **Responsive Variants (`image-responsive`)**: Recommends `srcset` for large images to serve responsive sizing.
8. **Caching (`image-caching`)**: Flags suboptimal Cache-Control headers and suggests CDNs.
9. **Alternative Text (`image-alt`)**: Highlights images missing important accessibility `alt` attributes.
10. **Broken links (`image-broken`)**: Detects 4xx/5xx errors, mixed content HTTP security warnings, and decode failures.
