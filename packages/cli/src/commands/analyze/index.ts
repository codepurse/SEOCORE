import { Command } from 'commander';
import { command as aiVisibilityCommand } from './ai-visibility.js';
import { command as contentCommand } from './content.js';
import { command as schemaGraphCommand } from './schema-graph.js';
import { command as linkPlanCommand } from './link-plan.js';
import { command as opportunitiesCommand } from './opportunities.js';

export function group(): Command {
  const analyzeGroup = new Command('analyze')
    .description('Analyzer-driven deep dives (content, AI visibility, schema graph, link plan, opportunities)');

  analyzeGroup.addCommand(aiVisibilityCommand());
  analyzeGroup.addCommand(contentCommand());
  analyzeGroup.addCommand(schemaGraphCommand());
  analyzeGroup.addCommand(linkPlanCommand());
  analyzeGroup.addCommand(opportunitiesCommand());

  return analyzeGroup;
}
