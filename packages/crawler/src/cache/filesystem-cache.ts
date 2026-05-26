import type { CrawlCache, CrawlCacheEntry } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

export class FilesystemCrawlCache implements CrawlCache {
  private readonly cacheDir: string;
  private readonly indexPath: string;
  private readonly bodiesDir: string;
  private index: Map<string, CrawlCacheEntry> = new Map();

  constructor(cacheDir: string = '.seocore-cache') {
    this.cacheDir = path.resolve(cacheDir);
    this.indexPath = path.join(this.cacheDir, 'index.json');
    this.bodiesDir = path.join(this.cacheDir, 'bodies');
    
    this.ensureDirectories();
    this.loadIndex();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.bodiesDir)) {
      fs.mkdirSync(this.bodiesDir, { recursive: true });
    }
  }

  private loadIndex() {
    if (fs.existsSync(this.indexPath)) {
      try {
        const data = fs.readFileSync(this.indexPath, 'utf8');
        const entries = JSON.parse(data);
        this.index = new Map(Object.entries(entries));
      } catch (err) {
        console.warn('[CrawlCache] Failed to load index, starting fresh:', err);
        this.index = new Map();
      }
    }
  }

  private saveIndex() {
    // Write to temporary file then rename for atomicity
    const tempPath = this.indexPath + '.tmp';
    const entries = Object.fromEntries(this.index);
    fs.writeFileSync(tempPath, JSON.stringify(entries, null, 2));
    fs.renameSync(tempPath, this.indexPath);
  }

  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  private hashBody(body: Buffer): string {
    return crypto.createHash('sha256').update(body).digest('hex');
  }

  async get(url: string): Promise<CrawlCacheEntry | null> {
    const key = this.hashUrl(url);
    const entry = this.index.get(key);
    if (!entry) return null;
    // Check if entry is expired
    if (entry.expiresAt) {
      const expiresAt = new Date(entry.expiresAt);
      if (expiresAt < new Date()) {
        await this.invalidate(url);
        return null;
      }
    }
    return entry;
  }

  async set(url: string, entry: CrawlCacheEntry, body: Buffer): Promise<void> {
    const key = this.hashUrl(url);
    const bodyPath = path.join(this.bodiesDir, `${key}.html.gz`);
    
    // Gzip the body
    const zlib = await import('zlib');
    const compressedBody = zlib.gzipSync(body);
    fs.writeFileSync(bodyPath, compressedBody);
    
    // Update entry
    entry.bodyHash = this.hashBody(body);
    entry.bodyPath = bodyPath;
    this.index.set(key, entry);
    this.saveIndex();
  }

  async has(url: string): Promise<boolean> {
    const entry = await this.get(url);
    return entry !== null;
  }

  async invalidate(url: string): Promise<void> {
    const key = this.hashUrl(url);
    const entry = this.index.get(key);
    if (entry) {
      try {
        if (fs.existsSync(entry.bodyPath)) {
          fs.unlinkSync(entry.bodyPath);
        }
      } catch (err) {
        console.warn('[CrawlCache] Failed to delete cached body:', err);
      }
      this.index.delete(key);
      this.saveIndex();
    }
  }

  async clear(): Promise<void> {
    // Clear the index first
    this.index.clear();
    this.saveIndex();
    
    // Delete all body files
    if (fs.existsSync(this.bodiesDir)) {
      const files = fs.readdirSync(this.bodiesDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(this.bodiesDir, file));
        } catch (err) {
          console.warn('[CrawlCache] Failed to delete body file:', err);
        }
      }
    }
  }

  async stats(): Promise<{ entries: number; sizeBytes: number }> {
    let totalSize = 0;
    for (const entry of this.index.values()) {
      if (fs.existsSync(entry.bodyPath)) {
        const stat = fs.statSync(entry.bodyPath);
        totalSize += stat.size;
      }
    }
    return {
      entries: this.index.size,
      sizeBytes: totalSize
    };
  }

  async readBody(entry: CrawlCacheEntry): Promise<string> {
    if (!fs.existsSync(entry.bodyPath)) {
      throw new Error('Cached body not found');
    }
    const compressedBody = fs.readFileSync(entry.bodyPath);
    const zlib = await import('zlib');
    return zlib.gunzipSync(compressedBody).toString('utf8');
  }
}
