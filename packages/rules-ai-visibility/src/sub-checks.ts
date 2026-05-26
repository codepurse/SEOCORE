export const AI_VISIBILITY_SUB_CHECKS = {
  extractability: {
    noSemanticContainers: 'no-semantic-containers',
    highBoilerplateRatio: 'high-boilerplate-ratio',
    noAnswerFirst: 'no-answer-first',
  },
  entityClarity: {
    weakEntity: 'weak-entity',
    missingDisambiguation: 'missing-disambiguation',
  },
  citationReadiness: {
    noExternalCitations: 'no-external-citations',
    missingFaqSchema: 'missing-faq-schema',
    noStatistics: 'no-statistics',
  },
  structuralOrganization: {
    brokenHierarchy: 'broken-hierarchy',
    noListsOrTables: 'no-lists-or-tables',
  },
  retrievalFriendliness: {
    paragraphsTooLong: 'paragraphs-too-long',
    thinContent: 'thin-content',
  },
  authoritySignals: {
    missingAuthorship: 'missing-authorship',
    missingTrustSignals: 'missing-trust-signals',
  },
} as const;
