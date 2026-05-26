import { Command } from 'commander';
import { command as listCommand } from './list.js';
import { command as describeCommand } from './describe.js';

export function group(): Command {
  const rulesGroup = new Command('rules')
    .description('Manage and inspect SEO validation rules');

  rulesGroup.addCommand(listCommand());
  rulesGroup.addCommand(describeCommand());

  return rulesGroup;
}
