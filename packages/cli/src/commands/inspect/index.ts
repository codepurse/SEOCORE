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
import { buildHelp } from '../../shared/help.js';

export function group(): Command {
  const inspectGroup = buildHelp(
    new Command('inspect')
      .description('Single-aspect probes for robots, sitemap, schema, etc'),
    [
      {
        title: 'Subcommands',
        lines: [
          'robots       Check robots.txt availability and contents',
          'sitemap      Check sitemap.xml and optional URL reachability',
          'llms-txt     Check AI crawler directives in llms.txt',
          'schema       Validate structured data and export SARIF/JSON',
          'hreflang     Validate hreflang tags and alternates',
          'backlinks    Analyze backlinks from configured provider',
          'rank         Check Google top-10 ranking for keyword + URL',
          'screenshot   Capture page or site screenshots with Playwright',
          'keywords     Run keyword research and clustering',
        ],
      },
      {
        title: 'Examples',
        lines: [
          'seocore inspect robots https://example.com',
          'seocore inspect sitemap https://example.com --check-links',
          'seocore inspect llms-txt https://example.com --verbose',
          'seocore inspect schema https://example.com --format sarif --output ./schema.sarif',
          'seocore inspect screenshot https://example.com --breakpoints mobile,desktop --full-page',
          'seocore inspect keywords "behavioral health" --expand --format csv --output ./keywords.csv',
        ],
      },
    ]
  );

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
