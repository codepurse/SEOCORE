import pc from 'picocolors';
import { EventBus } from '@seocore/sdk';

export function attachStandardEvents(bus: EventBus, opts: { verbose?: boolean } = {}): void {
  bus.on('crawl:start', (data) => {
    console.log(pc.cyan(`\n🕷  Starting Crawler pipeline on ${pc.bold(data.startUrl)}`));
    console.log(pc.gray('──────────────────────────────────────────────────'));
  });

  bus.on('page:loaded', (data) => {
    const codeColor = data.statusCode === 200 ? pc.green : pc.red;
    console.log(
      `  ${pc.gray('[Crawl]')} ${pc.white(data.url)} ` +
      `(${codeColor(String(data.statusCode))}) - ${pc.yellow(`${data.loadTimeMs}ms`)}`
    );
  });

  bus.on('dom:parsed', (data) => {
    if (opts.verbose) {
      console.log(`  ${pc.gray('[Parse]')} Extracted metadata, links (${data.page.links.length}), images (${data.page.images.length})`);
    }
  });

  bus.on('analyzer:completed', (data) => {
    console.log(pc.gray('──────────────────────────────────────────────────'));
    console.log(pc.cyan(`🔍  Evaluating SEO Rule Engine contracts... (${data.findingsCount} findings total)`));
  });

  bus.on('score:calculated', () => {
    console.log(pc.green('✔  Scoring calculated. Generating reports...'));
  });
}
