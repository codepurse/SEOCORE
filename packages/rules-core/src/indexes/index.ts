import type { NormalizedPage } from '@seocore/sdk';

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeMetaDesc(desc: string): string {
  return desc.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contentShingles(text: string, k = 5): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(' '));
  }
  return shingles;
}

export function minHashSignature(shingles: Set<string>, numHashes = 64): number[] {
  const signature: number[] = new Array(numHashes).fill(Infinity);
  for (const shingle of shingles) {
    let h1 = 0;
    let h2 = 0;
    for (let i = 0; i < shingle.length; i++) {
      h1 = (h1 * 31 + shingle.charCodeAt(i)) >>> 0;
      h2 = (h2 * 37 + shingle.charCodeAt(i)) >>> 0;
    }
    for (let i = 0; i < numHashes; i++) {
      const combined = ((h1 + i * h2) >>> 0) % 2147483647;
      signature[i] = Math.min(signature[i], combined);
    }
  }
  return signature;
}

export function estimateJaccard(sig1: number[], sig2: number[]): number {
  if (sig1.length !== sig2.length) return 0;
  let matches = 0;
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i] === sig2[i]) matches++;
  }
  return matches / sig1.length;
}

export interface PageIndexEntry {
  url: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  contentSignature?: number[];
}

export class PageIndexRegistry {
  private titleIndex = new Map<string, string[]>();
  private metaDescIndex = new Map<string, string[]>();
  private contentHashIndex = new Map<string, PageIndexEntry>();
  private internalLinksIn = new Map<string, Set<string>>();
  private internalLinksOut = new Map<string, Set<string>>();
  private h1Index = new Map<string, string[]>();
  private urlToEntry = new Map<string, PageIndexEntry>();

  indexPage(page: NormalizedPage): void {
    const entry: PageIndexEntry = { url: page.url };

    if (page.title) {
      const key = normalizeTitle(page.title);
      const list = this.titleIndex.get(key) ?? [];
      list.push(page.url);
      this.titleIndex.set(key, list);
      entry.title = key;
    }

    if (page.metaDescription) {
      const key = normalizeMetaDesc(page.metaDescription);
      const list = this.metaDescIndex.get(key) ?? [];
      list.push(page.url);
      this.metaDescIndex.set(key, list);
      entry.metaDescription = key;
    }

    if (page.headings?.h1?.length > 0) {
      const key = normalizeTitle(page.headings.h1[0]);
      const list = this.h1Index.get(key) ?? [];
      list.push(page.url);
      this.h1Index.set(key, list);
      entry.h1 = key;
    }

    for (const link of page.links) {
      if (link.isInternal) {
        const outSet = this.internalLinksOut.get(page.url) ?? new Set<string>();
        outSet.add(link.url);
        this.internalLinksOut.set(page.url, outSet);

        const inSet = this.internalLinksIn.get(link.url) ?? new Set<string>();
        inSet.add(page.url);
        this.internalLinksIn.set(link.url, inSet);
      }
    }

    if (page.html) {
      const text = stripHtml(page.html);
      const shingles = contentShingles(text, 5);
      if (shingles.size > 0) {
        entry.contentSignature = minHashSignature(shingles, 64);
      }
    }

    this.urlToEntry.set(page.url, entry);
    this.contentHashIndex.set(page.url, entry);
  }

  duplicateTitles(url: string, title: string): string[] {
    const key = normalizeTitle(title);
    return (this.titleIndex.get(key) ?? []).filter(u => u !== url);
  }

  duplicateMetaDescriptions(url: string, metaDesc: string): string[] {
    const key = normalizeMetaDesc(metaDesc);
    return (this.metaDescIndex.get(key) ?? []).filter(u => u !== url);
  }

  duplicateH1s(url: string, h1: string): string[] {
    const key = normalizeTitle(h1);
    return (this.h1Index.get(key) ?? []).filter(u => u !== url);
  }

  inboundLinks(url: string): Set<string> {
    return this.internalLinksIn.get(url) ?? new Set<string>();
  }

  outboundLinks(url: string): Set<string> {
    return this.internalLinksOut.get(url) ?? new Set<string>();
  }

  similarPages(url: string, threshold = 0.8): { url: string; similarity: number }[] {
    const entry = this.urlToEntry.get(url);
    if (!entry?.contentSignature) return [];

    const results: { url: string; similarity: number }[] = [];
    for (const [otherUrl, otherEntry] of this.contentHashIndex) {
      if (otherUrl === url || !otherEntry.contentSignature) continue;
      const similarity = estimateJaccard(entry.contentSignature, otherEntry.contentSignature);
      if (similarity >= threshold) {
        results.push({ url: otherUrl, similarity });
      }
    }
    return results;
  }

  getEntry(url: string): PageIndexEntry | undefined {
    return this.urlToEntry.get(url);
  }

  allUrls(): string[] {
    return Array.from(this.urlToEntry.keys());
  }

  clear(): void {
    this.titleIndex.clear();
    this.metaDescIndex.clear();
    this.contentHashIndex.clear();
    this.internalLinksIn.clear();
    this.internalLinksOut.clear();
    this.h1Index.clear();
    this.urlToEntry.clear();
  }
}
