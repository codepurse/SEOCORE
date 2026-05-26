import pc from 'picocolors';
import { ExecutionTier, TIER_PRESETS } from '@seocore/sdk';

export function validateUrl(url: string, label = 'URL'): void {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.error(pc.red(`Error: ${label} must start with http:// or https://`));
    process.exit(1);
  }
  try {
    new URL(url);
  } catch {
    console.error(pc.red(`Error: Invalid ${label}: ${url}`));
    process.exit(1);
  }
}

export function validateTier(tier: string | undefined): ExecutionTier | undefined {
  if (!tier) return undefined;
  const validTiers = Object.keys(TIER_PRESETS) as ExecutionTier[];
  if (!validTiers.includes(tier as ExecutionTier)) {
    console.error(pc.red(`Error: Invalid tier "${tier}". Must be one of: ${validTiers.join(', ')}`));
    process.exit(1);
  }
  return tier as ExecutionTier;
}

export function validateOutputFormat(fmt: string): string {
  const validFormats = ['terminal', 'json', 'html', 'sarif', 'both', 'all'];
  if (!validFormats.includes(fmt)) {
    console.error(pc.red(`Error: Invalid format "${fmt}". Must be one of: ${validFormats.join(', ')}`));
    process.exit(1);
  }
  return fmt;
}
