import { Command } from 'commander';
import { command as listCommand } from './list.js';
import { command as describeCommand } from './describe.js';
import { command as explainCommand } from './explain.js';
import { buildHelp } from '../../shared/help.js';

export function group(): Command {
  const tierGroup = buildHelp(
    new Command('tier')
      .description('Manage execution tiers'),
    [
      {
        title: 'Subcommands',
        lines: [
          'list       List all execution tiers',
          'describe   Dump tier config for one tier',
          'explain    Explain crawl, module, and scoring behavior',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'seocore tier list',
          'seocore tier describe standard --json',
          'seocore tier explain enterprise',
        ],
      },
    ]
  );

  tierGroup.addCommand(listCommand());
  tierGroup.addCommand(describeCommand());
  tierGroup.addCommand(explainCommand());

  return tierGroup;
}
