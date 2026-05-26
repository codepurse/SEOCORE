import { Command } from 'commander';
import { command as initCommand } from './init.js';
import { command as validateCommand } from './validate.js';
import { command as showCommand } from './show.js';

export function group(): Command {
  const configGroup = new Command('config')
    .description('Manage and validate SEO config');

  configGroup.addCommand(initCommand());
  configGroup.addCommand(validateCommand());
  configGroup.addCommand(showCommand());

  return configGroup;
}
