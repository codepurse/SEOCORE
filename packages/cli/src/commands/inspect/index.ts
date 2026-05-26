import { Command } from 'commander';
import { command as robotsCommand } from './robots.js';
import { command as sitemapCommand } from './sitemap.js';
import { command as llmsTxtCommand } from './llms-txt.js';
import { command as schemaCommand } from './schema.js';
import { command as hreflangCommand } from './hreflang.js';
import { command as backlinksCommand } from './backlinks.js';
import { command as rankCommand } from './rank.js';
import { command as screenshotCommand } from './screenshot.js';
import { command as keywordsCommand } from './keywords.js';

export function group(): Command {
  const inspectGroup = new Command('inspect')
    .description('Single-aspect probes for robots, sitemap, schema, etc');

  inspectGroup.addCommand(robotsCommand());
  inspectGroup.addCommand(sitemapCommand());
  inspectGroup.addCommand(llmsTxtCommand());
  inspectGroup.addCommand(schemaCommand());
  inspectGroup.addCommand(hreflangCommand());
  inspectGroup.addCommand(backlinksCommand());
  inspectGroup.addCommand(rankCommand());
  inspectGroup.addCommand(screenshotCommand());
  inspectGroup.addCommand(keywordsCommand());

  return inspectGroup;
}
