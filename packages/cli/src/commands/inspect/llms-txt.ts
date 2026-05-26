import { Command } from 'commander';
import pc from 'picocolors';
import { validateUrl, Spinner } from '../../shared/index.js';
import { HttpCrawler, LlmsTxtParser } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import fs from 'fs';
import path from 'path';

export function command(): Command {
  return new Command('llms-txt')
    .description('Check a website\'s llms.txt file for AI crawler directives')
    .argument('<url>', 'Target website URL')
    .option('--json', 'Output results in raw JSON format', false)
    .option('-f, --format <format>', 'Output format: terminal, json', 'terminal')
    .option('-o, --output <path>', 'Export to file')
    .option('--check-bots <bots>', 'Comma-separated list of bots to check', 'GPTBot,ClaudeBot,PerplexityBot,Google-Extended')
    .option('--check-well-known', 'Also check /.well-known/llms.txt', true)
    .option('--verbose', 'Show full directive parsing details', false)
    .action(handler);
}

export async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url);

    const isJson = options.json || options.format === 'json';
    const spinner = new Spinner(`Checking llms.txt for ${url}...`);
    if (!isJson) spinner.start();

    const config = resolveConfig();
    const crawler = new HttpCrawler();

    const baseUrl = new URL(url);
    const llmsTxtUrl = `${baseUrl.origin}/llms.txt`;
    const wellKnownLlmsTxtUrl = `${baseUrl.origin}/.well-known/llms.txt`;

    const [llmsTxtResult, wellKnownLlmsTxtResult] = await Promise.all([
      crawler.crawl(llmsTxtUrl, config),
      options.checkWellKnown ? crawler.crawl(wellKnownLlmsTxtUrl, config) : Promise.resolve(null),
    ]);

    if (!isJson) spinner.stop('Finished llms.txt check.');

    let parseResult: any = null;
    if (llmsTxtResult.statusCode === 200 && llmsTxtResult.html) {
      parseResult = LlmsTxtParser.parse(llmsTxtResult.html);
    } else if (wellKnownLlmsTxtResult?.statusCode === 200 && wellKnownLlmsTxtResult.html) {
      parseResult = LlmsTxtParser.parse(wellKnownLlmsTxtResult.html);
    }

    const botList = options.checkBots ? options.checkBots.split(',') : ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];
    const botAnalyses: any[] = [];
    if (parseResult) {
      for (const bot of botList) {
        botAnalyses.push({
          bot,
          ...LlmsTxtParser.getBotStatus(parseResult, bot),
        });
      }
    }

    const recommendations: string[] = [];
    if (llmsTxtResult.statusCode !== 200 && (!wellKnownLlmsTxtResult || wellKnownLlmsTxtResult.statusCode !== 200)) {
      recommendations.push('No llms.txt file found at either /llms.txt or /.well-known/llms.txt');
    }
    if (options.checkWellKnown && (!wellKnownLlmsTxtResult || wellKnownLlmsTxtResult.statusCode !== 200)) {
      recommendations.push('Consider adding a /.well-known/llms.txt file for standards compliance');
    }
    if (parseResult) {
      for (const bot of botList) {
        const analysis = botAnalyses.find(a => a.bot === bot);
        if (analysis?.status === 'implicit') {
          recommendations.push(`${bot} has no explicit rules. Add a "User-agent: ${bot}" section.`);
        }
      }
    }

    const output = {
      url,
      checkedAt: new Date().toISOString(),
      discovery: {
        llmsTxt: {
          url: llmsTxtUrl,
          statusCode: llmsTxtResult.statusCode,
          found: llmsTxtResult.statusCode === 200,
          sizeBytes: llmsTxtResult.html ? Buffer.byteLength(llmsTxtResult.html, 'utf8') : 0,
        },
        wellKnownLlmsTxt: options.checkWellKnown ? {
          url: wellKnownLlmsTxtUrl,
          statusCode: wellKnownLlmsTxtResult?.statusCode || 0,
          found: wellKnownLlmsTxtResult?.statusCode === 200,
        } : undefined,
      },
      parsing: parseResult ? {
        sections: parseResult.sections,
        totalAllowRules: parseResult.totalAllowRules,
        totalDisallowRules: parseResult.totalDisallowRules,
        parseErrors: parseResult.parseErrors,
      } : undefined,
      botAnalysis: botAnalyses,
      recommendations,
    };

    if (isJson) {
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf8');
        console.log(pc.green(`✓ JSON report saved to ${path.resolve(options.output)}`));
      } else {
        console.log(JSON.stringify(output, null, 2));
      }
      return;
    }

    console.log();
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(pc.bold(pc.cyan('            LLMS.TXT CHECKER                     ')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Target URL:')} ${pc.underline(url)}`);
    console.log(`${pc.bold('Checked At:')} ${new Date().toISOString()}`);
    console.log();

    console.log(pc.bold('LLMS.TXT DISCOVERY:'));
    const llmsFound = llmsTxtResult.statusCode === 200;
    console.log(`  /llms.txt           ${llmsFound ? pc.green('✓ Found') : pc.red('✗ Not Found')} (HTTP ${llmsTxtResult.statusCode})`);
    if (llmsFound && llmsTxtResult.html) {
      console.log(`                       ${pc.gray(`(${Buffer.byteLength(llmsTxtResult.html, 'utf8')} bytes)`)}`);
    }

    if (options.checkWellKnown) {
      const wellKnownFound = wellKnownLlmsTxtResult?.statusCode === 200;
      console.log(`  /.well-known/llms.txt ${wellKnownFound ? pc.green('✓ Found') : pc.red('✗ Not Found')} (HTTP ${wellKnownLlmsTxtResult?.statusCode || 0})`);
      if (wellKnownFound && wellKnownLlmsTxtResult?.html) {
        console.log(`                       ${pc.gray(`(${Buffer.byteLength(wellKnownLlmsTxtResult.html, 'utf8')} bytes)`)}`);
      }
    }
    console.log();

    if (parseResult) {
      console.log(pc.bold('DIRECTIVE SUMMARY:'));
      console.log(`  Total Sections:     ${parseResult.sections.length}`);
      console.log(`  Total Allow Rules:  ${parseResult.totalAllowRules}`);
      console.log(`  Total Disallow Rules: ${parseResult.totalDisallowRules}`);
      if (parseResult.parseErrors.length > 0) {
        console.log(pc.yellow(`  Parse Warnings:     ${parseResult.parseErrors.length}`));
        if (options.verbose) {
          parseResult.parseErrors.forEach((err: string) => {
            console.log(pc.yellow(`    - ${err}`));
          });
        }
      }
      console.log();

      console.log(pc.bold('AI BOT ANALYSIS:'));
      for (const analysis of botAnalyses) {
        const statusColor = analysis.status === 'allowed' ? pc.green : analysis.status === 'disallowed' ? pc.red : pc.yellow;
        const statusIcon = analysis.status === 'allowed' ? '✓' : analysis.status === 'disallowed' ? '✗' : '⚠';
        console.log(`  ${statusIcon} ${pc.bold(analysis.bot.padEnd(20))} ${statusColor(analysis.status.toUpperCase().padEnd(10))}`);
        if (analysis.allowedPaths.length > 0) {
          console.log(`                       Allowed: ${analysis.allowedPaths.join(', ')}`);
        }
        if (analysis.blockedPaths.length > 0) {
          console.log(`                       Blocked: ${analysis.blockedPaths.join(', ')}`);
        }
      }
      console.log();
    } else {
      console.log(pc.yellow('  No llms.txt file found to parse.'));
      console.log();
    }

    if (recommendations.length > 0) {
      console.log(pc.bold(pc.yellow('RECOMMENDATIONS:')));
      recommendations.forEach((rec) => {
        console.log(`  ⚠ ${rec}`);
      });
      console.log();
    }
  } catch (err: any) {
    console.error(pc.red(`\nllms.txt check failed: ${err.message}`));
    process.exit(1);
  }
}
