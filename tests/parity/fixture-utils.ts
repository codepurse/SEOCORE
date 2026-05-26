import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PageNormalizer } from '../../packages/analyzers/src/index.ts';
import { resolveConfig } from '../../packages/config/src/index.ts';
import { createDefaultRuleEngine, type RuleEngine } from '../../packages/rules-core/src/index.ts';
import { getPerformanceRules } from '../../packages/rules-performance/src/index.ts';
import { getMobileRules } from '../../packages/rules-mobile/src/index.ts';
import { getAiVisibilityRules } from '../../packages/rules-ai-visibility/src/index.ts';
import { getSecurityRules } from '../../packages/rules-security/src/index.ts';
import { getHreflangRules } from '../../packages/rules-hreflang/src/index.ts';
import type { CrawlResult, ExecutionTierConfig, Finding, NormalizedPage, SeoConfig } from '../../packages/sdk/src/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CANONICAL_FIXTURE_URL = 'https://fixture.seocore.local/';
const CANONICAL_FIXTURE_PATH = path.resolve(__dirname, '../fixtures/canonical-page.html');

export interface ParityFindingSnapshot {
  ruleId: string;
  url: string;
  subCheck: string | null;
  severity: Finding['severity'];
  category: Finding['category'];
  message: string;
  recommendation: string;
  evidence: string | null;
  documentationLink: string | null;
}

function createCrawlResult(overrides: Partial<CrawlResult> & Pick<CrawlResult, 'url' | 'html'>): CrawlResult {
  return {
    url: overrides.url,
    html: overrides.html,
    rawHtml: overrides.rawHtml ?? overrides.html,
    statusCode: overrides.statusCode ?? 200,
    loadTimeMs: overrides.loadTimeMs ?? 1500,
    contentType: overrides.contentType ?? 'text/html',
    headers: overrides.headers ?? {},
    redirectChain: overrides.redirectChain ?? [],
    resources: overrides.resources,
    lighthouse: overrides.lighthouse,
  };
}

function normalizePage(result: CrawlResult, extras: Partial<NormalizedPage> = {}): NormalizedPage {
  return {
    ...PageNormalizer.normalize(result),
    ...extras,
  };
}

function sortSnapshots(findings: ParityFindingSnapshot[]): ParityFindingSnapshot[] {
  return [...findings].sort((a, b) => {
    return [
      a.ruleId.localeCompare(b.ruleId),
      a.url.localeCompare(b.url),
      (a.subCheck ?? '').localeCompare(b.subCheck ?? ''),
      a.severity.localeCompare(b.severity),
      a.message.localeCompare(b.message),
      (a.evidence ?? '').localeCompare(b.evidence ?? ''),
    ].find(value => value !== 0) ?? 0;
  });
}

export function normalizeFindingForParity(finding: Finding): ParityFindingSnapshot {
  return {
    ruleId: finding.ruleId,
    url: finding.url,
    subCheck: finding.subCheck ?? null,
    severity: finding.severity,
    category: finding.category,
    message: finding.message,
    recommendation: finding.recommendation,
    evidence: finding.evidence ?? null,
    documentationLink: finding.documentationLink ?? null,
  };
}

export function createParityConfig(): SeoConfig {
  return resolveConfig(
    {
      preset: 'enterprise',
      tier: 'enterprise',
      maxPages: 5,
      maxDepth: 4,
      playwrightEnabled: true,
      lighthouseEnabled: true,
      ruleOverrides: {},
      excludePatterns: [],
      includePatterns: [],
    },
    path.resolve(__dirname, './nonexistent.seocore.config.json'),
  );
}

export async function createCanonicalPages(): Promise<Record<string, NormalizedPage>> {
  const html = await readFile(CANONICAL_FIXTURE_PATH, 'utf8');

  const primary = normalizePage(
    createCrawlResult({
      url: CANONICAL_FIXTURE_URL,
      html,
      loadTimeMs: 3900,
      headers: {
        'content-type': 'text/html',
        server: 'fixture-server',
      },
      resources: {
        pageSizeBytes: 620000,
        jsSizeBytes: 420000,
        cssSizeBytes: 95000,
        imageSizeBytes: 510000,
        otherSizeBytes: 14000,
        jsRequests: 9,
        cssRequests: 3,
        imageRequests: 2,
        totalRequests: 25,
      },
      lighthouse: {
        score: 0.34,
        coreWebVitals: {
          lcp: 4800,
          cls: 0.22,
          inp: 310,
        },
      },
    }),
    {
      depth: 1,
      inDegree: 1,
      outDegree: 4,
      isOrphan: false,
      authorityScore: 92,
      robotsTxtFound: false,
      sitemapXmlFound: false,
    },
  );

  const duplicate = normalizePage(
    createCrawlResult({
      url: 'https://fixture.seocore.local/duplicate',
      html: html.replaceAll('https://fixture.seocore.local/', 'https://fixture.seocore.local/duplicate'),
      loadTimeMs: 2400,
      headers: {
        'content-type': 'text/html',
      },
    }),
    {
      depth: 4,
      inDegree: 1,
      outDegree: 0,
      isOrphan: false,
      authorityScore: 31,
      robotsTxtFound: true,
      sitemapXmlFound: true,
    },
  );

  const orphan = normalizePage(
    createCrawlResult({
      url: 'https://fixture.seocore.local/orphan',
      html: '<!doctype html><html><head><title>Orphan Fixture Page</title></head><body><p>Orphan page body with repeated repeated repeated content for similarity testing.</p></body></html>',
      loadTimeMs: 800,
      headers: {
        'content-type': 'text/html',
      },
    }),
    {
      depth: 2,
      inDegree: 0,
      outDegree: 0,
      isOrphan: true,
      authorityScore: 12,
    },
  );

  const authoritySink = normalizePage(
    createCrawlResult({
      url: 'https://fixture.seocore.local/sink',
      html: '<!doctype html><html><head><title>Authority Sink Fixture</title></head><body><p>Authority sink page with almost no outbound links.</p></body></html>',
      loadTimeMs: 700,
      headers: {
        'content-type': 'text/html',
      },
    }),
    {
      depth: 2,
      inDegree: 6,
      outDegree: 0,
      isOrphan: false,
      authorityScore: 87,
    },
  );

  const missing = normalizePage(
    createCrawlResult({
      url: 'https://fixture.seocore.local/missing',
      html: '<!doctype html><html><head><title>Missing Fixture Page</title></head><body><p>Missing page body.</p></body></html>',
      statusCode: 404,
      loadTimeMs: 120,
      headers: {
        'content-type': 'text/html',
      },
    }),
    {
      depth: 2,
      inDegree: 1,
      outDegree: 0,
      isOrphan: false,
      authorityScore: 5,
    },
  );

  return {
    [primary.url]: primary,
    [duplicate.url]: duplicate,
    [orphan.url]: orphan,
    [authoritySink.url]: authoritySink,
    [missing.url]: missing,
  };
}

export async function collectParityFindings(): Promise<ParityFindingSnapshot[]> {
  const engine = createCanonicalRuleEngine();
  const pages = await createCanonicalPages();
  const config = createParityConfig();
  const findings = await engine.run(pages, config, new Map());
  return sortSnapshots(findings.map(normalizeFindingForParity));
}

export function createCanonicalRuleEngine(): RuleEngine {
  const engine = createDefaultRuleEngine();
  engine.registerRules(getPerformanceRules());
  engine.registerRules(getMobileRules());
  engine.registerRules(getAiVisibilityRules());
  engine.registerRules(getSecurityRules());
  engine.registerRules(getHreflangRules());
  return engine;
}

export async function collectCanonicalFindings(
  configOverrides: Partial<SeoConfig> = {},
  tierConfig?: ExecutionTierConfig,
): Promise<Finding[]> {
  const engine = createCanonicalRuleEngine();
  const pages = await createCanonicalPages();
  const config = createParityConfig();
  const mergedConfig: SeoConfig = {
    ...config,
    ...configOverrides,
    ruleOverrides: {
      ...config.ruleOverrides,
      ...configOverrides.ruleOverrides,
    },
  };

  return engine.run(pages, mergedConfig, new Map(), tierConfig);
}
