import * as fs from 'node:fs';
import { normalizeGscData, normalizeCruxData } from './normalizers.js';
import type { NormalizedGscPageMetrics, NormalizedCruxPageMetrics } from './types.js';

export interface ProviderLoadResult<T> {
  data: T[];
  warningCount: number;
  error?: string;
}

export function loadGscFile(filePath: string): ProviderLoadResult<NormalizedGscPageMetrics> {
  try {
    if (!fs.existsSync(filePath)) {
      return { data: [], warningCount: 0, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const raw = JSON.parse(content);
    const normalized = normalizeGscData(raw);
    return {
      data: normalized.data,
      warningCount: normalized.warningCount,
    };
  } catch (err: any) {
    return {
      data: [],
      warningCount: 0,
      error: err.message,
    };
  }
}

export function loadCruxFile(filePath: string): ProviderLoadResult<NormalizedCruxPageMetrics> {
  try {
    if (!fs.existsSync(filePath)) {
      return { data: [], warningCount: 0, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const raw = JSON.parse(content);
    const normalized = normalizeCruxData(raw);
    return {
      data: normalized.data,
      warningCount: normalized.warningCount,
    };
  } catch (err: any) {
    return {
      data: [],
      warningCount: 0,
      error: err.message,
    };
  }
}
