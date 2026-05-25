import { Crawler, SeoConfig } from '@seocore/sdk';
import { HttpCrawler, PlaywrightCrawler, LighthouseCrawler } from './index.js';

export type CrawlerFactory = () => Crawler;

export class CrawlerRegistry {
  private factories = new Map<string, CrawlerFactory>();

  register(name: string, factory: CrawlerFactory): void {
    this.factories.set(name, factory);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  create(name: string): Crawler {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Crawler not registered: ${name}`);
    }
    return factory();
  }

  /**
   * Priority-ordered selection.
   * lighthouse > playwright > http (downgrades if capability missing)
   */
  async selectForConfig(config: SeoConfig): Promise<{ name: string; crawler: Crawler }> {
    if (config.lighthouseEnabled && this.has('lighthouse')) {
      const available = await LighthouseCrawler.isAvailable();
      if (available) {
        return { name: 'lighthouse', crawler: this.create('lighthouse') };
      } else {
        console.warn('[Crawler] Lighthouse is enabled in config but dependencies are not available. Downgrading to next priority.');
      }
    }

    if (config.playwrightEnabled && this.has('playwright')) {
      const available = await PlaywrightCrawler.isAvailable();
      if (available) {
        return { name: 'playwright', crawler: this.create('playwright') };
      } else {
        console.warn('[Crawler] Playwright is enabled in config but dependencies are not available. Downgrading to next priority.');
      }
    }

    if (this.has('http')) {
      return { name: 'http', crawler: this.create('http') };
    }

    throw new Error('No valid crawler found in registry.');
  }
}

export function createDefaultRegistry(): CrawlerRegistry {
  const reg = new CrawlerRegistry();
  reg.register('http', () => new HttpCrawler());
  reg.register('playwright', () => new PlaywrightCrawler());
  reg.register('lighthouse', () => new LighthouseCrawler());
  return reg;
}
