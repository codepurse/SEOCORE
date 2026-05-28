import { Command } from 'commander';
import { command as listCommand } from './list.js';
import { command as describeCommand } from './describe.js';
import { command as explainCommand } from './explain.js';
import { buildHelp } from '../../shared/help.js';

export function group(): Command {
  const rulesGroup = buildHelp(
    new Command('rules')
      .description('Manage and inspect SEO validation rules'),
    [
      {
        title: 'Subcommands',
        lines: [
          'list       List enabled rules with severity and weight',
          'describe   Show focused details for one rule',
          'explain    Show full rule metadata and effective config',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'seocore rules list',
          'seocore rules describe missing-title',
          'seocore rules explain duplicate-h1 --json',
        ],
      },
    ]
  );

  rulesGroup.addCommand(listCommand());
  rulesGroup.addCommand(describeCommand());
  rulesGroup.addCommand(explainCommand());

  return rulesGroup;
}
