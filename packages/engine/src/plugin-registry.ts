import type { SeoPlugin, Rule, Finding, SeoConfig, AuditResult, NormalizedPage, CrawlResult } from '@seocore/sdk';
import type { ExecutionTierConfig, ModuleActivation } from '@seocore/sdk';

export interface PluginRegistry {
  register(plugin: SeoPlugin): void;
  unregister(name: string): void;
  getRules(): Rule[];
  getRulesForCategory(category: string): Rule[];
  getRulesForModules(modules: ModuleActivation): Rule[];
  runHook(hook: keyof NonNullable<SeoPlugin['lifecycle']>, context: any): Promise<void>;
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
    if (modules.backlinks) activeCategories.add('backlink_intelligence');

    return this.getRules().filter(rule => activeCategories.has(rule.definition.category));
  }

  async runHook(hook: keyof NonNullable<SeoPlugin['lifecycle']>, context: any): Promise<void> {
    for (const plugin of this.plugins.values()) {
      const lifecycle = plugin.lifecycle;
      if (!lifecycle) continue;
      const handler = lifecycle[hook] as Function;
      if (handler) {
        try {
          await handler(context);
        } catch (err) {
          console.error(`[PluginRegistry] Error in plugin "${plugin.name}" hook "${hook}":`, err);
        }
      }
    }
  }
}

export const PLUGIN_MANIFEST: Record<string, () => Promise<SeoPlugin>> = {
  // 'backlinks': async () => {
  //   const { createBacklinkPlugin } = await import('@seocore/plugin-backlinks');
  //   return createBacklinkPlugin();
  // },
  // 'lighthouse': async () => {
  //   const { createLighthousePlugin } = await import('@seocore/plugin-lighthouse');
  //   return createLighthousePlugin();
  // },
  // 'playwright': async () => {
  //   const { createPlaywrightPlugin } = await import('@seocore/plugin-playwright');
  //   return createPlaywrightPlugin();
  // },
  // 'screenshots': async () => {
  //   const { createScreenshotPlugin } = await import('@seocore/plugin-screenshots');
  //   return createScreenshotPlugin();
  // },
  // 'rank-check': async () => {
  //   const { createRankCheckPlugin } = await import('@seocore/plugin-rank-check');
  //   return createRankCheckPlugin();
  // },
};

export async function loadPluginsForTier(tierConfig: ExecutionTierConfig): Promise<SeoPlugin[]> {
  const plugins: SeoPlugin[] = [];
  const modules = tierConfig.modules;

  // if (modules.backlinks && PLUGIN_MANIFEST['backlinks']) {
  //   plugins.push(await PLUGIN_MANIFEST['backlinks']());
  // }
  // if (tierConfig.crawl.lighthouseEnabled && PLUGIN_MANIFEST['lighthouse']) {
  //   plugins.push(await PLUGIN_MANIFEST['lighthouse']());
  // }
  // if (tierConfig.crawl.playwrightEnabled && PLUGIN_MANIFEST['playwright']) {
  //   plugins.push(await PLUGIN_MANIFEST['playwright']());
  // }

  return plugins;
}
