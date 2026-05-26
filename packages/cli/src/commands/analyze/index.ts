import { Command } from 'commander';
import { command as aiVisibilityCommand } from './ai-visibility.js';
import { command as contentCommand } from './content.js';

export function group(): Command {
  const analyzeGroup = new Command('analyze')
    .description('Analyzer-driven deep dives (content, AI visibility)');

  analyzeGroup.addCommand(aiVisibilityCommand());
  analyzeGroup.addCommand(contentCommand());

  return analyzeGroup;
}
