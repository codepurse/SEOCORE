import { Command } from 'commander';
import pc from 'picocolors';
import { SeoEngine } from '@seocore/engine';
import { EventBus } from '@seocore/sdk';
import { SchemaGraphAnalyzer } from '@seocore/analyzers';
import { validateUrl } from '../../shared/index.js';
import { buildHelp } from '../../shared/help.js';

export function command(): Command {
  return buildHelp(
    new Command('schema-graph')
      .description('Analyze structured data entity relationships and graph completeness')
      .argument('<url>', 'Target website starting URL')
      .option('-f, --format <format>', 'Output format: terminal, json, mermaid, html', 'terminal')
      .option('-o, --output <path>', 'Export file path')
      .option('--full', 'Crawl the entire site', false)
      .option('-d, --depth <number>', 'Crawl depth limit', parseInt)
      .option('-m, --max-pages <number>', 'Maximum pages to crawl', parseInt)
      .action(handler),
    [
      {
        title: 'Examples',
        lines: [
          'seocore analyze schema-graph https://example.com',
          'seocore analyze schema-graph https://example.com --format mermaid',
          'seocore analyze schema-graph https://example.com --format html --output ./schema-graph.html',
          'seocore analyze schema-graph https://example.com --full --max-pages 100',
        ],
      },
    ]
  );
}

async function handler(url: string, options: any): Promise<void> {
  try {
    validateUrl(url, 'Target URL');

    console.log(pc.cyan('\n🔍  Analyzing schema graph...\n'));

    const partialConfig: any = {
      maxPages: options.maxPages || (options.full ? 100 : 10),
      maxDepth: options.depth || (options.full ? 5 : 2),
      preset: 'standard',
    };

    const eventBus = new EventBus();
    const engine = new SeoEngine(eventBus);
    const result = await engine.run(url, partialConfig);

    const analyzer = new SchemaGraphAnalyzer();
    const analysis = analyzer.analyze(result.pages, url);

    if (options.format === 'json') {
      const outPath = options.output || './schema-graph-report.json';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2), 'utf8');
      console.log(pc.green(`✓  JSON report exported to ${pc.bold(outPath)}`));
      return;
    }

    if (options.format === 'mermaid') {
      const mermaidOutput = generateMermaid(analysis);
      if (options.output) {
        const fs = await import('node:fs');
        fs.writeFileSync(options.output, mermaidOutput, 'utf8');
        console.log(pc.green(`✓  Mermaid diagram exported to ${pc.bold(options.output)}`));
      } else {
        console.log(mermaidOutput);
      }
      return;
    }

    if (options.format === 'html') {
      const htmlOutput = generateHtml(analysis);
      const outPath = options.output || './schema-graph-report.html';
      const fs = await import('node:fs');
      fs.writeFileSync(outPath, htmlOutput, 'utf8');
      console.log(pc.green(`✓  HTML report exported to ${pc.bold(outPath)}`));
      return;
    }

    printTerminalReport(analysis);
  } catch (err: any) {
    console.error(pc.red(`\nSchema graph analysis failed: ${err.message}`));
    process.exit(1);
  }
}

function printTerminalReport(analysis: any): void {
  console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
  console.log(pc.bold(pc.cyan('                  SCHEMA GRAPH ANALYSIS')));
  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();

  console.log(pc.bold('ENTITY SUMMARY:'));
  console.log(`  Total entities:  ${pc.yellow(String(analysis.coverage.totalEntities))}`);
  console.log(`  Entity types:    ${analysis.nodes.length > 0 ? analysis.nodes.map((n: any) => n.type).filter((v: any, i: any, a: any) => a.indexOf(v) === i).join(', ') : pc.gray('None')}`);
  console.log();

  if (analysis.nodes.length > 0) {
    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('ENTITY DETAILS:'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));

    const typeGroups = new Map<string, any[]>();
    for (const node of analysis.nodes) {
      if (!typeGroups.has(node.type)) {
        typeGroups.set(node.type, []);
      }
      typeGroups.get(node.type)!.push(node);
    }

    for (const [type, nodes] of typeGroups) {
      console.log(`\n  ${pc.bold(pc.green('●'))} ${pc.cyan(type)} (${nodes.length})`);
      for (const node of nodes.slice(0, 3)) {
        const idStr = node.id ? ` @id: ${pc.gray(node.id.slice(0, 40))}` : '';
        console.log(`    ${pc.gray('└─')} ${idStr}`);
      }
      if (nodes.length > 3) {
        console.log(`    ${pc.gray(`└─ ... and ${nodes.length - 3} more`)}`);
      }
    }
    console.log();
  }

  if (analysis.edges.length > 0) {
    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('GRAPH RELATIONSHIPS:'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));

    const edgeByType = new Map<string, number>();
    for (const edge of analysis.edges) {
      const key = `${edge.from.type} → ${edge.property} → ${edge.to.type}`;
      edgeByType.set(key, (edgeByType.get(key) || 0) + 1);
    }

    for (const [rel, count] of Array.from(edgeByType.entries()).slice(0, 10)) {
      console.log(`  ${pc.green('→')} ${rel} ${pc.gray(`(${count})`)}`);
    }
    if (edgeByType.size > 10) {
      console.log(`  ${pc.gray(`... and ${edgeByType.size - 10} more relationship types`)}`);
    }
    console.log();
  }

  if (analysis.unresolvedReferences.length > 0) {
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`BROKEN OR MISSING REFERENCES (${analysis.unresolvedReferences.length}):`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));

    for (const ref of analysis.unresolvedReferences.slice(0, 5)) {
      console.log(`  ${pc.red('✗')} ${pc.cyan(ref.sourceType)}:${ref.property || 'prop'} → @id:${pc.yellow(ref.targetId)}`);
    }
    if (analysis.unresolvedReferences.length > 5) {
      console.log(`  ${pc.gray(`... and ${analysis.unresolvedReferences.length - 5} more unresolved references`)}`);
    }
    console.log();
  }

  if (analysis.isolatedNodes.length > 0) {
    console.log(pc.bold(pc.yellow('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.yellow(`ISOLATED NODES (${analysis.isolatedNodes.length}):`)));
    console.log(pc.yellow('───────────────────────────────────────────────────────────────'));

    for (const node of analysis.isolatedNodes.slice(0, 5)) {
      console.log(`  ${pc.yellow('○')} ${pc.cyan(node.type)} ${node.id ? pc.gray(`@id: ${node.id.slice(0, 40)}`) : ''}`);
    }
    if (analysis.isolatedNodes.length > 5) {
      console.log(`  ${pc.gray(`... and ${analysis.isolatedNodes.length - 5} more isolated nodes`)}`);
    }
    console.log();
  }

  if (analysis.conflicts.length > 0) {
    console.log(pc.bold(pc.red('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold(pc.red(`ENTITY CONFLICTS (${analysis.conflicts.length}):`)));
    console.log(pc.red('───────────────────────────────────────────────────────────────'));

    for (const conflict of analysis.conflicts.slice(0, 3)) {
      console.log(`  ${pc.red('⚠')} ${pc.cyan(conflict.type)} ${conflict.id ? pc.gray(`@id: ${conflict.id}`) : ''}`);
      for (const prop of conflict.conflictingProperties.slice(0, 3)) {
        console.log(`    ${pc.gray('└─')} ${prop.property}: ${pc.yellow(`${prop.values.length} conflicting values`)}`);
      }
    }
    if (analysis.conflicts.length > 3) {
      console.log(`  ${pc.gray(`... and ${analysis.conflicts.length - 3} more conflicts`)}`);
    }
    console.log();
  }

  console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
  console.log(pc.bold('SCHEMA COVERAGE:'));
  console.log(pc.cyan('───────────────────────────────────────────────────────────────'));

  console.log(`  Reference coverage:  ${analysis.coverage.coveragePercent}%`);
  console.log(`  Total references:    ${analysis.coverage.totalReferences}`);
  console.log(`  Resolved:            ${analysis.coverage.resolvedReferences}`);
  console.log(`  Unresolved:           ${pc.red(String(analysis.coverage.unresolvedReferences))}`);

  if (analysis.coverage.missingTypes.length > 0) {
    console.log(`\n  ${pc.bold('Recommended types to add:')}`);
    for (const missingType of analysis.coverage.missingTypes.slice(0, 5)) {
      console.log(`    ${pc.yellow('+')} ${missingType}`);
    }
  }
  console.log();

  console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
  console.log();
}

function generateMermaid(analysis: any): string {
  const lines: string[] = [
    '```mermaid',
    'graph TD',
    '    %% Schema Entity Graph',
    '',
  ];

  const nodeIds = new Map<string, string>();
  let nodeCounter = 1;

  for (const node of analysis.nodes) {
    const id = node.id || `entity_${nodeCounter++}`;
    const safeId = id.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    nodeIds.set(id, safeId);

    const unresolved = node.hasUnresolvedRefs ? ' ⚠️' : '';
    lines.push(`    ${safeId}["${node.type}${unresolved}"]`);
  }

  lines.push('');

  for (const edge of analysis.edges) {
    const fromId = edge.from.id || 'unknown';
    const toId = edge.to.id || 'unknown';
    const fromSafe = nodeIds.get(fromId) || 'unknown';
    const toSafe = nodeIds.get(toId) || 'unknown';

    lines.push(`    ${fromSafe} -->|"${edge.property}"| ${toSafe}`);
  }

  lines.push('');
  lines.push('```');

  return lines.join('\n');
}

function generateHtml(analysis: any): string {
  const nodesJson = JSON.stringify(analysis.nodes, null, 2);
  const edgesJson = JSON.stringify(analysis.edges, null, 2);
  const unresolvedJson = JSON.stringify(analysis.unresolvedReferences, null, 2);
  const conflictsJson = JSON.stringify(analysis.conflicts, null, 2);
  const coverageJson = JSON.stringify(analysis.coverage, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schema Graph Analysis - ${analysis.url}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0; }
    h1 { color: #38bdf8; border-bottom: 2px solid #38bdf8; padding-bottom: 10px; }
    h2 { color: #4ade80; margin-top: 30px; }
    .metric { display: inline-block; background: #1e293b; padding: 15px 25px; border-radius: 8px; margin: 10px 10px 10px 0; }
    .metric-value { font-size: 2em; font-weight: bold; color: #38bdf8; }
    .metric-label { color: #94a3b8; font-size: 0.9em; }
    .warning { background: #7f1d1d; border-left: 4px solid #ef4444; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .success { background: #14532d; border-left: 4px solid #22c55e; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .info { background: #1e3a5f; border-left: 4px solid #3b82f6; padding: 15px; margin: 10px 0; border-radius: 4px; }
    pre { background: #1e293b; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #38bdf8; }
    .json-data { display: none; }
  </style>
</head>
<body>
  <h1>🔍 Schema Graph Analysis</h1>
  <p><strong>URL:</strong> ${analysis.url}</p>
  <p><strong>Generated:</strong> ${analysis.generatedAt}</p>

  <h2>📊 Coverage Metrics</h2>
  <div class="metric">
    <div class="metric-value">${analysis.coverage.totalEntities}</div>
    <div class="metric-label">Total Entities</div>
  </div>
  <div class="metric">
    <div class="metric-value">${analysis.coverage.coveragePercent}%</div>
    <div class="metric-label">Reference Coverage</div>
  </div>
  <div class="metric">
    <div class="metric-value">${analysis.coverage.unresolvedReferences}</div>
    <div class="metric-label">Unresolved</div>
  </div>

  ${analysis.coverage.missingTypes.length > 0 ? `
  <div class="info">
    <strong>Recommended Types to Add:</strong>
    <ul>${analysis.coverage.missingTypes.map((t: string) => `<li>${t}</li>`).join('')}</ul>
  </div>
  ` : ''}

  ${analysis.unresolvedReferences.length > 0 ? `
  <h2>⚠️ Broken References (${analysis.unresolvedReferences.length})</h2>
  ${analysis.unresolvedReferences.map((r: any) => `
  <div class="warning">
    <strong>${r.sourceType}.${r.property}</strong> → @id:${r.targetId}
  </div>
  `).join('')}
  ` : '<div class="success">✓ No broken references</div>'}

  ${analysis.conflicts.length > 0 ? `
  <h2>🔴 Entity Conflicts (${analysis.conflicts.length})</h2>
  ${analysis.conflicts.map((c: any) => `
  <div class="warning">
    <strong>${c.type}</strong> ${c.id ? `(@id: ${c.id})` : ''}
    <ul>${c.conflictingProperties.map((p: any) => `<li><code>${p.property}</code>: ${p.values.length} conflicting values</li>`).join('')}</ul>
  </div>
  `).join('')}
  ` : ''}

  <h2>📋 Entity Details</h2>
  <table>
    <tr><th>Type</th><th>@id</th><th>Properties</th><th>Issues</th></tr>
    ${analysis.nodes.map((n: any) => `
    <tr>
      <td>${n.type}</td>
      <td>${n.id ? `<code>${n.id.slice(0, 40)}${n.id.length > 40 ? '...' : ''}</code>` : '-'}</td>
      <td>${Object.keys(n.properties).length}</td>
      <td>${n.hasUnresolvedRefs ? '⚠️ Unresolved refs' : '✓'}</td>
    </tr>
    `).join('')}
  </table>

  <h2>🔗 Relationships</h2>
  <table>
    <tr><th>From</th><th>Property</th><th>To</th><th>Status</th></tr>
    ${analysis.edges.slice(0, 50).map((e: any) => `
    <tr>
      <td>${e.from.type}</td>
      <td><code>${e.property}</code></td>
      <td>${e.to.type}</td>
      <td>${e.resolved ? '✓' : '⚠️'}</td>
    </tr>
    `).join('')}
  </table>

  <div class="json-data" id="nodesData">${nodesJson}</div>
  <div class="json-data" id="edgesData">${edgesJson}</div>
  <div class="json-data" id="unresolvedData">${unresolvedJson}</div>
  <div class="json-data" id="conflictsData">${conflictsJson}</div>
  <div class="json-data" id="coverageData">${coverageJson}</div>
</body>
</html>`;
}
