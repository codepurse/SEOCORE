import { Command } from 'commander';
import { runImagesCommand } from '../images/index.js';
import { buildHelp } from '../shared/help.js';

export function command(): Command {
  const cmd = buildHelp(new Command('images'), [
    {
      title: 'Examples',
      lines: [
        'seocore images https://example.com',
        'seocore images https://example.com --crawl',
        'seocore images https://example.com --playwright --format json --output ./images-report.json',
        'seocore images https://example.com --crawl --playwright --output ./seocore-images-report.html',
      ],
    },
  ]);

  cmd
    .description('Analyze images on a webpage or crawl an entire site for image issues')
    .argument('<url>', 'URL to analyze (starting point if crawling)')
    .option('--crawl', 'Crawl the entire site for images (not just the single URL)', false)
    .option('--playwright', 'Use Playwright to capture real browser dimensions, loading strategy, and LCP data', false)
    .option('--threshold-kb <kb>', 'Individual image weight threshold in KB', '100')
    .option('--concurrency <num>', 'Number of concurrent image fetches', '10')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
    .option('--user-agent <ua>', 'Custom user agent string for all requests')
    .option('--max-images <num>', 'Max images to analyze when crawling', '500')
    .option('--format <format>', 'Output format (html or json)', 'html')
    .option('--output <path>', 'Custom output file path')
    .action(runImagesCommand);

  return cmd;
}
