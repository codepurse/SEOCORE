import type { Finding } from '@seocore/sdk';
import { AI_VISIBILITY_SUB_CHECKS } from '@seocore/rules-ai-visibility';

export interface AiSubScores {
  extractability: number;
  entityClarity: number;
  citationReadiness: number;
  structuralOrg: number;
  retrievalFriendliness: number;
  authoritySignals: number;
}

function matchesAiSignal(finding: Finding, ...signals: string[]): boolean {
  const subCheck = finding.subCheck ?? '';
  return signals.some((signal) => subCheck === signal || finding.message.includes(signal));
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
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.extractability.noSemanticContainers, 'semantic content container')) extractability -= 25 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.extractability.highBoilerplateRatio, 'boilerplate-to-content')) extractability -= 25 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.extractability.noAnswerFirst, 'answer-first')) extractability -= 10 / scale;
    } else if (f.ruleId === 'ai-entity-clarity') {
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.entityClarity.weakEntity, 'weakly defined')) entityClarity -= 55 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.entityClarity.missingDisambiguation, 'disambiguation')) entityClarity -= 30 / scale;
    } else if (f.ruleId === 'ai-citation-readiness') {
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.citationReadiness.noExternalCitations, 'external citations')) citationReadiness -= 40 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.citationReadiness.missingFaqSchema, 'structured schema')) citationReadiness -= 30 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.citationReadiness.noStatistics, 'statistics')) citationReadiness -= 20 / scale;
    } else if (f.ruleId === 'ai-structural-organization') {
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.structuralOrganization.brokenHierarchy, 'Heading hierarchy')) structuralOrg -= 45 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.structuralOrganization.noListsOrTables, 'list or table')) structuralOrg -= 20 / scale;
    } else if (f.ruleId === 'ai-retrieval-friendliness') {
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.retrievalFriendliness.paragraphsTooLong, 'too long')) retrievalFriendliness -= 40 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.retrievalFriendliness.thinContent, 'too thin')) retrievalFriendliness -= 50 / scale;
    } else if (f.ruleId === 'ai-authority-signals') {
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.authoritySignals.missingAuthorship, 'author profiles')) authoritySignals -= 45 / scale;
      if (matchesAiSignal(f, AI_VISIBILITY_SUB_CHECKS.authoritySignals.missingTrustSignals, 'trust signals')) authoritySignals -= 40 / scale;
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
