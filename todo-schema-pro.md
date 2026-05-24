# SEOCORE Professional-Grade Schema Auditing Engine Road Map

## Overview
Rebuild basic JSON-LD validator into unified dynamic entity graph auditor. Evaluates parsing formats, dynamic JavaScript renders, graph relationships, Google snippet rules, E-E-A-T markers, and metadata discrepancies.

---

## Phase 1: Unified Parser Pipeline
- [ ] **1.1 Playwright Dynamic Fetcher**: Pass raw HTML vs Playwright snap to capture JS-rendered schemas.
- [ ] **1.2 Microdata Extractor**: Read inline properties (`itemscope`, `itemtype`, `itemprop`, `itemid`).
- [ ] **1.3 RDFa Extractor**: Read inline properties (`vocab`, `typeof`, `property`, `resource`, `content`).
- [ ] **1.4 Normalizer Bridge**: Merge raw elements from all formats into consolidated schema array.

---

## Phase 2: Entity Graph Stitching
- [ ] **2.1 ID Collector**: Catalog all nodes containing `@id`, `itemid`, or canonical URLs.
- [ ] **2.2 Pointer Resolver**: Replace referencing properties (e.g. `"publisher": { "@id": "org" }`) with full linked objects.
- [ ] **2.3 Loop Detector**: Handle circular entity pointers cleanly without infinite nesting.
- [ ] **2.4 Hierarchy Mapper**: Build output DAG structure showing root nodes to leaf structures.

---

## Phase 3: Rule Compiler & Profiles
- [ ] **3.1 Dynamic Ontology Parser**: Compile full Schema.org schema definitions (JSON-LD context) instead of static hardcoding.
- [ ] **3.2 Google Snippet Rule Base**: Define Rich Results Gallery parameters (Article, Breadcrumb, Product, LocalBusiness).
- [ ] **3.3 E-E-A-T Trust Auditor**: Evaluate outbound authority links (`sameAs`, `knowsAbout`, `author.sameAs` matching Wikipedia/Wikidata).
- [ ] **3.4 Integrity Cross-Checker**: Compare JSON-LD values (Price, Currency, Title, URL) against OpenGraph, Twitter Cards, and canonical tags.

---

## Phase 4: Scoring & Diagnostics
- [ ] **4.1 Weighted Scoring Formula**: Define Semantic Quality Score (SCI) based on requirements, recommendations, and trust factors.
- [ ] **4.2 Actionable Recommendations Engine**: Suggest exact JSON-LD node patches to remedy failures.
- [ ] **4.3 Dev-Friendly Console Format**: Visual DAG layout representation in colored terminal block.
- [ ] **4.4 Pro-Grade Schema validation output (JSON/SARIF)**.
