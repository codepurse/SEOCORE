import { SeoPlugin } from '@seocore/sdk';
import { createBacklinkClient } from '@seocore/backlinks';
import { MissingBacklinkDataRule } from './rules/missing-data.js';
import { AnchorTextOverOptimizationRule } from './rules/anchor-text.js';
import { LowAuthorityBacklinksRule } from './rules/low-authority.js';
import { MissingHighAuthorityBacklinksRule } from './rules/missing-high-authority.js';

export function createBacklinkPlugin(): SeoPlugin {
  return {
    name: 'backlinks',
    version: '1.0.0',
    rules: [
      new MissingBacklinkDataRule(),
      new AnchorTextOverOptimizationRule(),
      new LowAuthorityBacklinksRule(),
      new MissingHighAuthorityBacklinksRule(),
    ],
    lifecycle: {
      onBeforeAnalysis: async (pages, ctx) => {
        if (!ctx.config.backlinks) {
          ctx.dataSources.set('backlinks', { status: 'not-configured' });
          return;
        }
        try {
          const client = createBacklinkClient(ctx.config.backlinks);
          const data = await client.getIntelligence(ctx.startUrl, 250);
          ctx.dataSources.set('backlinks', { status: 'ok', data });
        } catch (err: any) {
          ctx.dataSources.set('backlinks', { status: 'error', error: err.message });
        }
      }
    }
  };
}

export { MissingBacklinkDataRule } from './rules/missing-data.js';
export { AnchorTextOverOptimizationRule } from './rules/anchor-text.js';
export { LowAuthorityBacklinksRule } from './rules/low-authority.js';
export { MissingHighAuthorityBacklinksRule } from './rules/missing-high-authority.js';
