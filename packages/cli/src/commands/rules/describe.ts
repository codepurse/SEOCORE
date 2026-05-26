import { Command } from 'commander';
import pc from 'picocolors';
import { Rule } from '@seocore/sdk';
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
  return new Command('describe')
    .description('Show detailed info for a specific rule')
    .argument('<id>', 'Rule ID to describe')
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

  if (options.json) {
    console.log(JSON.stringify({
      definition: rule.definition,
      effectiveSettings: settings
    }, null, 2));
  } else {
    const d = rule.definition;
    console.log(pc.bold(pc.cyan('\n==================================================')));
    console.log(pc.bold(pc.cyan(`           RULE: ${pc.white(d.id)}                        `)));
    console.log(pc.bold(pc.cyan('==================================================\n')));
    console.log(`${pc.bold('Name:')} ${d.name}`);
    console.log(`${pc.bold('Description:')} ${d.description}`);
    console.log(`${pc.bold('Category:')} ${pc.cyan(d.category)}`);
    console.log(`${pc.bold('Default Severity:')} ${d.defaultSeverity}`);
    console.log(`${pc.bold('Default Weight:')} ${d.defaultWeight}`);
    console.log(`${pc.bold('Documentation:')} ${d.documentationLink ? pc.underline(d.documentationLink) : 'None'}`);
    console.log();
    console.log(pc.bold('Effective Settings:'));
    console.log(`  Enabled: ${settings.enabled ? pc.green('Yes') : pc.red('No')}`);
    console.log(`  Severity: ${settings.severity || 'Default'}`);
    console.log(`  Weight: ${settings.weight !== undefined ? settings.weight : 'Default'}`);
    console.log();
  }
}
