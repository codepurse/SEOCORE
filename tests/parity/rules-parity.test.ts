import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectParityFindings, type ParityFindingSnapshot } from './fixture-utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const expectedFindingsPath = path.resolve(__dirname, '../fixtures/expected-findings.json');

describe('Phase 3 parity baseline', () => {
  it('matches canonical fixture findings snapshot', async () => {
    const rawExpected = await readFile(expectedFindingsPath, 'utf8');
    const expected = JSON.parse(rawExpected) as {
      findings: ParityFindingSnapshot[];
    };

    const actual = await collectParityFindings();

    expect(actual).toEqual(expected.findings);
  });
});
