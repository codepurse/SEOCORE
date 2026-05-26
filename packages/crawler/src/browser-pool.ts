import { createServer } from 'node:net';

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate browser debug port')));
        return;
      }

      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

interface BrowserInstance {
  browser: any;
  port: number | null;
  playwrightModule: any;
  refCount: number;
}

export class BrowserPool {
  private static instance: BrowserPool | null = null;
  private browserInstances: Map<string, BrowserInstance> = new Map();

  public static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  private constructor() {}

  public async acquireBrowser(options: { needDebugPort?: boolean } = {}): Promise<{
    browser: any;
    port: number | null;
    playwrightModule: any;
  }> {
    const key = options.needDebugPort ? 'debug' : 'default';
    let instance = this.browserInstances.get(key);

    if (!instance) {
      const playwrightModule = await import('playwright');
      let port: number | null = null;
      const launchOptions: any = {
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      };

      if (options.needDebugPort) {
        port = await getAvailablePort();
        launchOptions.args.push(`--remote-debugging-port=${port}`);
      }

      const browser = await playwrightModule.chromium.launch(launchOptions);

      instance = {
        browser,
        port,
        playwrightModule,
        refCount: 0,
      };
      this.browserInstances.set(key, instance);
    }

    instance.refCount++;
    return {
      browser: instance.browser,
      port: instance.port,
      playwrightModule: instance.playwrightModule,
    };
  }

  public async releaseBrowser(options: { needDebugPort?: boolean } = {}): Promise<void> {
    const key = options.needDebugPort ? 'debug' : 'default';
    const instance = this.browserInstances.get(key);

    if (!instance) {
      return;
    }

    instance.refCount--;
    if (instance.refCount <= 0) {
      await instance.browser.close();
      this.browserInstances.delete(key);
    }
  }

  public async closeAll(): Promise<void> {
    for (const instance of this.browserInstances.values()) {
      await instance.browser.close();
    }
    this.browserInstances.clear();
  }
}
