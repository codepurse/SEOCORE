You are a senior software architect and lead engineer helping design and implement a professional-grade SEO analysis platform built with Node.js + TypeScript.

Your task is to help build the MVP foundation of an enterprise-ready SEO CLI platform designed for scalability, extensibility, maintainability, and future cloud expansion.

This is NOT a simple SEO checker. The architecture must resemble premium-grade tools like:

* Screaming Frog
* Ahrefs Site Audit
* Semrush Site Audit
* Sitebulb
* Google Lighthouse

The project must prioritize:

* clean architecture
* modularity
* plugin extensibility
* deterministic analysis
* scalability
* machine-readable outputs
* future distributed execution

==================================================
PROJECT GOAL
============

Build a professional SEO auditing CLI capable of:

* crawling websites
* extracting normalized SEO data
* evaluating SEO rules
* generating findings
* calculating weighted scores
* exporting structured reports
* supporting plugins
* integrating AI advisory capabilities later

The MVP should already establish enterprise-grade architecture boundaries even if feature scope starts smaller.

==================================================
CORE ARCHITECTURE REQUIREMENTS
==============================

Architecture Style:

* Nx monorepo
* micro-package architecture
* plugin-first design
* event-driven internal pipeline
* strict TypeScript
* strongly typed contracts everywhere

Core packages:

* @seocore/engine
* @seocore/crawler
* @seocore/rules
* @seocore/analyzers
* @seocore/scoring
* @seocore/reporter
* @seocore/sdk
* @seocore/config
* @seocore/cli

==================================================
IMPORTANT DESIGN PRINCIPLES
===========================

1. Strict Separation of Concerns
   Pipeline must follow:

crawl → extract → normalize → analyze → score → report

Do NOT mix DOM extraction logic with rule evaluation logic.

2. Normalized Page Model
   All analyzers consume a shared normalized page schema instead of directly querying DOM repeatedly.

Normalized page data should include:

* titles
* meta tags
* canonical
* headings
* images
* links
* structured data
* scripts
* stylesheets
* robots directives
* hreflang
* accessibility signals
* performance metrics

3. Rule Engine First
   SEO checks must be declarative rules, not scattered hardcoded logic.

Rules should support:

* severity
* category
* score weight
* recommendations
* evidence
* documentation links
* machine-readable output

4. Event-Driven System
   Use typed internal events for orchestration:

* crawl:start
* page:loaded
* dom:parsed
* analyzer:completed
* score:calculated
* report:generated
* audit:complete

5. Unified Finding Schema
   All analyzers and plugins must output a standardized finding structure.

6. AI Is Advisory Only
   AI must NEVER control deterministic scoring or validation logic.

AI should only:

* summarize findings
* prioritize fixes
* explain issues
* generate remediation guidance

==================================================
MVP FEATURE SCOPE
=================

The MVP should include:

Crawler:

* HTTP crawler
* Playwright crawler
* single-page audits
* basic multi-page crawl
* robots.txt support
* sitemap parsing support
* configurable concurrency
* retry handling
* rate limiting

Normalized Extraction:

* title
* meta description
* headings
* canonical
* robots meta
* internal/external links
* image alt attributes
* structured data
* hreflang
* status codes

Rule Engine:
Implement core rules for:

* missing title
* duplicate title
* missing meta description
* missing H1
* multiple H1
* missing alt text
* broken links
* canonical issues
* noindex detection
* redirect chains
* missing structured data
* missing robots.txt
* missing sitemap.xml

Scoring:

* weighted scoring engine
* category scores
* total SEO score
* severity-based deductions

Reporting:

* rich terminal output
* JSON export
* grouped findings
* summary statistics
* machine-readable schema

CLI:
Commands:

* audit
* crawl
* rules:list
* config:init

==================================================
PERFORMANCE REQUIREMENTS
========================

The architecture must support:

* concurrency control
* queue-based crawling
* streaming findings
* memory-safe processing
* worker pool compatibility
* incremental audits later
* caching later
* distributed crawling later

Avoid architectures that only work on small websites.

==================================================
PLUGIN SYSTEM REQUIREMENTS
==========================

Plugins must support:

* analyzers
* rules
* reporters
* AI providers later

Plugin system should support:

* versioned APIs
* isolated configuration
* lifecycle hooks
* future sandboxing
* timeout protection

Provide a typed SDK for plugin authors.

==================================================
CONFIG REQUIREMENTS
===================

Use schema-based validation (prefer Zod).

Support:

* local config
* project config
* environment overrides
* rule overrides
* rule packs
* per-domain config

==================================================
AUDIT MODES
===========

Support audit presets:

quick:

* HTTP only
* limited rules
* fast execution

standard:

* broader analysis
* moderate crawl depth

deep:

* Playwright rendering
* advanced analysis
* Lighthouse integration ready

enterprise:

* full crawl graph
* advanced topology analysis
* maximum rule coverage

==================================================
CLI EXPERIENCE
==============

CLI UX should feel premium.

Include:

* progress indicators
* crawl statistics
* grouped findings
* colored output
* filters
* summary tables
* silent/machine-readable mode

==================================================
OBSERVABILITY
=============

Include architecture support for:

* structured logging
* metrics
* tracing
* profiling
* memory tracking
* debug mode

==================================================
IMPORTANT CONSTRAINTS
=====================

* Prioritize maintainability over shortcuts
* Prioritize extensibility over premature optimization
* Keep interfaces stable and strongly typed
* Avoid tightly coupling subsystems
* Design for future API/server/dashboard expansion
* Keep outputs serializable and deterministic
* Prefer composition over inheritance
* Use modern TypeScript best practices

==================================================
YOUR TASK
=========

Generate:

1. MVP technical architecture
2. Package-by-package responsibilities
3. Folder structure
4. Core interfaces and TypeScript types
5. Event system design
6. Plugin lifecycle
7. Rule engine design
8. Crawl pipeline design
9. Normalized page schema
10. Scoring engine design
11. Reporting architecture
12. CLI architecture
13. Recommended libraries per subsystem
14. Development roadmap
15. Initial implementation priorities
16. Risks and architectural tradeoffs

The output should be practical, implementation-focused, scalable, and production-oriented.
