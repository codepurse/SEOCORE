import { Command } from 'commander';
import { command as aiVisibilityCommand } from './ai-visibility.js';
import { command as contentCommand } from './content.js';
import { command as schemaGraphCommand } from './schema-graph.js';
import { command as linkPlanCommand } from './link-plan.js';
import { command as opportunitiesCommand } from './opportunities.js';
import { buildHelp } from '../../shared/help.js';

export function group(): Command {
  const analyzeGroup = buildHelp(
    new Command('analyze')
      .description('Analyzer-driven deep dives (content, AI visibility, schema graph, link plan, opportunities)'),
    [
      {
        title: 'Subcommands',
        lines: [
          'ai-visibility   Analyze AI crawler visibility and structure',
          'content         Analyze E-E-A-T and content quality',
          'schema-graph    Map structured data entities and references',
          'link-plan       Generate internal linking recommendations',
          'opportunities   Rank high-impact SEO opportunities',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'seocore analyze ai-visibility https://example.com',
          'seocore analyze content https://example.com/blog/post --format html --output ./content-report.html',
          'seocore analyze schema-graph https://example.com --format mermaid',
          'seocore analyze link-plan https://example.com --top 20 --min-confidence 60',
          'seocore analyze opportunities https://example.com --with-gsc --gsc-file ./gsc-pages.json --verbose',
        ],
      },
    ]
  );

  analyzeGroup.addCommand(aiVisibilityCommand());
  analyzeGroup.addCommand(contentCommand());
  analyzeGroup.addCommand(schemaGraphCommand());
  analyzeGroup.addCommand(linkPlanCommand());
  analyzeGroup.addCommand(opportunitiesCommand());

  return analyzeGroup;
}
