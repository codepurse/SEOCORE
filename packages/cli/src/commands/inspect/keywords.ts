import { Command } from 'commander';
import pc from 'picocolors';
import { Spinner } from '../../shared/index.js';
import { performKeywordResearch, KeywordIntelligence, SearchIntent } from '../../keyword-research.js';
import { resolveConfig } from '@seocore/config';
import fs from 'node:fs';
import path from 'node:path';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('keywords')
      .description('Perform advanced SEO keyword research and cluster intelligence')
      .argument('<keyword>', 'Seed keyword to research')
      .option('-e, --expand', 'Perform exhaustive question and alphabetical lookup', false)
      .option('-l, --lang <lang>', 'Language code for suggestions')
      .option('-c, --country <country>', 'Country code for suggestions')
      .option('--include-brands', 'Keep branded/entity-heavy keywords in results', false)
      .option('--strict-noise-filter', 'Hard-filter more brand/entity noise before clustering', false)
      .option('--config <path>', 'Path to seocore.config.json file')
      .option('--json', 'Output results in raw JSON format', false)
      .option('-f, --format <format>', 'Output format: terminal, json, csv, txt', 'terminal')
      .option('-o, --output <path>', 'Export results to a file')
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore inspect keywords "behavioral health"',
          'seocore inspect keywords "behavioral health" --expand',
          'seocore inspect keywords "behavioral health" --lang en --country us --strict-noise-filter',
          'seocore inspect keywords "behavioral health" --format csv --output ./keywords.csv',
        ],
      },
    ]
  );
}

function toCSV(data: KeywordIntelligence): string {
  const rows = [[
    'Keyword',
    'Intent',
    'Score',
    'Heuristic Score',
    'Noise Score',
    'Business Intent',
    'Topical Importance',
    'Cluster',
    'Cluster Kind',
    'Source Type',
  ]];
  
  data.clusters.forEach(cluster => {
    cluster.keywords.forEach(k => {
      rows.push([
        k.keyword,
        k.intent,
        k.score.toString(),
        k.heuristicScore.toString(),
        k.noiseScore.toString(),
        k.businessIntentScore.toString(),
        k.topicalImportance.toString(),
        cluster.name,
        cluster.kind,
        k.sourceType
      ]);
    });
  });
  
  return rows.map(r => r.map(v => `"${v.replaceAll('"', '""')}"`).join(',')).join('\n');
}

function writeKeywordOutputToFile(result: KeywordIntelligence, options: any): void {
  let content = '';
  const fmt = options.format.toLowerCase();
  if (fmt === 'json' || options.json) {
    content = JSON.stringify(result, null, 2);
  } else if (fmt === 'csv') {
    content = toCSV(result);
  } else {
    content = result.allScoredKeywords.map(k => k.keyword).join('\n');
  }

  fs.writeFileSync(options.output, content, 'utf8');
  console.log(pc.green(`✓ Keyword intelligence saved to ${path.resolve(options.output)}`));
}

function getIntentTag(intent: SearchIntent): string {
  switch (intent) {
    case 'transactional':
      return pc.green('[TRANSACT]');
    case 'commercial':
      return pc.cyan('[COMMERC]');
    case 'local':
      return pc.yellow('[LOCAL]');
    case 'informational':
      return pc.blue('[INFORM]');
    case 'jobs-career':
      return pc.gray('[CAREERS]');
  }
}

function getColoredScore(score: number): string {
  if (score >= 80) return pc.bold(pc.green(`Score: ${score}`));
  if (score >= 50) return pc.yellow(`Score: ${score}`);
  return pc.gray(`Score: ${score}`);
}

function printKeywordTerminalDisplay(
  result: KeywordIntelligence,
  keyword: string,
  options: any
): void {
  console.log();
  console.log(pc.bold(pc.cyan('====================================================================')));
  console.log(pc.bold(pc.cyan('                SEO KEYWORD INTELLIGENCE REPORT                     ')));
  console.log(pc.bold(pc.cyan('====================================================================')));
  console.log(`${pc.bold('Seed Keyword:')} ${pc.yellow(keyword)}`);
  console.log(`${pc.bold('Language/Geo:')} ${pc.green(result.lang.toUpperCase())} / ${pc.green(result.country.toUpperCase())}`);
  console.log(`${pc.bold('Checked At:')}   ${pc.gray(result.checkedAt)}`);
  console.log();

  // Metrics Section
  console.log(pc.bold('📊 SCAN METRICS:'));
  console.log(pc.gray('────────────────────────────────────────────────────────────────────'));
  console.log(`• Suggestions Scraped: ${pc.bold(result.metrics.totalDiscovered)}`);
  console.log(`• Unique SEO Keywords: ${pc.bold(pc.green(result.metrics.totalFiltered))}`);
  console.log(`• Hard-filtered Noise: ${pc.bold(pc.yellow(result.metrics.totalHardFiltered))}`);
  console.log(`• Soft Down-ranked: ${pc.bold(pc.yellow(result.metrics.totalSoftDownRanked))}`);
  
  const dist = result.metrics.intentsDistribution;
  const distStr = [
    pc.blue(`Informational: ${dist.informational}`),
    pc.cyan(`Commercial: ${dist.commercial}`),
    pc.green(`Transactional: ${dist.transactional}`),
    pc.yellow(`Local: ${dist.local}`),
    pc.gray(`Careers: ${dist['jobs-career']}`)
  ].join(' | ');
  console.log(`• Intent Distribution: ${distStr}`);
  console.log();

  // Topic Clusters Section
  console.log(pc.bold('📂 TOPICAL CLUSTERS:'));
  console.log(pc.gray('────────────────────────────────────────────────────────────────────'));

  if (result.clusters.length === 0) {
    console.log(pc.yellow('No keywords matched. Try another seed.'));
    console.log();
    return;
  }

  result.clusters.forEach(cluster => {
    const numKeywords = cluster.keywords.length;
    const avgScoreStr = cluster.averageScore >= 70 ? pc.green(`${cluster.averageScore}`) : pc.yellow(`${cluster.averageScore}`);
    const qualityScoreStr = cluster.qualityScore >= 70 ? pc.green(`${cluster.qualityScore}`) : pc.yellow(`${cluster.qualityScore}`);
    
    console.log(
      pc.bold(
        `📁 ${pc.white(cluster.name)} ` +
        pc.gray(`(${cluster.kind}, ${numKeywords} kws, Avg SEO Score: ${avgScoreStr}, Quality: ${qualityScoreStr}, Intent: ${getIntentTag(cluster.primaryIntent)})`)
      )
    );
    console.log(pc.gray(' ──────────────────────────────────────────────────────────────────'));

    // Print top 8 keywords per cluster to avoid massive terminal overflow
    const terminalLimit = 8;
    cluster.keywords.slice(0, terminalLimit).forEach(k => {
      const spacing = ' '.repeat(Math.max(1, 35 - k.keyword.length));
      console.log(`   • ${pc.bold(pc.white(k.keyword))}${spacing}${getIntentTag(k.intent)}  [${getColoredScore(k.score)}]`);
    });

    if (numKeywords > terminalLimit) {
      console.log('     ' + pc.gray(`... and ${numKeywords - terminalLimit} more in this cluster. (Run with -o to save full report)`));
    }
    console.log();
  });

  if (!options.expand) {
    console.log(pc.gray('💡 Tip: Use --expand (-e) to perform deep semantic question & long-tail alphabet mining.'));
    console.log();
  }
}

export async function handler(keyword: string, options: any): Promise<void> {
  try {
    const config = resolveConfig({}, options.config);
    const isJson = options.json || options.format === 'json';
    const lang = options.lang || config.keywordIntelligence?.locale || 'en';
    const country = options.country || config.keywordIntelligence?.region || 'us';

    const spinnerMsg = options.expand 
      ? `Analyzing deep keyword clusters & intents for "${keyword}"...`
      : `Gathering keyword intelligence & mapping clusters for "${keyword}"...`;

    const spinner = new Spinner(spinnerMsg);
    const quietMode = isJson || options.format === 'csv' || options.format === 'txt';
    if (!quietMode) spinner.start();

    const result = await performKeywordResearch(keyword, {
      lang,
      country,
      expand: options.expand,
      includeBrands: options.includeBrands,
      strictNoiseFilter: options.strictNoiseFilter,
      providerConfig: config.keywordIntelligence,
    });

    if (!quietMode) spinner.stop('Keyword intelligence complete.');

    // 1. Export to file
    if (options.output) {
      writeKeywordOutputToFile(result, options);
      return;
    }

    // 2. stdout formats
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (options.format === 'csv') {
      console.log(toCSV(result));
      return;
    }

    if (options.format === 'txt') {
      console.log(result.allScoredKeywords.map(k => k.keyword).join('\n'));
      return;
    }

    // 3. Rich Color-coded Terminal UI
    printKeywordTerminalDisplay(result, keyword, options);

  } catch (err: any) {
    console.error(pc.red(`\nKeyword research failed: ${err.message}`));
    process.exit(1);
  }
}
