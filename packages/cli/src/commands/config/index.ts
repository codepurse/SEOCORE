import { Command } from 'commander';
import { command as initCommand } from './init.js';
import { command as validateCommand } from './validate.js';
import { command as showCommand } from './show.js';
import { buildHelp } from '../../shared/help.js';

export function group(): Command {
  const configGroup = buildHelp(
    new Command('config')
      .description('Manage and validate SEO config'),
    [
      {
        title: 'Subcommands',
        lines: [
          'init       Create default seocore.config.json',
          'show       Print resolved effective config',
          'validate   Validate config file and print summary',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'seocore config init',
          'seocore config show --json',
          'seocore config validate --config ./seocore.config.json',
        ],
      },
    ]
  );

  configGroup.addCommand(initCommand());
  configGroup.addCommand(validateCommand());
  configGroup.addCommand(showCommand());

  return configGroup;
}
