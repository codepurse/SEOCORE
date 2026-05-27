import pc from 'picocolors';
import type { DirectoryScanResult } from './types.js';

export class DirectoryReporter {
  static report(scanResult: DirectoryScanResult) {
    const { extractedNap, results, targetUrl, provider, warnings } = scanResult;

    console.log();
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(pc.bold(pc.cyan('          BUSINESS DIRECTORY SCOUT (SEMRUSH style)')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Target URL:')} ${pc.underline(targetUrl)}`);
    const providerLabel =
      provider === 'serpapi'
        ? pc.green('SerpAPI live search')
        : provider === 'bing'
          ? pc.cyan('Bing HTML search')
        : provider === 'brave'
          ? pc.cyan('Brave HTML search')
        : provider === 'mojeek'
          ? pc.cyan('Mojeek HTML search')
        : provider === 'duckduckgo'
          ? pc.cyan('DuckDuckGo HTML search')
        : provider === 'cascade'
          ? pc.cyan('HTTP cascade (Bing → Brave → Mojeek → DDG)')
        : provider === 'playwright'
          ? pc.yellow('Playwright live search')
          : provider === 'website-link'
            ? pc.cyan('Website-linked listings')
            : pc.yellow('Mixed evidence');
    console.log(`${pc.bold('Lookup Mode:')} ${providerLabel}`);
    console.log(`${pc.bold('Extracted NAP details:')}`);
    console.log(`  - ${pc.bold('Name:')}    ${pc.green(extractedNap.name)}`);
    console.log(`  - ${pc.bold('Phone:')}   ${pc.green(extractedNap.phone)}`);
    console.log(`  - ${pc.bold('Address:')} ${pc.green(extractedNap.address)}`);
    if (warnings.length > 0) {
      console.log(`${pc.bold('Warnings:')} ${pc.yellow(warnings.join(' | '))}`);
    }
    console.log();

    const colWidths = {
      directory: 25,
      status: 25,
      details: 40,
    };

    const hr = pc.gray('─'.repeat(colWidths.directory + colWidths.status + colWidths.details + 6));
    
    // Table Header
    console.log(hr);
    console.log(
      ' ' +
      pc.bold(pad('Directory', colWidths.directory)) + ' │ ' +
      pc.bold(pad('Status', colWidths.status)) + ' │ ' +
      pc.bold(pad('Details', colWidths.details))
    );
    console.log(hr);

    results.forEach(res => {
      const detailsLines = res.details.split('\n');
      const maxLines = detailsLines.length;

      let statusColor = pc.white;
      if (res.status === 'Issues not found') statusColor = pc.green;
      else if (res.status === 'Not Present') statusColor = pc.gray;
      else if (res.status === 'Search failed') statusColor = pc.yellow;
      else if (res.status.includes('Wrong') || res.status === 'No Phone Number') statusColor = pc.red;

      for (let i = 0; i < maxLines; i++) {
        const dirVal = i === 0 ? res.directory : '';
        const statusVal = i === 0 ? res.status : '';
        const detailVal = detailsLines[i] || '';

        console.log(
          ' ' +
          pad(dirVal, colWidths.directory) + ' │ ' +
          statusColor(pad(statusVal, colWidths.status)) + ' │ ' +
          pc.white(pad(detailVal, colWidths.details))
        );
      }
      console.log(hr);
    });

    console.log();
  }
}

function pad(str: string, width: number): string {
  if (str.length >= width) {
    return str.slice(0, width - 3) + '...';
  }
  return str + ' '.repeat(width - str.length);
}
