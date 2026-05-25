import type { Finding } from '@seocore/sdk';

export interface AiSubScores {
  extractability: number;
  entityClarity: number;
  citationReadiness: number;
  structuralOrg: number;
  retrievalFriendliness: number;
  authoritySignals: number;
}

export function calculateAiScore(aiFindings: Finding[], pagesAudited: number): { score: number; subScores: AiSubScores } {
  const scale = pagesAudited || 1;

  let extractability = 100;
  let entityClarity = 100;
  let citationReadiness = 100;
  let structuralOrg = 100;
  let retrievalFriendliness = 100;
  let authoritySignals = 100;

  for (const f of aiFindings) {
    if (f.ruleId === 'ai-extractability') {
      if (f.message.includes('semantic content container')) extractability -= 25 / scale;
      if (f.message.includes('boilerplate-to-content')) extractability -= 25 / scale;
      if (f.message.includes('answer-first')) extractability -= 10 / scale;
    } else if (f.ruleId === 'ai-entity-clarity') {
      if (f.message.includes('weakly defined')) entityClarity -= 55 / scale;
      if (f.message.includes('disambiguation')) entityClarity -= 30 / scale;
    } else if (f.ruleId === 'ai-citation-readiness') {
      if (f.message.includes('external citations')) citationReadiness -= 40 / scale;
      if (f.message.includes('structured schema')) citationReadiness -= 30 / scale;
      if (f.message.includes('statistics')) citationReadiness -= 20 / scale;
    } else if (f.ruleId === 'ai-structural-organization') {
      if (f.message.includes('Heading hierarchy')) structuralOrg -= 45 / scale;
      if (f.message.includes('list or table')) structuralOrg -= 20 / scale;
    } else if (f.ruleId === 'ai-retrieval-friendliness') {
      if (f.message.includes('too long')) retrievalFriendliness -= 40 / scale;
      if (f.message.includes('too thin')) retrievalFriendliness -= 50 / scale;
    } else if (f.ruleId === 'ai-authority-signals') {
      if (f.message.includes('author profiles')) authoritySignals -= 45 / scale;
      if (f.message.includes('trust signals')) authoritySignals -= 40 / scale;
    }
  }

  const subScores: AiSubScores = {
    extractability: Math.max(0, Math.min(100, Math.round(extractability))),
    entityClarity: Math.max(0, Math.min(100, Math.round(entityClarity))),
    citationReadiness: Math.max(0, Math.min(100, Math.round(citationReadiness))),
    structuralOrg: Math.max(0, Math.min(100, Math.round(structuralOrg))),
    retrievalFriendliness: Math.max(0, Math.min(100, Math.round(retrievalFriendliness))),
    authoritySignals: Math.max(0, Math.min(100, Math.round(authoritySignals))),
  };

  const score = Math.round(
    (subScores.extractability +
     subScores.entityClarity +
     subScores.citationReadiness +
     subScores.structuralOrg +
     subScores.retrievalFriendliness +
     subScores.authoritySignals) / 6
  );

  return { score, subScores };
}
