import fs from 'node:fs';
import path from 'node:path';

interface BaselineFinding {
  ruleId: string;
  url: string;
  subCheck: string | null;
  severity: string;
  category: string;
  message: string;
  recommendation: string;
  evidence: string | null;
  documentationLink: string | null;
}

interface NormalizedAudit {
  score: number;
  categories: Record<string, number>;
  findings: BaselineFinding[];
}

function normalizeAudit(filePath: string): NormalizedAudit {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    score: number;
    categories: Record<string, { score: number }>;
    findings: Array<{
      ruleId: string;
      url: string;
      subCheck?: string;
      severity: string;
      category: string;
      message: string;
      recommendation: string;
      evidence?: string;
      documentationLink?: string;
    }>;
  };

  return {
    score: raw.score,
    categories: Object.fromEntries(
      Object.entries(raw.categories).map(([category, value]) => [category, value.score]),
    ),
    findings: raw.findings
      .map((finding) => ({
        ruleId: finding.ruleId,
        url: finding.url,
        subCheck: finding.subCheck ?? null,
        severity: finding.severity,
        category: finding.category,
        message: finding.message,
        recommendation: finding.recommendation,
        evidence: finding.evidence ?? null,
        documentationLink: finding.documentationLink ?? null,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

function compareTier(tier: string, expectedPath: string, actualPath: string): boolean {
  const expected = normalizeAudit(expectedPath);
  const actual = normalizeAudit(actualPath);

  const same = JSON.stringify(expected) === JSON.stringify(actual);
  console.log(`${tier}: ${same ? 'MATCH' : 'DIFF'}`);

  if (!same) {
    console.log(`  score: ${expected.score} -> ${actual.score}`);
    console.log(`  findings: ${expected.findings.length} -> ${actual.findings.length}`);
  }

  return same;
}

const rootDir = process.cwd();
const tiers = ['fast', 'standard', 'deep'] as const;

let hasDiff = false;
for (const tier of tiers) {
  const expectedPath = path.resolve(rootDir, `tests/fixtures/phase-3-baseline/${tier}.json`);
  const actualPath = path.resolve(rootDir, `tmp-phase3-${tier}.json`);

  if (!fs.existsSync(actualPath)) {
    console.log(`${tier}: MISSING actual file ${actualPath}`);
    hasDiff = true;
    continue;
  }

  if (!compareTier(tier, expectedPath, actualPath)) {
    hasDiff = true;
  }
}

process.exit(hasDiff ? 1 : 0);
