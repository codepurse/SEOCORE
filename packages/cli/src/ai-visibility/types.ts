import { FetchedSite } from './fetcher.js';

export interface CheckResult {
  dimension: string;       // human label
  score: number;           // 0–100 for THIS dimension only
  maxScore: number;        // always 100
  weight: number;          // contribution to final score
  issues: string[];        // what is missing or wrong
  wins: string[];          // what is present and good
}

export type CheckFunction = (site: FetchedSite) => CheckResult;
