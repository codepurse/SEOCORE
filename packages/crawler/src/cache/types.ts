export interface CrawlCacheEntry {
  url: string;
  etag?: string;
  lastModified?: string;
  statusCode: number;
  contentType: string;
  bodyHash: string; // sha256 of body
  bodyPath: string; // path to cached body file
  crawledAt: string; // ISO date
  expiresAt?: string; // ISO date (optional)
}

export interface CrawlCache {
  get(url: string): Promise<CrawlCacheEntry | null>;
  set(url: string, entry: CrawlCacheEntry, body: Buffer): Promise<void>;
  has(url: string): Promise<boolean>;
  invalidate(url: string): Promise<void>;
  clear(): Promise<void>;
  stats(): Promise<{ entries: number; sizeBytes: number }>;
}
