export interface NapDetails {
  name: string;
  phone: string;
  address: string;
  website: string;
}

export interface SourceBusinessProfile extends NapDetails {
  directoryLinks: Record<string, string[]>;
}

export interface DirectoryDefinition {
  name: string;
  domains: string[];
}

export type DirectorySearchSource =
  | 'website-link'
  | 'serpapi'
  | 'bing'
  | 'brave'
  | 'mojeek'
  | 'duckduckgo'
  | 'playwright';

export interface DirectorySearchHit {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  position: number;
  source: DirectorySearchSource;
}

export interface DirectoryEvidence {
  listingUrl: string;
  source: DirectorySearchHit['source'];
  sourceTitle: string;
  sourceSnippet: string;
  matchedSignals: string[];
  mismatchedSignals: string[];
  listingNap: NapDetails;
  websiteMatch: boolean;
  phoneMatch: boolean;
  addressScore: number;
  nameScore: number;
  confidence: number;
}

export interface DirectoryResult {
  directory: string;
  status: string;
  details: string;
  listingUrl?: string;
  evidence?: DirectoryEvidence;
  error?: string;
}

export interface DirectoryScanResult {
  targetUrl: string;
  checkedAt: string;
  extractedNap: SourceBusinessProfile;
  provider: DirectorySearchSource | 'cascade' | 'mixed';
  warnings: string[];
  results: DirectoryResult[];
}

export interface DirectoryScanOptions {
  provider?: 'auto' | 'serpapi' | 'cascade' | 'duckduckgo' | 'playwright';
  headless?: boolean;
  maxCandidatesPerDirectory?: number;
  concurrency?: number;
}
