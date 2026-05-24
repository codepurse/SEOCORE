
// Simple Script to Test the Schema.org Validator
import { PageNormalizer, SchemaValidator } from './packages/analyzers/src/index';
import { HttpCrawler } from './packages/crawler/src/index';
import { SchemaReporter } from './packages/cli/src/validate/reporter';

/**
 * Test the validator with a URL
 * @param url - URL to test
 * @param options - test options
 */
async function testUrl(
  url: string, 
  options: { 
    format?: 'terminal' | 'json'; 
    outputPath?: string; 
  } = { format: 'terminal' }
) {
  const crawler = new HttpCrawler();
  const result = await crawler.crawl(url, {} as any);
  const normalized = PageNormalizer.normalize(result);
  const validator = new SchemaValidator();
  const validation = validator.validate(normalized.structuredData, url);

  if (options.format === 'json') {
    SchemaReporter.reportJson(validation, options.outputPath);
  } else {
    SchemaReporter.reportTerminal(validation);
  }

  return validation;
}

// Example Usage:
(async () => {
  console.log('Testing Schema.org Validator...\n');
  await testUrl('https://schema.org');
})();
