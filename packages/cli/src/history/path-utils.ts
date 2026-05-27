import * as path from 'node:path';
import * as fs from 'node:fs';
import { URL } from 'node:url';

export function normalizeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    const cleaned = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    return cleaned;
  }
}

export function generateSnapshotFilename(host: string): string {
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `${iso}Z.json`;
}

export function getHistoryDir(envOverride?: string): string {
  if (envOverride) {
    return path.resolve(envOverride);
  }
  const cwd = process.cwd();
  return path.join(cwd, '.seocore', 'history');
}

export function getSnapshotPath(historyDir: string, url: string): string {
  const host = normalizeHost(url);
  return path.join(historyDir, host);
}

export function ensureHistoryDir(historyDir: string): void {
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
}

export function findLatestSnapshot(historyDir: string, url: string): string | null {
  const host = normalizeHost(url);
  const hostDir = path.join(historyDir, host);
  
  if (!fs.existsSync(hostDir)) {
    return null;
  }
  
  const files = fs.readdirSync(hostDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    return null;
  }
  
  return path.join(hostDir, files[0]);
}

export function writeSnapshotAtomically(snapshotPath: string, content: string): void {
  const dir = path.dirname(snapshotPath);
  ensureHistoryDir(dir);
  
  const tempPath = `${snapshotPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  
  if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath);
  }
  fs.renameSync(tempPath, snapshotPath);
}
