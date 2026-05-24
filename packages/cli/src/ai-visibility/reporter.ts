import chalk from 'chalk';
import { CheckResult } from './types.js';

type ScoreLevel = 'low' | 'mid' | 'high';

interface DimensionDescription {
  low: string;   // score 0–49
  mid: string;   // score 50–79
  high: string;  // score 80–100
}

const DIMENSION_DESCRIPTIONS: Record<string, DimensionDescription> = {
  'Extractability': {
    low: "AI crawlers cannot reliably extract content. Check for JS-rendered text, low text-to-HTML ratio, or content hidden behind interactions.",
    mid: "Most content is reachable but some sections may be missed. Review dynamic or conditionally rendered blocks.",
    high: "Content is cleanly structured and fully extractable by AI crawlers."
  },
  'AI Crawlability & Agent Access': {
    low: "AI crawlers cannot reliably extract content. Check for JS-rendered text, low text-to-HTML ratio, or content hidden behind interactions.",
    mid: "Most content is reachable but some sections may be missed. Review dynamic or conditionally rendered blocks.",
    high: "Content is cleanly structured and fully extractable by AI crawlers."
  },
  'Entity Clarity': {
    low: "The page does not clearly define what this product or company is. AI models may misclassify or omit it from results.",
    mid: "Entity identity is partially clear but inconsistent. Reinforce product name, category, and purpose in the first 200 words.",
    high: "Product and company identity are stated clearly and consistently — AI models can reliably identify and describe this entity."
  },
  'Topical Breadth & Context': {
    low: "The page does not clearly define what this product or company is. AI models may misclassify or omit it from results.",
    mid: "Entity identity is partially clear but inconsistent. Reinforce product name, category, and purpose in the first 200 words.",
    high: "Product and company identity are stated clearly and consistently — AI models can reliably identify and describe this entity."
  },
  'Citation Readiness': {
    low: "No third-party press links, review platform links, or .edu/.gov references detected. AI models have no external signals to validate credibility.",
    mid: "Some external validation exists but volume is low. Add more links to press coverage and review platforms like G2 or Capterra.",
    high: "Strong external citation signals present. AI models can reference this site as a credible, verified source."
  },
  'Citations & Authority Signals': {
    low: "No third-party press links, review platform links, or .edu/.gov references detected. AI models have no external signals to validate credibility.",
    mid: "Some external validation exists but volume is low. Add more links to press coverage and review platforms like G2 or Capterra.",
    high: "Strong external citation signals present. AI models can reference this site as a credible, verified source."
  },
  'Structural Organization': {
    low: "Page structure is flat or missing. No clear heading hierarchy means AI models cannot parse topic sections reliably.",
    mid: "Basic structure exists but heading depth and internal linking are thin. Add H2/H3 sections and cross-links between related pages.",
    high: "Well-organized with clear heading hierarchy and internal link structure — easy for AI models to navigate and index."
  },
  'Content Quality & Structure': {
    low: "Page structure is flat or missing. No clear heading hierarchy means AI models cannot parse topic sections reliably.",
    mid: "Basic structure exists but heading depth and internal linking are thin. Add H2/H3 sections and cross-links between related pages.",
    high: "Well-organized with clear heading hierarchy and internal link structure — easy for AI models to navigate and index."
  },
  'Retrieval Friendliness': {
    low: "Page is difficult for AI retrieval systems to process. Missing meta description, poor snippet candidates, or blocked crawl paths.",
    mid: "Retrieval signals are partial. Ensure meta description is 120–160 chars and og:description matches page intent.",
    high: "Page is optimized for AI retrieval — strong meta signals, clean snippets, and no crawl barriers."
  },
  'Metadata Signals': {
    low: "Page is difficult for AI retrieval systems to process. Missing meta description, poor snippet candidates, or blocked crawl paths.",
    mid: "Retrieval signals are partial. Ensure meta description is 120–160 chars and og:description matches page intent.",
    high: "Page is optimized for AI retrieval — strong meta signals, clean snippets, and no crawl barriers."
  },
  'Authority Signals': {
    low: "No structured proof of authority detected. Missing schema markup, no verifiable reviews, and no compliance/certification signals.",
    mid: "Some authority signals present but incomplete. Add Organization or SoftwareApplication JSON-LD schema and link to third-party reviews.",
    high: "Strong authority signals detected — schema markup, external reviews, and/or compliance credentials are present."
  },
  'Structured Data (Schema)': {
    low: "No structured proof of authority detected. Missing schema markup, no verifiable reviews, and no compliance/certification signals.",
    mid: "Some authority signals present but incomplete. Add Organization or SoftwareApplication JSON-LD schema and link to third-party reviews.",
    high: "Strong authority signals detected — schema markup, external reviews, and/or compliance credentials are present."
  }
};

export function getDescription(dimension: string, score: number): string {
  const entry = DIMENSION_DESCRIPTIONS[dimension];
  if (!entry) return '';

  if (score < 50) {
    return entry.low;
  } else if (score < 80) {
    return entry.mid;
  } else {
    return entry.high;
  }
}

import * as fs from 'fs';
import * as path from 'path';
import { AiVisibilityOptions } from './index.js';

export function report(
  url: string,
  score: number,
  grade: string,
  results: CheckResult[],
  jsonFlag: boolean,
  options?: AiVisibilityOptions
): void {
  const jsonOutput = {
    url,
    score,
    grade,
    checkedAt: new Date().toISOString(),
    breakdown: results.map(r => ({
      ...r,
      description: getDescription(r.dimension, r.score),
    })),
  };

  // Handle output file
  const outputPath = options?.output;
  
  if (jsonFlag || options?.format === 'json') {
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2), 'utf8');
      console.log(chalk.green(`✓ JSON report saved to ${path.resolve(outputPath)}`));
    } else {
      console.log(JSON.stringify(jsonOutput, null, 2));
    }
    return;
  }

  if (options?.format === 'html') {
    // Simple HTML report
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Visibility Report - ${url}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
        h1 { color: #2563eb; }
        .score-box { padding: 1.5rem; border-radius: 8px; margin: 1rem 0; text-align: center; }
        .score-high { background-color: #d1fae5; }
        .score-mid { background-color: #fef3c7; }
        .score-low { background-color: #fee2e2; }
        table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background-color: #f3f4f6; }
        .issue { color: #dc2626; }
        .win { color: #16a34a; }
    </style>
</head>
<body>
    <h1>AI Visibility Report</h1>
    <p><strong>Target URL:</strong> <a href="${url}">${url}</a></p>
    <div class="score-box ${score >= 75 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low'}">
        <h2>Final Score: ${score}/100 (Grade: ${grade})</h2>
    </div>

    <h2>Breakdown</h2>
    <table>
        <thead>
            <tr>
                <th>Dimension</th>
                <th>Score</th>
                <th>Weight</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${results.map(r => `
            <tr>
                <td>${r.dimension}</td>
                <td>${r.score}/${r.maxScore}</td>
                <td>${r.weight}%</td>
                <td>${r.score === 100 ? 'EXCELLENT' : r.score >= 75 ? 'GOOD' : r.score >= 40 ? 'NEEDS WORK' : 'CRITICAL'}</td>
            </tr>
            <tr>
                <td colspan="4" style="padding-left: 1.5rem;">
                    ${getDescription(r.dimension, r.score)}
                    ${r.issues.length > 0 ? `<div class="issue"><strong>Issues:</strong><ul>${r.issues.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
                    ${r.wins.length > 0 ? `<div class="win"><strong>Wins:</strong><ul>${r.wins.map(w => `<li>${w}</li>`).join('')}</ul></div>` : ''}
                </td>
            </tr>`).join('')}
        </tbody>
    </table>

    <p><em>Generated at: ${new Date().toLocaleString()}</em></p>
</body>
</html>`;

    if (outputPath) {
      fs.writeFileSync(outputPath, htmlContent, 'utf8');
      console.log(chalk.green(`✓ HTML report saved to ${path.resolve(outputPath)}`));
    } else {
      console.log(chalk.yellow('Warning: No output path specified for HTML format. Printing HTML to stdout.'));
      console.log(htmlContent);
    }
    return;
  }

  // CLI Premium Terminal Output
  console.log();
  console.log(chalk.bold(chalk.cyan('==================================================')));
  console.log(chalk.bold(chalk.cyan('        AI VISIBILITY ANALYZER REPORT             ')));
  console.log(chalk.bold(chalk.cyan('==================================================')));
  console.log(`${chalk.bold('Target URL:')} ${chalk.underline(url)}`);
  
  let scoreColor = chalk.red;
  if (score >= 90) scoreColor = chalk.green;
  else if (score >= 75) scoreColor = chalk.green;
  else if (score >= 40) scoreColor = chalk.yellow;

  console.log(`${chalk.bold('Final Score:')} ${scoreColor(`${score}/100`)} (${chalk.bold('Grade:')} ${scoreColor(grade)})`);
  console.log();

  // Draw Breakdown Table
  const colWidths = {
    dimension: 32,
    score: 9,
    weight: 8,
    status: 12
  };

  const hr = '+' + '-'.repeat(colWidths.dimension + 2) + 
             '+' + '-'.repeat(colWidths.score + 2) + 
             '+' + '-'.repeat(colWidths.weight + 2) + 
             '+' + '-'.repeat(colWidths.status + 2) + '+';

  console.log(hr);
  console.log(
    `| ${chalk.bold('Dimension'.padEnd(colWidths.dimension))} | ` +
    `${chalk.bold('Score'.padStart(colWidths.score))} | ` +
    `${chalk.bold('Weight'.padStart(colWidths.weight))} | ` +
    `${chalk.bold('Status'.padEnd(colWidths.status))} |`
  );
  console.log(hr);

  for (const r of results) {
    let statusText = 'CRITICAL';
    let coloredStatus = chalk.red('CRITICAL');
    if (r.score === 100) {
      statusText = 'EXCELLENT';
      coloredStatus = chalk.green('EXCELLENT');
    } else if (r.score >= 75) {
      statusText = 'GOOD';
      coloredStatus = chalk.green('GOOD');
    } else if (r.score >= 40) {
      statusText = 'NEEDS WORK';
      coloredStatus = chalk.yellow('NEEDS WORK');
    }

    const statusPadding = ' '.repeat(Math.max(0, colWidths.status - statusText.length));

    console.log(
      `| ${r.dimension.padEnd(colWidths.dimension)} | ` +
      `${`${r.score}/${r.maxScore}`.padStart(colWidths.score)} | ` +
      `${`${r.weight}%`.padStart(colWidths.weight)} | ` +
      `${coloredStatus}${statusPadding} |`
    );

    const desc = getDescription(r.dimension, r.score);
    if (desc) {
      let coloredDesc = desc;
      if (r.score >= 80) {
        coloredDesc = chalk.dim.green(desc);
      } else if (r.score >= 50) {
        coloredDesc = chalk.dim.yellow(desc);
      } else {
        coloredDesc = chalk.dim.red(desc);
      }
      console.log(`    ${chalk.dim('→')} ${coloredDesc}`);
      console.log();
    }
  }
  console.log(hr);
  console.log();

  // Print Issues
  const hasIssues = results.some(r => r.issues.length > 0);
  if (hasIssues) {
    console.log(chalk.bold(chalk.red('✗ DETECTED ISSUES & GAPS')));
    console.log(chalk.gray('──────────────────────────────────────────────────'));
    for (const r of results) {
      if (r.issues.length > 0) {
        console.log(chalk.bold(chalk.yellow(r.dimension)));
        for (const issue of r.issues) {
          console.log(`  ${chalk.red('✗')} ${issue}`);
        }
      }
    }
    console.log();
  }

  // Print Wins
  const hasWins = results.some(r => r.wins.length > 0);
  if (hasWins) {
    console.log(chalk.bold(chalk.green('✓ OPTIMIZATION WINS')));
    console.log(chalk.gray('──────────────────────────────────────────────────'));
    for (const r of results) {
      if (r.wins.length > 0) {
        console.log(chalk.bold(chalk.green(r.dimension)));
        for (const win of r.wins) {
          console.log(`  ${chalk.green('✓')} ${win}`);
        }
      }
    }
    console.log();
  }

  // Print Top Fixes
  const lowScoringDimensions = results
    .filter(r => r.issues.length > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  if (lowScoringDimensions.length > 0) {
    console.log(chalk.bold(chalk.cyan('▲ RECOMMENDED TOP FIXES')));
    console.log(chalk.gray('──────────────────────────────────────────────────'));
    lowScoringDimensions.forEach((r, idx) => {
      console.log(`${idx + 1}. ${chalk.bold(r.dimension)} (Score: ${r.score}/100)`);
      console.log(`   ${chalk.cyan('→')} ${r.issues[0]}`);
    });
    console.log();
  }
}
