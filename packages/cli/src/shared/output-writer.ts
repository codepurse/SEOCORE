import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { JsonReporter, HtmlReporter, SarifReporter } from '@seocore/reporter';

export interface OutputDispatch {
  result: any;
  terminalRender: () => void;
  jsonDefaultName: string;
  htmlExporter?: (result: any, path: string) => string;
  sarifExporter?: (result: any, path: string) => string;
}

export function dispatchOutput(opts: any, dispatch: OutputDispatch): void {
  const format = opts.json ? 'json' : (opts.format || 'terminal');

  if (format === 'terminal' || format === 'both' || format === 'all') {
    dispatch.terminalRender();
  }

  if (format === 'json' || format === 'both' || format === 'all') {
    const outPath = opts.output && opts.output.endsWith('.json') ? opts.output : `./${dispatch.jsonDefaultName}.json`;
    const absolutePath = JsonReporter.export(dispatch.result, outPath);
    console.log(pc.green(`✔  JSON Report exported to ${pc.bold(absolutePath)}`));
  }

  if (format === 'html' || format === 'all') {
    const outPath = opts.output && opts.output.endsWith('.html') ? opts.output : `./${dispatch.jsonDefaultName}.html`;
    const absolutePath = dispatch.htmlExporter ? dispatch.htmlExporter(dispatch.result, outPath) : HtmlReporter.export(dispatch.result, outPath);
    console.log(pc.green(`✔  HTML Report exported to ${pc.bold(absolutePath)}`));
  }

  if (format === 'sarif') {
    const outPath = opts.output && opts.output.endsWith('.sarif') ? opts.output : `./${dispatch.jsonDefaultName}.sarif`;
    const absolutePath = dispatch.sarifExporter ? dispatch.sarifExporter(dispatch.result, outPath) : SarifReporter.export(dispatch.result, outPath);
    console.log(pc.green(`✔  SARIF Report exported to ${pc.bold(absolutePath)}`));
  }
}
