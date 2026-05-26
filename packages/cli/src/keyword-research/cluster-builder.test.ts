import { describe, expect, it } from 'vitest';
import { clusterKeywords } from './cluster-builder.js';
import { scoreKeyword } from './scorer.js';
import type { KeywordNoiseAssessment } from './types.js';

const lowNoise: KeywordNoiseAssessment = {
  score: 0,
  allowlisted: false,
  hardFiltered: false,
  reasons: [],
};

function makeKeyword(keyword: string, seedKeyword: string) {
  return scoreKeyword({
    keyword,
    seedKeyword,
    sourceType: 'semantic',
    index: 0,
    noiseAssessment: lowNoise,
  });
}

describe('cluster builder', () => {
  it('groups same-topic phrases into semantic clusters and keeps fallback small', () => {
    const seedKeyword = 'behavioral health';
    const keywords = [
      makeKeyword('behavioral health services', seedKeyword),
      makeKeyword('behavioral health service providers', seedKeyword),
      makeKeyword('behavioral health treatment centers', seedKeyword),
      makeKeyword('behavioral health treatment clinic', seedKeyword),
      makeKeyword('behavioral health clinics', seedKeyword),
      makeKeyword('behavioral health clinic near me', seedKeyword),
      makeKeyword('behavioral health career salary', seedKeyword),
    ];

    const clusters = clusterKeywords(keywords, seedKeyword);
    const clusterNames = clusters.map(cluster => cluster.name);
    const generalCluster = clusters.find(cluster => cluster.name === 'General extensions');

    expect(clusterNames).toContain('Services');
    expect(clusterNames).toContain('Treatment');
    expect(clusterNames).toContain('Clinics');
    expect(clusterNames).toContain('Local care');
    expect(clusterNames).toContain('Careers');
    expect(generalCluster?.keywords.length ?? 0).toBeLessThanOrEqual(1);
  });
});
