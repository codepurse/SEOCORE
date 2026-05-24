import pc from 'picocolors';
import { SchemaValidationResult, ValidatedSchema } from '@seocore/analyzers';
import * as fs from 'fs';
import * as path from 'path';

export class SchemaReporter {
  static reportTerminal(result: SchemaValidationResult): void {
    console.log();
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(pc.bold(pc.cyan('      SCHEMA.ORG VALIDATION & GRAPH AUDIT         ')));
    console.log(pc.bold(pc.cyan('==================================================')));
    console.log(`${pc.bold('Target URL:')} ${pc.underline(result.targetUrl)}`);
    console.log(`${pc.bold('Checked At:')} ${new Date(result.validatedAt).toLocaleString()}`);
    console.log();

    // Calculate and render SCI (Semantic Quality Score)
    const sci = this.calculateSCI(result);
    const sciColor = sci >= 90 ? pc.green : sci >= 70 ? pc.yellow : pc.red;
    
    console.log(pc.bold('Summary:'));
    console.log(`  Semantic Quality Score (SCI): ${sciColor(pc.bold(`${sci}/100`))}`);
    console.log(`  Total schemas found: ${result.totalSchemas}`);
    console.log(`  ${result.validSchemas > 0 ? pc.green('✓') : pc.gray('-')} Valid: ${result.validSchemas}`);
    console.log(`  ${result.invalidSchemas > 0 ? pc.red('✗') : pc.gray('-')} Invalid: ${result.invalidSchemas}`);
    console.log(`  ${result.totalErrors > 0 ? pc.red('!') : pc.gray('-')} Errors: ${result.totalErrors}`);
    console.log(`  ${result.totalWarnings > 0 ? pc.yellow('⚠') : pc.gray('-')} Warnings: ${result.totalWarnings}`);
    console.log();

    if (result.schemas.length === 0) {
      console.log(pc.yellow('⚠ No structured data (JSON-LD, Microdata, or RDFa) found on the page.'));
      console.log();
      return;
    }

    // Detailed breakdown
    console.log(pc.bold('Detailed Findings:'));
    for (let i = 0; i < result.schemas.length; i++) {
      const schema = result.schemas[i];
      this.reportSchema(schema, i + 1);
    }

    // Visual DAG representation in colored terminal block
    if (result.graph && result.graph.hierarchy && result.graph.hierarchy.length > 0) {
      console.log(pc.bold('Entity Graph DAG Structure:'));
      this.renderHierarchy(result.graph.hierarchy);
      console.log();
    }
  }

  private static calculateSCI(result: SchemaValidationResult): number {
    let score = 100;
    
    for (const schema of result.schemas) {
      if (schema.type === 'Invalid JSON-LD') {
        score -= 50;
        continue;
      }
      
      let bonus = 0;
      for (const issue of schema.issues) {
        if (issue.level === 'error') {
          score -= 15;
        } else if (issue.level === 'warning') {
          if (issue.message.startsWith('Integrity Alert')) {
            score -= 10;
          } else {
            score -= 5;
          }
        } else if (issue.level === 'info') {
          if (issue.message.startsWith('E-E-A-T Validation')) {
            bonus += 5;
          }
        }
      }
      score += Math.min(15, bonus);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private static reportSchema(schema: ValidatedSchema, index: number): void {
    const statusIcon = schema.valid ? pc.green('✓') : pc.red('✗');
    const statusText = schema.valid ? pc.green('Valid') : pc.red('Invalid');
    console.log(`  ${index}. ${statusIcon} ${pc.bold(pc.cyan(schema.type))} (${statusText})`);

    if (schema.issues.length > 0) {
      for (const issue of schema.issues) {
        const levelIcon = issue.level === 'error' ? pc.red('✗') : issue.level === 'warning' ? pc.yellow('⚠') : pc.blue('ℹ');
        const levelColor = issue.level === 'error' ? pc.red : issue.level === 'warning' ? pc.yellow : pc.blue;
        const prefix = issue.property ? `${issue.property}: ` : '';
        console.log(`      ${levelIcon} ${levelColor(issue.level.toUpperCase())}: ${prefix}${issue.message}`);

        // 4.2 Actionable Recommendations Engine: Exact copy-paste patch suggestions
        if (issue.property && (issue.level === 'error' || issue.level === 'warning')) {
          const patch = this.generatePatch(schema.type, issue.property);
          if (patch) {
            console.log(pc.gray(`      💡 Suggested Copy-Paste Patch:`));
            console.log(pc.gray(`        "${issue.property}": ${JSON.stringify(patch, null, 2).replace(/\n/g, '\n        ')}`));
          }
        }
      }
    } else {
      console.log(`      ${pc.green('No issues found!')}`);
    }
    console.log();
  }

  private static renderHierarchy(nodes: any[], prefix = '  '): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLast = i === nodes.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      
      const propStr = node.property ? pc.yellow(`(${node.property}) `) : '';
      const idStr = node.id ? pc.gray(` [${node.id}]`) : '';
      const typeStr = pc.cyan(pc.bold(node.type));
      const circularStr = node.isCircular ? pc.red(' (circular reference)') : '';
      
      console.log(`${prefix}${branch}${propStr}📦 ${typeStr}${idStr}${circularStr}`);
      
      if (node.children && node.children.length > 0) {
        this.renderHierarchy(node.children, nextPrefix);
      }
    }
  }

  private static generatePatch(type: string, property: string): any {
    const patches: Record<string, Record<string, any>> = {
      'Article': {
        'headline': 'INSERT_ARTICLE_HEADLINE',
        'author': { '@type': 'Person', 'name': 'INSERT_AUTHOR_NAME' },
        'datePublished': '2026-05-24T12:00:00Z',
        'image': 'https://example.com/image.jpg',
        'description': 'INSERT_ARTICLE_DESCRIPTION'
      },
      'Product': {
        'name': 'INSERT_PRODUCT_NAME',
        'image': 'https://example.com/product.jpg',
        'description': 'INSERT_PRODUCT_DESCRIPTION',
        'offers': {
          '@type': 'Offer',
          'price': '99.99',
          'priceCurrency': 'USD',
          'availability': 'https://schema.org/InStock'
        },
        'brand': { '@type': 'Brand', 'name': 'INSERT_BRAND_NAME' }
      },
      'LocalBusiness': {
        'name': 'INSERT_BUSINESS_NAME',
        'address': {
          '@type': 'PostalAddress',
          'streetAddress': '123 Main St',
          'addressLocality': 'City',
          'addressRegion': 'State',
          'postalCode': '12345',
          'addressCountry': 'US'
        },
        'telephone': 'INSERT_TELEPHONE',
        'url': 'https://example.com'
      },
      'Person': {
        'sameAs': [
          'https://www.wikipedia.org/wiki/Your_Page',
          'https://www.wikidata.org/wiki/Your_Item'
        ]
      },
      'Organization': {
        'sameAs': [
          'https://www.linkedin.com/company/your-company',
          'https://twitter.com/your-company'
        ]
      }
    };
    
    return patches[type]?.[property] || 'INSERT_VALUE';
  }

  static reportJson(result: SchemaValidationResult, outputPath?: string): void {
    const json = JSON.stringify(result, null, 2);
    if (outputPath) {
      const absolutePath = path.resolve(outputPath);
      fs.writeFileSync(absolutePath, json, 'utf8');
      console.log(pc.green(`✓ JSON report saved to ${pc.bold(absolutePath)}`));
    } else {
      console.log(json);
    }
  }

  /**
   * 4.4 Pro-Grade Schema validation output (SARIF format)
   */
  static reportSarif(result: SchemaValidationResult, outputPath: string): void {
    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'SeoCore Schema Auditor',
              version: '1.0.0',
              rules: [
                {
                  id: 'missing-required',
                  shortDescription: { text: 'Missing required Schema.org properties' },
                  helpUri: 'https://schema.org',
                },
                {
                  id: 'integrity-mismatch',
                  shortDescription: { text: 'HTML metadata and structured data value mismatch' },
                  helpUri: 'https://ogp.me',
                }
              ]
            }
          },
          results: result.schemas.flatMap((schema) =>
            schema.issues.map((issue) => ({
              ruleId: issue.level === 'error' ? 'missing-required' : 'integrity-mismatch',
              message: {
                text: `[${schema.type}] ${issue.property ? `${issue.property}: ` : ''}${issue.message}`,
              },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: result.targetUrl,
                    }
                  }
                }
              ],
              level: issue.level === 'error' ? 'error' : 'warning',
            }))
          )
        }
      ]
    };

    const absolutePath = path.resolve(outputPath);
    fs.writeFileSync(absolutePath, JSON.stringify(sarif, null, 2), 'utf8');
    console.log(pc.green(`✓ SARIF report saved to ${pc.bold(absolutePath)}`));
  }
}
