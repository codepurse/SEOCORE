import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { resolveConfig } from '@seocore/config';
import { HttpCrawler } from '@seocore/crawler';
import { PageNormalizer, SchemaValidator } from '@seocore/analyzers';
import { SchemaReporter } from '../../validate/reporter.js';

export function command(): Command {
  return new Command('schema')
    .description('Validate Schema.org structured data')
    .argument('<url>', 'Target URL')
    .option('--schema <types>', 'Filter to specific schema types (comma-separated)')
    .option('--json', 'Output raw JSON')
    .option('-f, --format <format>', 'Output format: terminal, json, sarif', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);

    const config = resolveConfig();
    const spinner = new Spinner('Validating Schema.org structured data...');
    if (options.format !== 'json' && !options.json) spinner.start();

    const crawler = new HttpCrawler();
    const crawlResult = await crawler.crawl(url, config);

    if (crawlResult.error) {
      throw new Error(crawlResult.error);
    }

    const normalizedPage = PageNormalizer.normalize(crawlResult);
    const validator = new SchemaValidator();
    let validationResult = validator.validate(normalizedPage.structuredData, url, normalizedPage);

    if (options.schema) {
      const targetTypes = options.schema.split(',').map((t: string) => t.trim().toLowerCase());
      validationResult = {
        ...validationResult,
        schemas: validationResult.schemas.filter((schema: any) =>
          targetTypes.includes(schema.type.toLowerCase())
        )
      };
      validationResult.totalSchemas = validationResult.schemas.length;
      validationResult.validSchemas = validationResult.schemas.filter((s: any) => s.valid).length;
      validationResult.invalidSchemas = validationResult.totalSchemas - validationResult.validSchemas;
      validationResult.totalErrors = validationResult.schemas.reduce((sum: number, s: any) => sum + s.issues.filter((i: any) => i.level === 'error').length, 0);
      validationResult.totalWarnings = validationResult.schemas.reduce((sum: number, s: any) => sum + s.issues.filter((i: any) => i.level === 'warning').length, 0);
    }

    if (options.format !== 'json' && !options.json && options.format !== 'sarif') spinner.stop('Validation complete!');

    if (options.json || options.format === 'json') {
      SchemaReporter.reportJson(validationResult, options.output);
    } else if (options.format === 'sarif') {
      SchemaReporter.reportSarif(validationResult, options.output || './seocore-schema-report.sarif');
    } else {
      SchemaReporter.reportTerminal(validationResult);
      if (options.output) {
        if (options.output.endsWith('.sarif')) {
          SchemaReporter.reportSarif(validationResult, options.output);
        } else {
          SchemaReporter.reportJson(validationResult, options.output);
        }
      }
    }

  } catch (err: any) {
    console.error(pc.red(`\nValidation failed: ${err.message}`));
    process.exit(1);
  }
}
