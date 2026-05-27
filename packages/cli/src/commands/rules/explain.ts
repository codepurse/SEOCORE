import { Command } from 'commander';
import pc from 'picocolors';
import { Rule, Severity } from '@seocore/sdk';
import { resolveConfig } from '@seocore/config';
import { getRuleSettings } from '@seocore/rule-utils';

async function loadRegisteredRules(): Promise<Rule[]> {
  const [
    { getCoreRules },
    { getPerformanceRules },
    { getMobileRules },
    { getAiVisibilityRules },
    { getSecurityRules },
    { getHreflangRules },
  ] = await Promise.all([
    import('@seocore/rules-core'),
    import('@seocore/rules-performance'),
    import('@seocore/rules-mobile'),
    import('@seocore/rules-ai-visibility'),
    import('@seocore/rules-security'),
    import('@seocore/rules-hreflang'),
  ]);

  const rules = [
    ...getCoreRules(),
    ...getPerformanceRules(),
    ...getMobileRules(),
    ...getAiVisibilityRules(),
    ...getSecurityRules(),
    ...getHreflangRules(),
  ];

  try {
    const { createBacklinkPlugin } = await import('@seocore/plugin-backlinks');
    const backlinkPlugin = createBacklinkPlugin();
    if (backlinkPlugin.rules) {
      rules.push(...backlinkPlugin.rules);
    }
  } catch {
    // Backlink plugin is optional for rule listing.
  }

  return rules;
}

export function command(): Command {
  return new Command('explain')
    .description('Explain a specific rule in detail')
    .argument('<id>', 'Rule ID to explain')
    .option('--json', 'Output as raw JSON', false)
    .action(handler);
}

export async function handler(id: string, options: any): Promise<void> {
  const config = resolveConfig();
  const rules = await loadRegisteredRules();
  const rule = rules.find(r => r.definition.id === id);

  if (!rule) {
    console.error(pc.red(`\nError: Rule with ID "${id}" not found.`));
    console.log(pc.yellow(`Available rules: ${rules.map(r => r.definition.id).join(', ')}`));
    process.exit(1);
  }

  const settings = getRuleSettings(rule.definition, config);
  const d = rule.definition;

  if (options.json) {
    console.log(JSON.stringify({
      definition: rule.definition,
      effectiveSettings: settings
    }, null, 2));
  } else {
    const sevColors: Record<Severity, any> = {
      critical: pc.red,
      error: pc.red,
      warning: pc.yellow,
      info: pc.blue,
    };

    console.log(pc.bold(pc.cyan('\n═══════════════════════════════════════════════════════════════')));
    console.log(pc.bold(pc.cyan(`                    RULE: ${d.id}`)));
    console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
    console.log();

    console.log(`${pc.bold('Name:')} ${pc.white(d.name)}`);
    console.log();

    console.log(`${pc.bold('Description:')}`);
    console.log(`  ${pc.gray(d.description)}`);
    console.log();

    console.log(`${pc.bold('Category:')} ${pc.cyan(d.category)}`);
    console.log();

    console.log(`${pc.bold('Module:')} ${d.module ? pc.cyan(d.module) : pc.gray('core')}`);
    console.log();

    console.log(`${pc.bold('Default Severity:')} ${sevColors[d.defaultSeverity](d.defaultSeverity)}`);
    console.log(`${pc.bold('Default Weight:')} ${pc.yellow(String(d.defaultWeight))}/10`);
    console.log();

    if (d.tier && d.tier.length > 0) {
      console.log(`${pc.bold('Supported Tiers:')} ${d.tier.map(t => pc.cyan(t)).join(', ')}`);
    } else {
      console.log(`${pc.bold('Supported Tiers:')} ${pc.gray('all tiers')}`);
    }
    console.log();

    if (d.requires && d.requires.length > 0) {
      console.log(`${pc.bold('Requires:')} ${d.requires.map(r => pc.yellow(r)).join(', ')}`);
      console.log();
    }

    if (d.documentationLink) {
      console.log(`${pc.bold('Documentation:')} ${pc.underline(pc.cyan(d.documentationLink))}`);
    } else {
      console.log(`${pc.bold('Documentation:')} ${pc.gray('None')}`);
    }
    console.log();

    console.log(pc.bold(pc.cyan('───────────────────────────────────────────────────────────────')));
    console.log(pc.bold('Effective Settings (from config):'));
    console.log(pc.cyan('───────────────────────────────────────────────────────────────'));
    console.log(`  Enabled:   ${settings.enabled ? pc.green('Yes') : pc.red('No')}`);
    console.log(`  Severity:  ${settings.severity ? sevColors[settings.severity](settings.severity) : pc.gray('Default')} ${settings.severity ? '' : `(default: ${d.defaultSeverity})`}`);
    console.log(`  Weight:    ${settings.weight !== undefined ? pc.yellow(String(settings.weight)) : pc.gray('Default')} ${settings.weight !== undefined ? '' : `(default: ${d.defaultWeight})`}`);
    console.log();

    console.log(pc.bold(pc.cyan('═══════════════════════════════════════════════════════════════')));
    console.log();
  }
}
