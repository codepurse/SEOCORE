import fetch, { Headers } from 'node-fetch';
import { ImageRecord } from './types.js';
import pc from 'picocolors';

export interface FetchResult {
  statusCode: number;
  bytes: number;
  contentType: string;
  cacheControl: string;
  isCdn: boolean;
  headers: Record<string, string>;
  buffer?: Buffer;
  fetchFailed: boolean;
  fetchError?: string;
}

// Check CDN signals in headers
export function checkIsCdn(headers: Headers): boolean {
  const cdnSignals = [
    'x-cache', 'cf-ray', 'cf-cache-status', 'x-amz-cf-id', 'x-cloudfront',
    'x-fastly', 'fastly-rekey', 'x-akamai-cln', 'x-edge-location',
    'x-sucuri-id', 'server-timing'
  ];
  for (const signal of cdnSignals) {
    if (headers.has(signal)) return true;
  }
  const server = headers.get('server')?.toLowerCase() || '';
  if (server.includes('cloudflare') || server.includes('cloudfront') || server.includes('fastly') || server.includes('akamai')) {
    return true;
  }
  return false;
}

async function fetchWithRetryAndTimeout(
  url: string,
  userAgent?: string,
  timeoutMs: number = 10000,
  retries: number = 1
): Promise<{ response: any; buffer: Buffer }> {
  const defaultUA = 'Mozilla/5.0 (compatible; SeoCoreEngine/1.0.0; +https://github.com/seocore)';
  const headersObj: Record<string, string> = {
    'User-Agent': userAgent || defaultUA,
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  let attempts = 0;
  while (attempts <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      attempts++;
      const response = await fetch(url, {
        headers: headersObj,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && attempts <= retries && response.status >= 500) {
        // Retry on 5xx
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      const buffer = await response.buffer();
      return { response, buffer };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempts <= retries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function fetchImageMetadata(
  url: string,
  options: {
    userAgent?: string;
    timeout: number;
  }
): Promise<FetchResult> {
  try {
    const { response, buffer } = await fetchWithRetryAndTimeout(
      url,
      options.userAgent,
      options.timeout
    );

    const headers: Record<string, string> = {};
    response.headers.forEach((val: string, key: string) => {
      headers[key] = val;
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const bytes = contentLength ? parseInt(contentLength, 10) : buffer.length;

    return {
      statusCode: response.status,
      bytes: isNaN(bytes) ? buffer.length : bytes,
      contentType,
      cacheControl: response.headers.get('cache-control') || '',
      isCdn: checkIsCdn(response.headers),
      headers,
      buffer,
      fetchFailed: false,
    };
  } catch (err: any) {
    return {
      statusCode: 0,
      bytes: 0,
      contentType: 'none',
      cacheControl: '',
      isCdn: false,
      headers: {},
      fetchFailed: true,
      fetchError: err.message || 'Network error',
    };
  }
}

// Concurrency-controlled batch fetcher
export async function fetchAllImages(
  images: ImageRecord[],
  options: {
    concurrency: number;
    userAgent?: string;
    timeout: number;
  }
): Promise<void> {
  const limit = options.concurrency;
  let index = 0;

  console.log(pc.cyan(`\n📥  Fetching ${images.length} images with concurrency ${limit}...`));

  async function runWorker() {
    while (index < images.length) {
      const i = index++;
      const record = images[i];
      
      const fetchResult = await fetchImageMetadata(record.src, {
        userAgent: options.userAgent,
        timeout: options.timeout,
      });

      // Assign fetched details to record
      record.statusCode = fetchResult.statusCode;
      record.bytes = fetchResult.bytes;
      record.contentType = fetchResult.contentType;
      record.cacheControl = fetchResult.cacheControl;
      record.isCdn = fetchResult.isCdn;
      record.headers = fetchResult.headers;
      
      if (fetchResult.fetchFailed) {
        record.fetchFailed = true;
        record.fetchError = fetchResult.fetchError;
      }

      // Store buffer in record as temporary field (we'll delete it after decoding to save memory)
      if (fetchResult.buffer) {
        (record as any)._tempBuffer = fetchResult.buffer;
      }
    }
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(limit, images.length);
  for (let w = 0; w < workerCount; w++) {
    workers.push(runWorker());
  }

  await Promise.all(workers);
}
