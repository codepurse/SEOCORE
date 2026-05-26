import { Command } from 'commander';
import { runTechnologyCommand } from '../technology/index.js';

export function command(): Command {
  const cmd = new Command('technology');

  cmd
    .description('Detect website technology stack with evidence-based confidence scores')
    .argument('<url>', 'URL to analyze')
    .option('--json', 'Output JSON (same as --format json)')
    .option('-f, --format <format>', 'Output format: terminal, json, html', 'terminal')
    .option('-o, --output <path>', 'Output file path (for json/html)')
    .option('-v, --verbose', 'Show detailed evidence for each detection')
    .action((url, options) => {
      if (options.json) {
        options.format = 'json';
      }
      runTechnologyCommand(url, options);
    });

  return cmd;
}
