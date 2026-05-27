import { Command } from 'commander';
import { command as listCommand } from './list.js';
import { command as describeCommand } from './describe.js';
import { command as explainCommand } from './explain.js';

export function group(): Command {
  const tierGroup = new Command('tier')
    .description('Manage execution tiers');

  tierGroup.addCommand(listCommand());
  tierGroup.addCommand(describeCommand());
  tierGroup.addCommand(explainCommand());

  return tierGroup;
}
