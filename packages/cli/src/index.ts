#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { command as auditCommand } from './commands/audit.js';
import { command as compareCommand } from './commands/compare.js';
import { command as crawlCommand } from './commands/crawl.js';
import { command as directoriesCommand } from './commands/directories.js';
import { command as imagesCommand } from './commands/images.js';
import { command as jsImpactCommand } from './commands/js-impact/index.js';
import { command as technologyCommand } from './commands/technology.js';

import { group as analyzeGroup } from './commands/analyze/index.js';
import { group as configGroup } from './commands/config/index.js';
import { group as inspectGroup } from './commands/inspect/index.js';
import { group as rulesGroup } from './commands/rules/index.js';
import { group as tierGroup } from './commands/tier/index.js';

import { registerLegacyAliases } from './commands/legacy-aliases.js';
import { buildHelp } from './shared/help.js';

const program = buildHelp(new Command(), [
  {
    title: 'Quick Start',
    lines: [
      'seocore audit https://example.com',
      'seocore audit https://example.com --full --format html --output ./seocore-report.html',
      'seocore inspect sitemap https://example.com --check-links',
      'seocore analyze link-plan https://example.com --top 20',
      'seocore config init',
    ],
  },
  {
    title: 'Command Map',
    lines: [
      'audit | crawl | compare | images | technology | js-impact | directories',
      'inspect robots|sitemap|llms-txt|schema|hreflang|backlinks|rank|screenshot|keywords',
      'analyze ai-visibility|content|schema-graph|link-plan|opportunities|security',
      'config init|show|validate',
      'rules list|describe|explain',
      'tier list|describe|explain',
    ],
  },
  {
    title: 'Help Tips',
    lines: [
      'seocore <command> --help',
      'seocore inspect <subcommand> --help',
      'seocore analyze <subcommand> --help',
    ],
  },
]);

function resolveVersion(): string {
  // Resolves in dev (src/../package.json via tsx) and when bundled (dist/../package.json).
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(dir, '..', 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

program
  .name('seocore')
  .description('Enterprise-grade SEO Analysis Platform')
  .version(resolveVersion());

program.addCommand(auditCommand());
program.addCommand(crawlCommand());
program.addCommand(compareCommand());
program.addCommand(imagesCommand());
program.addCommand(technologyCommand());
program.addCommand(jsImpactCommand());
program.addCommand(directoriesCommand());

program.addCommand(inspectGroup());
program.addCommand(analyzeGroup());
program.addCommand(configGroup());
program.addCommand(rulesGroup());
program.addCommand(tierGroup());

registerLegacyAliases(program);

program.parseAsync(process.argv).catch(err => {
  console.error(pc.red(`Error: ${err.message}`));
  process.exit(1);
});
