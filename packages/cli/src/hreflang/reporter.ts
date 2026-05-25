import pc from 'picocolors';
import { HreflangValidationResult } from '@seocore/analyzers';
import * as fs from 'fs';
import * as path from 'path';

export class HreflangReporter {
  static report(result: HreflangValidationResult, targetUrl: string): void {
    console.log(pc.bold(pc.cyan('='.repeat(80))));
    console.log(pc.bold(pc.cyan('                       HREFLANG VALIDATION REPORT')));
    console.log(pc.bold(pc.cyan('='.repeat(80))));
    console.log(`${pc.bold('Target URL:')} ${targetUrl}`);
    console.log(`${pc.bold('Checked at:')} ${new Date().toISOString()}`);
    console.log();

    // Network overview
    console.log(pc.bold('🌍 HREFLANG NETWORK OVERVIEW:'));
    for (const [url, page] of Object.entries(result.network)) {
      console.log(`  ${pc.green('•')} ${url}`);
      for (const alt of page.hreflang) {
        console.log(`    ${pc.gray('-')} ${pc.yellow(alt.lang)} → ${alt.url}`);
      }
    }
    console.log();

    // Warnings
    if (result.warnings.length > 0) {
      console.log(pc.bold(pc.yellow('⚠️  WARNINGS:')));
      for (const warning of result.warnings) {
        console.log(`  ${pc.yellow('•')} ${warning.message}`);
      }
      console.log();
    }

    // Errors
    if (result.issues.length > 0) {
      console.log(pc.bold(pc.red('❌ ERRORS:')));
      for (const issue of result.issues) {
        console.log(`  ${pc.red('•')} ${issue.message}`);
      }
      console.log();
    }

    // Summary
    const errorCount = result.issues.length;
    const warningCount = result.warnings.length;
    if (errorCount === 0 && warningCount === 0) {
      console.log(pc.bold(pc.green('✅ All checks passed!')));
    } else {
      console.log(pc.bold(`${errorCount > 0 ? pc.red(`❌ ${errorCount} error(s)`) : ''} ${warningCount > 0 ? pc.yellow(`⚠️ ${warningCount} warning(s)`) : ''}`));
    }
    console.log();
  }

  static exportJson(result: HreflangValidationResult, outputPath?: string): string {
    const json = JSON.stringify(result, null, 2);
    if (outputPath) {
      const absolutePath = path.resolve(outputPath);
      fs.writeFileSync(absolutePath, json, 'utf8');
      return absolutePath;
    }
    return json;
  }
}
