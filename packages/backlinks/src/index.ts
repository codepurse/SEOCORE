import {
  Backlink,
  BacklinkApiConfig,
  BacklinkDomainMetrics,
  BacklinkIntelligenceData,
  BingBacklinkSourceConfig,
  GscBacklinkSourceConfig,
  LogBacklinkSourceConfig,
} from '@seocore/sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface BacklinkClient {
  getBacklinks(targetUrl: string, limit?: number): Promise<Backlink[]>;
  getDomainMetrics(targetUrl: string): Promise<BacklinkDomainMetrics>;
  getIntelligence(targetUrl: string, limit?: number): Promise<BacklinkIntelligenceData>;
}

const BING_API_BASE_URL = 'https://ssl.bing.com/webmaster/api.svc/json';
const DEFAULT_LIMIT = 100;

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeHostname(value: string): string {
  return value.replace(/^www\./i, '').toLowerCase();
}

function normalizeUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    parsed.hash = '';

    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function matchesTarget(candidateUrl: string, targetUrl: string): boolean {
  const normalizedCandidate = normalizeUrl(candidateUrl);
  const normalizedTarget = normalizeUrl(targetUrl);
  return normalizedCandidate !== null && normalizedTarget !== null && normalizedCandidate === normalizedTarget;
}

function countReferringDomains(backlinks: Backlink[]): number {
  const domains = new Set<string>();

  for (const backlink of backlinks) {
    try {
      domains.add(normalizeHostname(new URL(backlink.sourceUrl).hostname));
    } catch {
      // Ignore malformed source URLs.
    }
  }

  return domains.size;
}

function dedupeBacklinks(backlinks: Backlink[]): Backlink[] {
  const deduped = new Map<string, Backlink>();

  for (const backlink of backlinks) {
    const sourceUrl = normalizeUrl(backlink.sourceUrl);
    const targetUrl = normalizeUrl(backlink.targetUrl);
    if (!sourceUrl || !targetUrl) continue;

    const key = `${sourceUrl} -> ${targetUrl}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, {
        ...backlink,
        sourceUrl,
        targetUrl,
      });
      continue;
    }

    const anchorText = backlink.anchorText.length > existing.anchorText.length ? backlink.anchorText : existing.anchorText;
    const firstSeen = existing.firstSeen && backlink.firstSeen
      ? existing.firstSeen < backlink.firstSeen ? existing.firstSeen : backlink.firstSeen
      : existing.firstSeen ?? backlink.firstSeen;
    const lastSeen = existing.lastSeen && backlink.lastSeen
      ? existing.lastSeen > backlink.lastSeen ? existing.lastSeen : backlink.lastSeen
      : existing.lastSeen ?? backlink.lastSeen;

    deduped.set(key, {
      ...existing,
      ...backlink,
      sourceUrl,
      targetUrl,
      anchorText,
      firstSeen,
      lastSeen,
      isDofollow: existing.isDofollow ?? backlink.isDofollow,
      domainAuthority: Math.max(existing.domainAuthority ?? 0, backlink.domainAuthority ?? 0) || existing.domainAuthority || backlink.domainAuthority,
      pageAuthority: Math.max(existing.pageAuthority ?? 0, backlink.pageAuthority ?? 0) || existing.pageAuthority || backlink.pageAuthority,
      spamScore: existing.spamScore ?? backlink.spamScore,
    });
  }

  return [...deduped.values()].sort((left, right) => {
    const leftSeen = left.lastSeen?.getTime() ?? 0;
    const rightSeen = right.lastSeen?.getTime() ?? 0;
    if (leftSeen !== rightSeen) return rightSeen - leftSeen;
    return left.sourceUrl.localeCompare(right.sourceUrl);
  });
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const bingDateMatch = trimmed.match(/^\/Date\((\d+)/);
  if (bingDateMatch) {
    const date = new Date(Number.parseInt(bingDateMatch[1], 10));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentValue);
      currentValue = '';
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  if (currentRow.some(cell => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function getColumnValue(row: string[], headerIndex: Map<string, number>, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const headerPosition = headerIndex.get(candidate);
    if (headerPosition === undefined) continue;

    const value = row[headerPosition]?.trim();
    if (value) return value;
  }

  return undefined;
}

function parseCommonLogDate(value: string): Date | undefined {
  const match = value.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!match) return undefined;

  const months: Record<string, string> = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };

  const isoDate = `${match[3]}-${months[match[2]]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}${match[7].slice(0, 3)}:${match[7].slice(3)}`;
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function resolveTargetSiteUrl(targetUrl: string, configuredSiteUrl?: string): string {
  if (configuredSiteUrl) return configuredSiteUrl;
  return new URL(targetUrl).origin;
}

function ensureConfiguredSource(config: BacklinkApiConfig): void {
  const hasBing = config.bing?.enabled !== false && !!config.bing?.apiKey;
  const hasGsc = config.gsc?.enabled !== false && !!config.gsc?.exportPath;
  const hasLogs = config.logs?.enabled !== false && (config.logs?.paths?.length ?? 0) > 0;

  if (!hasBing && !hasGsc && !hasLogs) {
    throw new Error(
      'No backlink sources configured. Add Bing credentials, a Google Search Console export path, or access-log paths.'
    );
  }
}

async function fetchBingJson<T>(method: string, params: Record<string, string | number | undefined>, apiKey: string): Promise<T> {
  const url = new URL(`${BING_API_BASE_URL}/${method}`);
  url.searchParams.set('apikey', apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bing Webmaster API ${method} failed with ${response.status}.`);
  }

  const payload: any = await response.json();
  return (payload?.d ?? payload) as T;
}

function mapBacklinkMetrics(backlinks: Backlink[], sourceCount: number, notes: string[] = []): BacklinkDomainMetrics {
  return {
    totalBacklinks: backlinks.length,
    referringDomains: countReferringDomains(backlinks),
    sourceCount,
    authorityMetricsAvailable: backlinks.some(backlink => backlink.domainAuthority !== undefined || backlink.spamScore !== undefined),
    notes: notes.length > 0 ? [...new Set(notes)] : undefined,
  };
}

async function loadBacklinksFromGscExport(config: GscBacklinkSourceConfig, targetUrl: string): Promise<Backlink[]> {
  if (!config.exportPath) return [];

  const filePath = path.resolve(config.exportPath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`GSC export file not found: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headerIndex = new Map(rows[0].map((header, index) => [normalizeHeader(header), index]));
  const sourceCandidates = ['linkingpage', 'linkingpageurl', 'sourceurl', 'sourcepage', 'source'];
  const targetCandidates = ['targeturl', 'targetpage', 'targetpageurl', 'landingpage', 'page'];
  const anchorCandidates = ['anchortext', 'linktext', 'anchor'];
  const firstSeenCandidates = ['firstseen', 'discovered', 'discoverydate', 'date'];
  const lastSeenCandidates = ['lastseen', 'updated'];
  const maxRows = Math.max(1, config.maxRows ?? 5000);

  const backlinks: Backlink[] = [];
  for (const row of rows.slice(1, maxRows + 1)) {
    const sourceUrl = getColumnValue(row, headerIndex, sourceCandidates);
    const targetCandidate = getColumnValue(row, headerIndex, targetCandidates);
    if (!sourceUrl || !targetCandidate) continue;

    const normalizedSource = normalizeUrl(sourceUrl);
    const normalizedTarget = normalizeUrl(targetCandidate);
    if (!normalizedSource || !normalizedTarget || !matchesTarget(normalizedTarget, targetUrl)) continue;

    backlinks.push({
      sourceUrl: normalizedSource,
      targetUrl: normalizedTarget,
      anchorText: getColumnValue(row, headerIndex, anchorCandidates) ?? '',
      isDofollow: undefined,
      firstSeen: parseDate(getColumnValue(row, headerIndex, firstSeenCandidates)),
      lastSeen: parseDate(getColumnValue(row, headerIndex, lastSeenCandidates)),
    });
  }

  return dedupeBacklinks(backlinks);
}

async function loadBacklinksFromLogs(config: LogBacklinkSourceConfig, targetUrl: string): Promise<Backlink[]> {
  const logPaths = config.paths ?? [];
  if (logPaths.length === 0) return [];

  const target = new URL(targetUrl);
  const backlinks: Backlink[] = [];
  const maxRows = Math.max(1, config.maxRows ?? 5000);
  const logPattern = /^\S+ \S+ \S+ \[(?<timestamp>[^\]]+)\] "(?<method>[A-Z]+) (?<request>[^"]+?) HTTP\/[^"]+" (?<status>\d{3}) \S+ "(?<referrer>[^"]*)" "(?<userAgent>[^"]*)"/;

  for (const configuredPath of logPaths) {
    const filePath = path.resolve(configuredPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Access log file not found: ${filePath}`);
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0 && backlinks.length < maxRows; i--) {
      const line = lines[i];
      if (!line) continue;

      const match = line.match(logPattern);
      const groups = match?.groups;
      if (!groups) continue;

      const status = Number.parseInt(groups.status, 10);
      if (!Number.isFinite(status) || status < 200 || status >= 400) continue;
      if (!groups.referrer || groups.referrer === '-') continue;

      const normalizedSource = normalizeUrl(groups.referrer);
      if (!normalizedSource) continue;

      const sourceHost = normalizeHostname(new URL(normalizedSource).hostname);
      if (sourceHost === normalizeHostname(target.hostname)) continue;

      const requestTarget = groups.request.startsWith('http')
        ? groups.request
        : new URL(groups.request, target.origin).toString();

      const normalizedTarget = normalizeUrl(requestTarget);
      if (!normalizedTarget || !matchesTarget(normalizedTarget, targetUrl)) continue;

      backlinks.push({
        sourceUrl: normalizedSource,
        targetUrl: normalizedTarget,
        anchorText: '',
        isDofollow: undefined,
        lastSeen: parseCommonLogDate(groups.timestamp),
      });
    }
  }

  return dedupeBacklinks(backlinks);
}

export class BingClient implements BacklinkClient {
  private readonly config: BingBacklinkSourceConfig;

  constructor(config: BingBacklinkSourceConfig) {
    this.config = config;
  }

  async getBacklinks(targetUrl: string, limit: number = DEFAULT_LIMIT): Promise<Backlink[]> {
    if (!this.config.apiKey) {
      throw new Error('Bing Webmaster API key is required.');
    }

    const siteUrl = resolveTargetSiteUrl(targetUrl, this.config.siteUrl);
    const maxPages = Math.max(1, this.config.maxPages ?? 3);
    const backlinks: Backlink[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages && page < maxPages && backlinks.length < limit) {
      const payload = await fetchBingJson<{ Details?: Array<{ AnchorText?: string; Url?: string }>; TotalPages?: number }>(
        'GetUrlLinks',
        { siteUrl, link: targetUrl, page },
        this.config.apiKey
      );

      totalPages = Math.max(1, payload.TotalPages ?? 1);
      for (const detail of payload.Details ?? []) {
        const sourceUrl = normalizeUrl(detail.Url ?? '');
        if (!sourceUrl) continue;

        backlinks.push({
          sourceUrl,
          targetUrl,
          anchorText: detail.AnchorText?.trim() ?? '',
          isDofollow: undefined,
        });
      }

      page++;
    }

    return dedupeBacklinks(backlinks).slice(0, limit);
  }

  async getDomainMetrics(targetUrl: string): Promise<BacklinkDomainMetrics> {
    if (!this.config.apiKey) {
      throw new Error('Bing Webmaster API key is required.');
    }

    const siteUrl = resolveTargetSiteUrl(targetUrl, this.config.siteUrl);
    const payload = await fetchBingJson<Array<{ InLinks?: number }>>(
      'GetCrawlStats',
      { siteUrl },
      this.config.apiKey
    );

    const latest = Array.isArray(payload) ? payload.at(-1) : undefined;
    return {
      totalBacklinks: latest?.InLinks,
      sourceCount: 1,
      authorityMetricsAvailable: false,
      notes: ['Bing source covers verified properties and Bing-discovered inbound links.'],
    };
  }

  async getIntelligence(targetUrl: string, limit: number = DEFAULT_LIMIT): Promise<BacklinkIntelligenceData> {
    const backlinks = await this.getBacklinks(targetUrl, limit);
    const domainMetrics = await this.getDomainMetrics(targetUrl);

    return {
      backlinks,
      domainMetrics: {
        ...domainMetrics,
        totalBacklinks: Math.max(domainMetrics.totalBacklinks ?? 0, backlinks.length) || domainMetrics.totalBacklinks,
        referringDomains: domainMetrics.referringDomains ?? countReferringDomains(backlinks),
      },
      sources: ['bing'],
    };
  }
}

export class CustomBacklinkClient implements BacklinkClient {
  private readonly config: BacklinkApiConfig;

  constructor(config: BacklinkApiConfig) {
    this.config = config;
  }

  async getBacklinks(targetUrl: string, limit: number = DEFAULT_LIMIT): Promise<Backlink[]> {
    const intelligence = await this.getIntelligence(targetUrl, limit);
    return intelligence.backlinks;
  }

  async getDomainMetrics(targetUrl: string): Promise<BacklinkDomainMetrics> {
    const intelligence = await this.getIntelligence(targetUrl, DEFAULT_LIMIT);
    return intelligence.domainMetrics;
  }

  async getIntelligence(targetUrl: string, limit: number = DEFAULT_LIMIT): Promise<BacklinkIntelligenceData> {
    ensureConfiguredSource(this.config);

    const sourceBacklinks: Backlink[] = [];
    const sourceNames: string[] = [];
    const notes: string[] = [];
    let bestTotalBacklinks: number | undefined;

    if (this.config.bing?.enabled !== false && this.config.bing?.apiKey) {
      const bingClient = new BingClient(this.config.bing);
      const bingData = await bingClient.getIntelligence(targetUrl, limit);
      sourceBacklinks.push(...bingData.backlinks);
      sourceNames.push(...bingData.sources);
      notes.push(...(bingData.domainMetrics.notes ?? []));
      if (bingData.domainMetrics.totalBacklinks !== undefined) {
        bestTotalBacklinks = Math.max(bestTotalBacklinks ?? 0, bingData.domainMetrics.totalBacklinks);
      }
    }

    if (this.config.gsc?.enabled !== false && this.config.gsc?.exportPath) {
      const gscBacklinks = await loadBacklinksFromGscExport(this.config.gsc, targetUrl);
      sourceBacklinks.push(...gscBacklinks);
      sourceNames.push('gsc');
      notes.push('GSC export is sample-based and does not expose nofollow metadata.');
    }

    const logConfig = this.config.logs;
    if (logConfig && logConfig.enabled !== false && (logConfig.paths?.length ?? 0) > 0) {
      const logBacklinks = await loadBacklinksFromLogs(logConfig, targetUrl);
      sourceBacklinks.push(...logBacklinks);
      sourceNames.push('logs');
      notes.push('Access-log source only captures backlinks that generated visits.');
    }

    const backlinks = dedupeBacklinks(sourceBacklinks).slice(0, limit);
    const sources = [...new Set(sourceNames)];

    if (sources.length === 0) {
      throw new Error('Custom backlink provider has no usable sources. Check Bing credentials, GSC export path, and log file paths.');
    }

    return {
      backlinks,
      domainMetrics: {
        ...mapBacklinkMetrics(backlinks, sources.length, notes),
        totalBacklinks: Math.max(bestTotalBacklinks ?? 0, backlinks.length) || bestTotalBacklinks,
      },
      sources,
    };
  }
}

export function createBacklinkClient(config: BacklinkApiConfig): BacklinkClient {
  switch (config.provider) {
    case 'bing':
      if (!config.bing?.apiKey) throw new Error('Bing Webmaster API key is required');
      return new BingClient(config.bing);
    case 'custom':
      return new CustomBacklinkClient(config);
    default:
      throw new Error(`Unsupported backlink provider: ${config.provider}`);
  }
}
