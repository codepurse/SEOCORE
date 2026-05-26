import type { SeoPlugin, Rule, Finding, SeoConfig, AuditResult, NormalizedPage, CrawlResult, DataSource } from '@seocore/sdk';
import type { ExecutionTierConfig, ModuleActivation } from '@seocore/sdk';

export interface PluginRegistry {
  register(plugin: SeoPlugin): void;
  unregister(name: string): void;
  getRules(): Rule[];
  getRulesForCategory(category: string): Rule[];
  getRulesForModules(modules: ModuleActivation): Rule[];
  runHook(hook: keyof NonNullable<SeoPlugin['lifecycle']>, ...args: any[]): Promise<void>;
  runUrlRewriteHook(hook: 'onBeforeCrawl', url: string): Promise<string>;
  runMutationHook(hook: 'onAfterAnalysis', findings: Finding[]): Promise<Finding[]>;
}

export class DefaultPluginRegistry implements PluginRegistry {
  private plugins = new Map<string, SeoPlugin>();

  register(plugin: SeoPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): void {
    this.plugins.delete(name);
  }

  getRules(): Rule[] {
    const rules: Rule[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.rules) {
        rules.push(...plugin.rules);
      }
    }
    return rules;
  }

  getRulesForCategory(category: string): Rule[] {
    return this.getRules().filter(rule => rule.definition.category === category);
  }

  getRulesForModules(modules: ModuleActivation): Rule[] {
    const activeCategories = new Set<string>();
    if (modules.core) {
      activeCategories.add('seo');
      activeCategories.add('metadata');
      activeCategories.add('indexing');
      activeCategories.add('links');
      activeCategories.add('accessibility');
    }
    if (modules.performance) activeCategories.add('performance');
    if (modules.mobile) activeCategories.add('mobile_seo');
    if (modules.aiVisibility) activeCategories.add('ai_visibility');
    if (modules.security) activeCategories.add('security');
    if (modules.backlinks) activeCategories.add('backlink_intelligence');

    return this.getRules().filter(rule => activeCategories.has(rule.definition.category));
  }

  async runHook(hook: keyof NonNullable<SeoPlugin['lifecycle']>, ...args: any[]): Promise<void> {
    for (const plugin of this.plugins.values()) {
      const lifecycle = plugin.lifecycle;
      if (!lifecycle) continue;
      const handler = lifecycle[hook] as Function;
      if (handler) {
        try {
          await handler(...args);
        } catch (err) {
          console.error(`[PluginRegistry] Error in plugin "${plugin.name}" hook "${hook}":`, err);
        }
      }
    }
  }

  async runUrlRewriteHook(hook: 'onBeforeCrawl', url: string): Promise<string> {
    let currentUrl = url;
    for (const plugin of this.plugins.values()) {
      const lifecycle = plugin.lifecycle;
      if (!lifecycle) continue;
      const handler = lifecycle[hook];
      if (handler) {
        try {
          const result = await handler(currentUrl);
          if (result) {
            currentUrl = result;
          }
        } catch (err) {
          console.error(`[PluginRegistry] Error in plugin "${plugin.name}" hook "${hook}":`, err);
        }
      }
    }
    return currentUrl;
  }

  async runMutationHook(hook: 'onAfterAnalysis', findings: Finding[]): Promise<Finding[]> {
    let currentFindings = [...findings];
    for (const plugin of this.plugins.values()) {
      const lifecycle = plugin.lifecycle;
      if (!lifecycle) continue;
      const handler = lifecycle[hook];
      if (handler) {
        try {
          const result = await handler(currentFindings);
          if (result) {
            currentFindings = result;
          }
        } catch (err) {
          console.error(`[PluginRegistry] Error in plugin "${plugin.name}" hook "${hook}":`, err);
        }
      }
    }
    return currentFindings;
  }
}

export const PLUGIN_MANIFEST: Record<string, () => Promise<SeoPlugin>> = {
  'backlinks': async () => {
    const { createBacklinkPlugin } = await import('@seocore/plugin-backlinks');
    return createBacklinkPlugin();
  },
  // playwright/lighthouse stay commented — Phase 5
};

export async function loadPluginsForTier(tierConfig: ExecutionTierConfig): Promise<SeoPlugin[]> {
  const plugins: SeoPlugin[] = [];
  const modules = tierConfig.modules;

  if (modules.backlinks && PLUGIN_MANIFEST['backlinks']) {
    plugins.push(await PLUGIN_MANIFEST['backlinks']());
  }

  return plugins;
}
