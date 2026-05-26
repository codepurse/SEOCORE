import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectParityFindings } from './fixture-utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '../fixtures/expected-findings.json');

async function main(): Promise<void> {
  const findings = await collectParityFindings();

  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        equality:
          'ruleId + url + subCheck + severity + category + message + recommendation + evidence + documentationLink',
        findings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`Wrote ${findings.length} canonical parity findings to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
