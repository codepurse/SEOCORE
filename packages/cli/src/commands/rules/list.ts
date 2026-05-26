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
  return new Command('list')
    .description('List all available declarative SEO validation rules')
    .action(handler);
}

export async function handler(): Promise<void> {
  const config = resolveConfig();
  const rules = (await loadRegisteredRules()).filter((rule) => getRuleSettings(rule.definition, config).enabled);

  console.log(pc.bold(pc.cyan(`\nSEOCORE REGISTERED RULES (${rules.length} total):`)));
  console.log(pc.gray('─────────────────────────────────────────────────────────────────────────────────'));

  const sevColors: Record<Severity, any> = {
    critical: pc.red,
    error: pc.red,
    warning: pc.yellow,
    info: pc.blue,
  };

  for (const rule of rules) {
    const d = rule.definition;
    const sevColor = sevColors[d.defaultSeverity];
    console.log(
      `${pc.bold(pc.white(d.id.padEnd(25)))} | ` +
      `${pc.cyan(d.category.toUpperCase().padEnd(14))} | ` +
      `Sev: ${sevColor(d.defaultSeverity.padEnd(8))} | ` +
      `Weight: ${pc.yellow(String(d.defaultWeight).padStart(2))}`
    );
    console.log(`  ${pc.gray(d.description)}`);
    if (d.documentationLink) {
      console.log(`  Docs: ${pc.underline(pc.gray(d.documentationLink))}`);
    }
    console.log(pc.gray('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─'));
  }
  console.log();
}
