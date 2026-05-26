import { SeoEngine } from '@seocore/engine';
import { CompareEngine } from '@seocore/reporter';
import { AuditResult, EventBus } from '@seocore/sdk';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

export function command(): Command {
  return new Command('compare')
    .description('Compare two websites or SEO audit reports')
    .argument('<source1>', 'First URL or audit report JSON file')
    .argument('<source2>', 'Second URL or audit report JSON file')
    .option('--name1 <name>', 'Name for first site')
    .option('--name2 <name>', 'Name for second site')
    .option('--focus <type>', 'Focus comparison on: technical, content, ai-visibility, backlinks, mobile')
    .option('--format <format>', 'Output format: terminal, json, html', 'terminal')
    .option('--output <path>', 'Output file path for json/html formats')
    .action(handler);
}

async function getAuditResult(source: string): Promise<AuditResult> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    console.log(pc.cyan(`\n🕷  Auditing ${source}...`));
    const eventBus = new EventBus();
    const engine = new SeoEngine(eventBus);
    const result = await engine.run(source, { maxPages: 1, maxDepth: 1 });
    return result;
  } else {
    const absolutePath = path.resolve(source);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${source}`);
    }
    const content = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(content);
  }
}

export async function handler(source1: string, source2: string, options: any): Promise<void> {
  try {
    const audit1 = await getAuditResult(source1);
    const audit2 = await getAuditResult(source2);

    const validFoci = ['technical', 'content', 'ai-visibility', 'backlinks', 'mobile'];
    if (options.focus && !validFoci.includes(options.focus)) {
      console.error(pc.red(`Invalid focus: ${options.focus}. Valid options: ${validFoci.join(', ')}`));
      process.exit(1);
    }

    const validFormats = ['terminal', 'json', 'html'];
    if (options.format && !validFormats.includes(options.format)) {
      console.error(pc.red(`Invalid format: ${options.format}. Valid options: ${validFormats.join(', ')}`));
      process.exit(1);
    }

    if (options.format === 'terminal') {
      CompareEngine.report(audit1, audit2, {
        siteAName: options.name1,
        siteBName: options.name2,
        focus: options.focus as 'technical' | 'content' | 'ai-visibility' | 'backlinks' | 'mobile'
      });
    } else if (options.format === 'json') {
      const outputPath = options.output || './seocore-comparison.json';
      const savedPath = CompareEngine.exportJson(audit1, audit2, outputPath, {
        siteAName: options.name1,
        siteBName: options.name2
      });
      console.log(pc.green(`\n✓ Comparison report saved to ${pc.bold(savedPath)}`));
    } else if (options.format === 'html') {
      const outputPath = options.output || './seocore-comparison.html';
      const savedPath = CompareEngine.exportHtml(audit1, audit2, outputPath, {
        siteAName: options.name1,
        siteBName: options.name2
      });
      console.log(pc.green(`\n✓ Comparison report saved to ${pc.bold(savedPath)}`));
    }
  } catch (err: any) {
    console.error(pc.red(`\nComparison failed: ${err.message}`));
    process.exit(1);
  }
}
