# JavaScript SEO Impact Report

The `js-impact` command helps you analyze how JavaScript changes your page's SEO-relevant content.

## Usage

```bash
seo js-impact <url> [options]
```

## Options

- `-w, --wait-event <event>`: Wait event before capture (load, domcontentloaded, networkidle) — default: networkidle
- `-t, --timeout-ms <ms>`: Timeout in milliseconds — default: 30000
- `-e, --wait-extra-ms <ms>`: Extra wait time in milliseconds — default: 0
- `-o, --output <format>`: Output format (terminal, json, html, markdown) — default: terminal
- `--output-file <path>`: Output file for non-terminal formats

## Examples

```bash
# Analyze a page and show terminal output
seo js-impact https://example.com

# Analyze a page and save HTML report
seo js-impact https://example.com --output html --output-file report.html

# Analyze with custom wait event and timeout
seo js-impact https://example.com --wait-event load --timeout-ms 45000
```
