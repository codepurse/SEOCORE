import { describe, it, expect } from 'vitest';
import { calculateScore } from './scoring.js';

describe('calculateScore', () => {
  it('returns perfect score for no diffs', () => {
    const { score, summary } = calculateScore([], 1000, 1000);
    expect(score.overall).toBe(100);
    expect(score.indexability).toBe(100);
    expect(score.contentParity).toBe(100);
    expect(score.metadataParity).toBe(100);
    expect(score.structuredDataParity).toBe(100);
    expect(score.crawlability).toBe(100);
    expect(summary.critical).toBe(0);
    expect(summary.high).toBe(0);
    expect(summary.medium).toBe(0);
    expect(summary.low).toBe(0);
  });

  it('drops indexability to 0 on critical canonical', () => {
    const { score } = calculateScore([
      { id: '1', aspect: 'indexability.canonical', severity: 'critical', confidence: 'certain', title: 'Canonical injected', description: '', evidence: [] },
    ], 1000, 1000);
    expect(score.indexability).toBe(0);
    expect(score.overall).toBeLessThan(100);
  });

  it('drops content parity when word counts differ', () => {
    const { score } = calculateScore([], 1000, 500);
    expect(score.contentParity).toBe(50);
  });

  it('drops metadata parity when metadata diffs exist', () => {
    const { score } = calculateScore([
      { id: '1', aspect: 'metadata.title', severity: 'high', confidence: 'certain', title: 'Title changed', description: '', evidence: [] },
      { id: '2', aspect: 'metadata.metaDescription', severity: 'high', confidence: 'certain', title: 'Desc changed', description: '', evidence: [] },
    ], 1000, 1000);
    expect(score.metadataParity).toBe(50);
  });

  it('drops structured data parity when JSON-LD differs', () => {
    const { score } = calculateScore([
      { id: '1', aspect: 'structuredData.jsonLd', severity: 'high', confidence: 'certain', title: 'JSON-LD changed', description: '', evidence: [] },
    ], 1000, 1000);
    expect(score.structuredDataParity).toBe(50);
  });

  it('drops crawlability on resource blocked', () => {
    const { score } = calculateScore([
      { id: '1', aspect: 'resourceBlocked', severity: 'critical', confidence: 'certain', title: 'Blocked', description: '', evidence: [] },
    ], 1000, 1000);
    expect(score.crawlability).toBe(80);
  });

  it('counts summary correctly', () => {
    const { summary } = calculateScore([
      { id: '1', aspect: 'indexability.canonical', severity: 'critical', confidence: 'certain', title: '', description: '', evidence: [] },
      { id: '2', aspect: 'metadata.title', severity: 'high', confidence: 'certain', title: '', description: '', evidence: [] },
      { id: '3', aspect: 'links.internal', severity: 'medium', confidence: 'certain', title: '', description: '', evidence: [] },
      { id: '4', aspect: 'images.alt', severity: 'low', confidence: 'cosmetic', title: '', description: '', evidence: [] },
    ], 1000, 1000);
    expect(summary.critical).toBe(1);
    expect(summary.high).toBe(1);
    expect(summary.medium).toBe(1);
    expect(summary.low).toBe(1);
  });

  it('overall score is weighted average', () => {
    const { score } = calculateScore([
      { id: '1', aspect: 'indexability.canonical', severity: 'critical', confidence: 'certain', title: '', description: '', evidence: [] },
    ], 1000, 1000);
    expect(score.overall).toBe(Math.round(
      0 * 0.35 +
      100 * 0.25 +
      100 * 0.15 +
      100 * 0.10 +
      100 * 0.15
    ));
  });
});
