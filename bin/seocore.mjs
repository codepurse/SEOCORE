#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliEntry = resolve(__dirname, '..', 'packages', 'cli', 'src', 'index.ts');
const tsxBin = resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

const child = spawn(process.execPath, [tsxBin, cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to launch seocore:', err.message);
  process.exit(1);
});
