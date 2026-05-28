import { access, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const packagesDir = path.join(repoRoot, 'packages');
const distDir = path.join(packageDir, 'dist');

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectInternalAliases() {
  const aliases = new Map();
  const entries = await readdir(packagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packagePath = path.join(packagesDir, entry.name);
    const manifestPath = path.join(packagePath, 'package.json');
    const sourceEntry = path.join(packagePath, 'src', 'index.ts');

    if (!(await fileExists(manifestPath)) || !(await fileExists(sourceEntry))) {
      continue;
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (typeof manifest.name === 'string' && manifest.name.startsWith('@seocore/')) {
      aliases.set(manifest.name, sourceEntry);
    }
  }

  return aliases;
}

const internalAliases = await collectInternalAliases();

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [path.join(packageDir, 'src', 'index.ts')],
  outdir: distDir,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'seocore-internal-aliases',
      setup(buildContext) {
        buildContext.onResolve({ filter: /^@seocore\// }, (args) => {
          const resolved = internalAliases.get(args.path);
          if (!resolved) {
            return {
              errors: [{ text: `Unmapped internal package import: ${args.path}` }],
            };
          }

          return { path: resolved };
        });
      },
    },
  ],
});
