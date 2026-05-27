#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';

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

const program = new Command();

program
  .name('seocore')
  .description('Enterprise-grade SEO Analysis Platform')
  .version('1.0.0');

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
