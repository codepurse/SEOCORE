import { WeightRule } from './weight.js';
import { FormatRule } from './format.js';
import { DeliveryRule } from './delivery.js';
import { LoadingRule } from './loading.js';
import { ClsRule } from './cls.js';
import { LcpRule } from './lcp.js';
import { ResponsiveRule } from './responsive.js';
import { CachingRule } from './caching.js';
import { AltRule } from './alt.js';
import { BrokenRule } from './broken.js';
import { ImageRule } from '../types.js';

export const allImageRules: ImageRule[] = [
  WeightRule,
  FormatRule,
  DeliveryRule,
  LoadingRule,
  ClsRule,
  LcpRule,
  ResponsiveRule,
  CachingRule,
  AltRule,
  BrokenRule,
];
