import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { AuditResult, Finding } from '@seocore/sdk';
import {
  getHistoryDir,
  getSnapshotPath,
  ensureHistoryDir,
  generateSnapshotFilename,
  writeSnapshotAtomically,
  findLatestSnapshot,
  normalizeHost,
} from './path-utils.js';

export interface SnapshotMetadata {
  url: string;
  host: string;
  savedAt: string;
  cliVersion: string;
  tier?: string;
  snapshotPath: string;
  score?: number;
  config?: {
    preset?: string;
    full?: boolean;
    maxPages?: number;
    maxDepth?: number;
    concurrency?: number;
    playwright?: boolean;
    lighthouse?: boolean;
    modules?: Record<string, boolean>;
  };
}

export interface Snapshot {
  metadata: SnapshotMetadata;
  result: AuditResult;
}

export interface SaveSnapshotOptions {
  historyDir?: string;
  cliVersion?: string;
  tier?: string;
  config?: {
    preset?: string;
    full?: boolean;
    maxPages?: number;
    maxDepth?: number;
    concurrency?: number;
    playwright?: boolean;
    lighthouse?: boolean;
    modules?: Record<string, boolean>;
  };
}

export function saveSnapshot(result: AuditResult, options: SaveSnapshotOptions = {}): Snapshot {
  const historyDir = getHistoryDir(options.historyDir || process.env.SEOCORE_HISTORY_DIR);
  const host = normalizeHost(result.url);
  const filename = generateSnapshotFilename(host);
  const hostDir = path.join(historyDir, host);
  
  ensureHistoryDir(hostDir);
  
  const snapshotPath = path.join(hostDir, filename);
  
  const metadata: SnapshotMetadata = {
    url: result.url,
    host,
    savedAt: new Date().toISOString(),
    cliVersion: options.cliVersion || '1.0.0',
    tier: options.tier,
    snapshotPath,
    score: result.score,
    config: options.config,
  };
  
  const snapshot: Snapshot = {
    metadata,
    result,
  };
  
  const content = JSON.stringify(snapshot, null, 2);
  writeSnapshotAtomically(snapshotPath, content);
  
  console.log(pc.green(`✓  Snapshot saved: ${pc.bold(path.relative(process.cwd(), snapshotPath))}`));
  
  return snapshot;
}

export function loadSnapshot(snapshotPath: string): Snapshot {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }
  
  const content = fs.readFileSync(snapshotPath, 'utf8');
  const snapshot = JSON.parse(content) as Snapshot;
  
  return snapshot;
}

export function loadLatestSnapshot(url: string, historyDir?: string): Snapshot | null {
  const dir = getHistoryDir(historyDir || process.env.SEOCORE_HISTORY_DIR);
  const latestPath = findLatestSnapshot(dir, url);
  
  if (!latestPath) {
    return null;
  }
  
  return loadSnapshot(latestPath);
}

export function resolveSnapshotPath(url: string, historyDir?: string): string | null {
  const dir = getHistoryDir(historyDir || process.env.SEOCORE_HISTORY_DIR);
  return findLatestSnapshot(dir, url);
}
