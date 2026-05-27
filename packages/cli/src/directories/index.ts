import * as cheerio from 'cheerio';
import { HttpCrawler } from '@seocore/crawler';
import { resolveConfig } from '@seocore/config';
import { DirectorySearchClient } from './search.js';
import type {
  DirectoryDefinition,
  DirectoryEvidence,
  DirectoryResult,
  DirectoryScanOptions,
  DirectoryScanResult,
  DirectorySearchHit,
  NapDetails,
  SourceBusinessProfile,
} from './types.js';

export const DIRECTORY_DEFINITIONS: DirectoryDefinition[] = [
  { name: 'Facebook', domains: ['facebook.com'] },
  { name: 'Yelp', domains: ['yelp.com'] },
  { name: 'Bing', domains: ['bing.com'] },
  { name: 'Google Business Profile', domains: ['g.page', 'google.com'] },
  { name: 'Brownbook.net', domains: ['brownbook.net'] },
  { name: 'Property Capsule', domains: ['propertycapsule.com'] },
  { name: '8coupons', domains: ['8coupons.com'] },
  { name: 'AroundMe', domains: ['aroundme.com'] },
  { name: 'CitySquares', domains: ['citysquares.com'] },
  { name: 'EZlocal', domains: ['ezlocal.com'] },
  { name: 'Foursquare', domains: ['foursquare.com'] },
  { name: 'GoLocal247', domains: ['golocal247.com'] },
  { name: 'HotFrog', domains: ['hotfrog.com'] },
  { name: 'Hours.com', domains: ['hours.com'] },
  { name: 'iBegin', domains: ['ibegin.com'] },
  { name: 'iGlobal', domains: ['iglobal.co'] },
  { name: 'MapQuest', domains: ['mapquest.com'] },
  { name: 'MerchantCircle', domains: ['merchantcircle.com'] },
  { name: 'My Local Services', domains: ['mylocalservices.com'] },
  { name: 'n49', domains: ['n49.com'] },
  { name: 'Navmii', domains: ['navmii.com'] },
  { name: 'Opendi', domains: ['opendi.us', 'opendi.com'] },
  { name: 'ShowMeLocal', domains: ['showmelocal.com'] },
  { name: 'Snapchat', domains: ['snapchat.com', 'map.snapchat.com'] },
  { name: 'tellows', domains: ['tellows.com'] },
  { name: 'TripAdvisor', domains: ['tripadvisor.com'] },
  { name: 'Tupalo', domains: ['tupalo.com', 'tupalo.co'] },
  { name: 'USCity.net', domains: ['uscity.net'] },
  { name: 'Yahoo!', domains: ['yahoo.com', 'local.yahoo.com'] },
  { name: 'YellowPagesDirectory', domains: ['yellowpagesdirectory.com'] },
  { name: 'YP.com', domains: ['yellowpages.com', 'yp.com'] },
  { name: 'ChamberofCommerce.com', domains: ['chamberofcommerce.com'] },
  { name: 'Cylex', domains: ['cylex.us.com', 'cylexusa.com'] },
  { name: 'Where To?', domains: ['where-to.com', 'whereto.com'] },
];

const NAME_STOP_WORDS = new Set([
  'the', 'and', 'for', 'of', 'inc', 'llc', 'co', 'company', 'corp', 'corporation', 'clinic',
  'center', 'services', 'service', 'group', 'healthcare'
]);

export async function runDirectoryScan(
  html: string,
  targetUrl: string,
  options: DirectoryScanOptions = {},
): Promise<DirectoryScanResult> {
  const extractedNap = extractBusinessProfile(html, targetUrl);
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxCandidatesPerDirectory = Math.max(1, options.maxCandidatesPerDirectory ?? 3);
  const crawler = new HttpCrawler();
  const config = resolveConfig();
  const searchClient = await DirectorySearchClient.create(options.provider ?? 'auto', options.headless ?? true);
  const warnings: string[] = [];

  try {
    const results = await mapWithConcurrency(
      DIRECTORY_DEFINITIONS,
      concurrency,
      async definition => scanSingleDirectory(
        definition,
        extractedNap,
        targetUrl,
        crawler,
        config,
        searchClient,
        maxCandidatesPerDirectory,
        warnings,
      ),
    );

    return {
      targetUrl,
      checkedAt: new Date().toISOString(),
      extractedNap,
      provider: deriveProvider(results, searchClient.getMode()),
      warnings,
      results,
    };
  } finally {
    await searchClient.close();
  }
}

export function extractBusinessProfile(html: string, url: string): SourceBusinessProfile {
  const nap = extractNap(html, url);
  const $ = cheerio.load(html);
  const directoryLinks: Record<string, string[]> = {};

  const registerLink = (rawUrl: string | undefined) => {
    if (!rawUrl) return;
    const normalized = normalizeUrl(rawUrl, url);
    if (!normalized) return;
    const directory = matchDirectoryByUrl(normalized);
    if (!directory) return;
    directoryLinks[directory] ??= [];
    if (!directoryLinks[directory].includes(normalized)) {
      directoryLinks[directory].push(normalized);
    }
  };

  $('a[href]').each((_, el) => {
    registerLink($(el).attr('href'));
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      collectSameAsUrls(json).forEach(registerLink);
    } catch {
      // ignore
    }
  });

  return {
    ...nap,
    directoryLinks,
  };
}

export function extractNap(html: string, url: string): NapDetails {
  const $ = cheerio.load(html);
  let businessName = '';
  let businessPhone = '';
  let businessAddress = '';
  let businessWebsite = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      const business = findBusinessEntity(json);
      if (!business) return;

      if (business.name && !businessName) businessName = String(business.name).trim();
      if (business.telephone && !businessPhone) businessPhone = String(business.telephone).trim();
      if (business.url && !businessWebsite) businessWebsite = String(business.url).trim();
      if (business.address && !businessAddress) {
        businessAddress = stringifyAddress(business.address);
      }
    } catch {
      // ignore broken JSON-LD
    }
  });

  if (!businessName) {
    businessName =
      $('meta[property="og:site_name"]').attr('content')?.trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      $('title').text().replace(/[-|].*$/, '').trim() ||
      fallbackNameFromUrl(url);
  }

  if (!businessPhone) {
    const telHref = $('a[href^="tel:"]').first().attr('href');
    businessPhone = telHref?.replace(/^tel:/, '').trim() || extractPhoneFromText($('body').text()) || 'No Phone Number';
  }

  if (!businessAddress) {
    businessAddress =
      $('address').first().text().replace(/\s+/g, ' ').trim() ||
      extractAddressFromText($('body').text()) ||
      'No Address Detected';
  }

  if (!businessWebsite) {
    businessWebsite = normalizeUrl(
      $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || url,
      url,
    ) || url;
  }

  return {
    name: businessName || 'Unknown Business',
    phone: businessPhone || 'No Phone Number',
    address: businessAddress || 'No Address Detected',
    website: businessWebsite,
  };
}

export function classifyEvidence(source: SourceBusinessProfile, evidence: DirectoryEvidence): string {
  const sourcePhone = normalizePhone(source.phone);
  const listingPhone = normalizePhone(evidence.listingNap.phone);
  const phoneMismatch = !!sourcePhone && !!listingPhone && sourcePhone !== listingPhone;
  const nameMismatch = hasMeaningfulText(evidence.listingNap.name) && evidence.nameScore < 0.6;
  const noPhone = !!sourcePhone && !listingPhone;

  if (nameMismatch && phoneMismatch) return 'Wrong Business Name, Wrong Phone Number';
  if (nameMismatch) return 'Wrong Business Name';
  if (phoneMismatch) return 'Wrong Phone Number';
  if (noPhone) return 'No Phone Number';
  return 'Issues not found';
}

async function scanSingleDirectory(
  definition: DirectoryDefinition,
  source: SourceBusinessProfile,
  targetUrl: string,
  crawler: HttpCrawler,
  config: ReturnType<typeof resolveConfig>,
  searchClient: DirectorySearchClient,
  maxCandidatesPerDirectory: number,
  warnings: string[],
): Promise<DirectoryResult> {
  try {
    const directHits = (source.directoryLinks[definition.name] || []).map((url, index) => ({
      title: definition.name,
      url,
      snippet: '',
      domain: extractDomain(url),
      position: index + 1,
      source: 'website-link' as const,
    }));

    const directEvidence = await evaluateCandidates(
      definition,
      directHits,
      source,
      targetUrl,
      crawler,
      config,
      maxCandidatesPerDirectory,
    );
    if (directEvidence) {
      return buildDirectoryResult(definition.name, source, directEvidence);
    }

    const searchResponse = await searchClient.search(definition, source, targetUrl);
    const searchEvidence = await evaluateCandidates(
      definition,
      searchResponse.hits,
      source,
      targetUrl,
      crawler,
      config,
      maxCandidatesPerDirectory,
    );

    if (searchEvidence) {
      return buildDirectoryResult(definition.name, source, searchEvidence);
    }

    const topHit = searchResponse.hits[0];
    return {
      directory: definition.name,
      status: 'Not Present',
      details: buildNotPresentDetails(topHit),
      listingUrl: topHit?.url,
    };
  } catch (err: any) {
    warnings.push(`${definition.name}: ${err.message}`);
    return {
      directory: definition.name,
      status: 'Search failed',
      details: err.message,
      error: err.message,
    };
  }
}

async function evaluateCandidates(
  definition: DirectoryDefinition,
  hits: DirectorySearchHit[],
  source: SourceBusinessProfile,
  targetUrl: string,
  crawler: HttpCrawler,
  config: ReturnType<typeof resolveConfig>,
  maxCandidatesPerDirectory: number,
): Promise<DirectoryEvidence | null> {
  const filtered = hits
    .filter(hit => hit.url && definition.domains.some(domain => hit.domain === domain || hit.domain.endsWith(`.${domain}`)))
    .slice(0, maxCandidatesPerDirectory);

  let bestEvidence: DirectoryEvidence | null = null;
  for (const hit of filtered) {
    const evidence = await inspectCandidate(hit, source, targetUrl, crawler, config);
    if (!evidence) continue;
    if (!bestEvidence || evidence.confidence > bestEvidence.confidence) {
      bestEvidence = evidence;
    }
  }

  return bestEvidence && isValidatedEvidence(bestEvidence) ? bestEvidence : null;
}

async function inspectCandidate(
  hit: DirectorySearchHit,
  source: SourceBusinessProfile,
  targetUrl: string,
  crawler: HttpCrawler,
  config: ReturnType<typeof resolveConfig>,
): Promise<DirectoryEvidence | null> {
  let html = '';
  try {
    const result = await crawler.crawl(hit.url, config);
    if (result.statusCode >= 200 && result.statusCode < 400 && result.html) {
      html = result.html;
    }
  } catch {
    // use search snippet fallback
  }

  const listingNap = html ? extractNap(html, hit.url) : fallbackListingNapFromHit(hit);
  const pageLinks = html ? extractOutgoingLinks(html, hit.url) : [];
  const websiteMatch = pageLinks.some(link => sameRegisteredDomain(link, targetUrl)) || sameRegisteredDomain(listingNap.website, targetUrl);
  const phoneMatch = normalizedPhoneEquals(source.phone, listingNap.phone) || normalizedPhoneEquals(source.phone, hit.snippet);
  const nameScore = scoreTokenOverlap(source.name, `${listingNap.name} ${hit.title}`, NAME_STOP_WORDS);
  const addressScore = scoreTokenOverlap(source.address, `${listingNap.address} ${hit.snippet}`, new Set());

  const matchedSignals: string[] = [];
  const mismatchedSignals: string[] = [];

  if (websiteMatch) matchedSignals.push('website link matches');
  if (phoneMatch) matchedSignals.push('phone matches');
  if (nameScore >= 0.75) matchedSignals.push('business name matches');
  if (addressScore >= 0.65) matchedSignals.push('address matches');

  if (!phoneMatch && normalizePhone(source.phone) && normalizePhone(listingNap.phone)) mismatchedSignals.push('phone mismatch');
  if (nameScore < 0.6 && hasMeaningfulText(listingNap.name)) mismatchedSignals.push('name mismatch');
  if (addressScore < 0.5 && hasMeaningfulText(listingNap.address) && hasMeaningfulText(source.address)) mismatchedSignals.push('address mismatch');

  const confidence = Math.min(
    1,
    (websiteMatch ? 0.55 : 0) +
    (phoneMatch ? 0.25 : 0) +
    (nameScore * 0.15) +
    (addressScore * 0.1) +
    (hit.source === 'website-link' ? 0.1 : 0),
  );

  return {
    listingUrl: hit.url,
    source: hit.source,
    sourceTitle: hit.title,
    sourceSnippet: hit.snippet,
    matchedSignals,
    mismatchedSignals,
    listingNap,
    websiteMatch,
    phoneMatch,
    addressScore,
    nameScore,
    confidence,
  };
}

function buildDirectoryResult(directory: string, source: SourceBusinessProfile, evidence: DirectoryEvidence): DirectoryResult {
  const status = classifyEvidence(source, evidence);
  return {
    directory,
    status,
    details: buildMatchedDetails(status, evidence),
    listingUrl: evidence.listingUrl,
    evidence,
  };
}

function buildMatchedDetails(status: string, evidence: DirectoryEvidence): string {
  const lines = [
    evidence.listingNap.name || 'Name unavailable',
    normalizePhone(evidence.listingNap.phone) ? evidence.listingNap.phone : 'Phone missing on listing',
    hasMeaningfulText(evidence.listingNap.address) ? evidence.listingNap.address : 'Address unavailable',
    `URL: ${evidence.listingUrl}`,
  ];

  if (status !== 'Issues not found' && evidence.mismatchedSignals.length > 0) {
    lines.push(`Issues: ${evidence.mismatchedSignals.join(', ')}`);
  } else if (evidence.matchedSignals.length > 0) {
    lines.push(`Signals: ${evidence.matchedSignals.join(', ')}`);
  }

  return lines.join('\n');
}

function buildNotPresentDetails(topHit?: DirectorySearchHit): string {
  if (!topHit) {
    return 'No validated listing found from live search.';
  }
  return [
    'No validated listing found from live search.',
    `Closest hit: ${topHit.title || topHit.url}`,
    `URL: ${topHit.url}`,
  ].join('\n');
}

function fallbackListingNapFromHit(hit: DirectorySearchHit): NapDetails {
  return {
    name: sanitizeSearchTitle(hit.title),
    phone: extractPhoneFromText(hit.snippet) || 'No Phone Number',
    address: extractAddressFromText(hit.snippet) || 'No Address Detected',
    website: '',
  };
}

function findBusinessEntity(input: any): any {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findBusinessEntity(item);
      if (found) return found;
    }
    return null;
  }

  const type = Array.isArray(input['@type']) ? input['@type'][0] : input['@type'];
  if (typeof type === 'string' && /Business|Organization|Store|Restaurant|Medical|Dentist|Attorney/i.test(type)) {
    return input;
  }

  if (Array.isArray(input['@graph'])) {
    return findBusinessEntity(input['@graph']);
  }

  for (const value of Object.values(input)) {
    const found = findBusinessEntity(value);
    if (found) return found;
  }

  return null;
}

function stringifyAddress(address: unknown): string {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  if (typeof address !== 'object') return '';

  const value = address as Record<string, unknown>;
  const parts = [
    value.streetAddress,
    value.addressLocality,
    value.addressRegion,
    value.postalCode,
  ]
    .filter(Boolean)
    .map(entry => String(entry).trim());

  return parts.join(', ');
}

function collectSameAsUrls(input: any): string[] {
  if (!input || typeof input !== 'object') return [];
  if (Array.isArray(input)) return input.flatMap(collectSameAsUrls);

  const values: string[] = [];
  const sameAs = input.sameAs;
  if (typeof sameAs === 'string') values.push(sameAs);
  if (Array.isArray(sameAs)) values.push(...sameAs.filter((entry): entry is string => typeof entry === 'string'));

  for (const value of Object.values(input)) {
    values.push(...collectSameAsUrls(value));
  }

  return values;
}

function matchDirectoryByUrl(url: string): string | null {
  const domain = extractDomain(url);
  const match = DIRECTORY_DEFINITIONS.find(def =>
    def.domains.some(candidate => domain === candidate || domain.endsWith(`.${candidate}`)),
  );
  return match?.name || null;
}

function extractOutgoingLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = normalizeUrl($(el).attr('href'), pageUrl);
    if (href) urls.add(href);
  });
  return Array.from(urls);
}

function sanitizeSearchTitle(title: string): string {
  return title.replace(/\s*[-|].*$/, '').trim() || 'Unknown Business';
}

function extractPhoneFromText(text: string): string | null {
  const match = text.match(/(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return match ? match[0].trim() : null;
}

function extractAddressFromText(text: string): string | null {
  const compact = text.replace(/\s+/g, ' ').trim();
  const match = compact.match(/\d{1,6}\s+[A-Za-z0-9.\-# ]+\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Plaza|Plz|Suite|Ste|Unit|Bldg)\b[^,]*(?:,\s*[A-Za-z.\- ]+){1,3}/i);
  return match ? match[0].trim() : null;
}

function fallbackNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const value = host.split('.')[0] || host;
    return value.charAt(0).toUpperCase() + value.slice(1);
  } catch {
    return 'Unknown Business';
  }
}

function normalizeUrl(url: string | undefined, baseUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function registeredDomain(url: string): string {
  const domain = extractDomain(url);
  const parts = domain.split('.').filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('.') : domain;
}

function sameRegisteredDomain(left: string, right: string): boolean {
  if (!left || !right) return false;
  return registeredDomain(left) === registeredDomain(right);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizedPhoneEquals(left: string, right: string): boolean {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  return !!a && !!b && a === b;
}

function tokenize(value: string, stopWords: Set<string>): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !stopWords.has(token));
}

export function scoreTokenOverlap(source: string, candidate: string, stopWords: Set<string>): number {
  const sourceTokens = new Set(tokenize(source, stopWords));
  const candidateTokens = new Set(tokenize(candidate, stopWords));
  if (sourceTokens.size === 0 || candidateTokens.size === 0) return 0;

  let matches = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) matches += 1;
  }

  return matches / sourceTokens.size;
}

function hasMeaningfulText(value: string): boolean {
  return !!value && value !== 'Unknown Business' && value !== 'No Phone Number' && value !== 'No Address Detected';
}

function isValidatedEvidence(evidence: DirectoryEvidence): boolean {
  return (
    evidence.websiteMatch ||
    (evidence.phoneMatch && evidence.nameScore >= 0.6) ||
    (evidence.phoneMatch && evidence.addressScore >= 0.5) ||
    (evidence.nameScore >= 0.75 && evidence.addressScore >= 0.65)
  );
}

function deriveProvider(results: DirectoryResult[], fallback: 'serpapi' | 'cascade' | 'playwright'): DirectoryScanResult['provider'] {
  const sources = new Set<string>();
  for (const result of results) {
    if (result.evidence?.source) sources.add(result.evidence.source);
  }
  if (sources.size === 0) return fallback;
  if (sources.size === 1) return sources.values().next().value as DirectoryScanResult['provider'];
  return 'mixed';
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(values[current], current);
    }
  });

  await Promise.all(runners);
  return results;
}
