
// Test the new "seocore schema <url>" command by running it as a child process
import { spawn } from 'child_process';
import * as path from 'path';

const testUrl = 'https://schema.org';

console.log(`Testing "seocore schema ${testUrl}"...\n`);

const child = spawn(
  'npx',
  ['tsx', path.join('packages', 'cli', 'src', 'index.ts'), 'schema', testUrl],
  {
    cwd: __dirname,
    shell: true,
    stdio: 'inherit'
  }
);

child.on('close', (code) => {
  console.log(`\nChild process exited with code ${code}`);
});
