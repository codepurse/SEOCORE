import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');

await copyFile(
  path.join(repoRoot, 'README.md'),
  path.join(packageDir, 'README.md'),
);
