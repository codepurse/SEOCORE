import { assignTopicCandidate, buildTopicCounts, canonicalizeTopicKey } from './topic-extractor.js';
import type { ClusterKind, ClusterLabelSource, ScoredKeyword, SearchIntent, TopicCluster } from './types.js';

function round(value: number): number {
  return Math.round(value);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildIntentCounts(keywords: ScoredKeyword[]): Record<SearchIntent, number> {
  return {
    informational: keywords.filter(keyword => keyword.intent === 'informational').length,
    commercial: keywords.filter(keyword => keyword.intent === 'commercial').length,
    transactional: keywords.filter(keyword => keyword.intent === 'transactional').length,
    local: keywords.filter(keyword => keyword.intent === 'local').length,
    'jobs-career': keywords.filter(keyword => keyword.intent === 'jobs-career').length,
  };
}

function primaryIntentFromKeywords(keywords: ScoredKeyword[]): SearchIntent {
  const counts = buildIntentCounts(keywords);
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0] as SearchIntent;
}

function labelTokens(name: string): Set<string> {
  return new Set(name.toLowerCase().split(/\s+/).filter(Boolean));
}

function measureCohesion(clusterName: string, keywords: ScoredKeyword[]): number {
  const tokens = labelTokens(clusterName);
  if (tokens.size === 0 || keywords.length === 0) return 0;

  const matches = keywords.map(keyword => {
    const keywordTokens = new Set(keyword.keyword.toLowerCase().split(/\s+/));
    const overlap = Array.from(tokens).filter(token => keywordTokens.has(token)).length;
    return overlap / tokens.size;
  });

  return round(average(matches) * 100);
}

function measureIntentConsistency(keywords: ScoredKeyword[]): number {
  if (keywords.length === 0) return 0;
  const counts = Object.values(buildIntentCounts(keywords));
  return round((Math.max(...counts) / keywords.length) * 100);
}

function measureSemanticTightness(keywords: ScoredKeyword[], seedKeyword: string): number {
  if (keywords.length === 0) return 0;

  const seedTokens = new Set(seedKeyword.toLowerCase().split(/\s+/));
  const tokenCounts = new Map<string, number>();

  for (const keyword of keywords) {
    const uniqueTokens = new Set(keyword.keyword.toLowerCase().split(/\s+/).filter(token => !seedTokens.has(token)));
    for (const token of uniqueTokens) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
  }

  const recurringTokens = Array.from(tokenCounts.values()).filter(count => count >= 2);
  if (recurringTokens.length === 0) return 0;

  return round((average(recurringTokens) / keywords.length) * 100);
}

function clusterKindFromMetrics(
  labelSource: ClusterLabelSource,
  keywords: ScoredKeyword[],
  qualityScore: number,
): ClusterKind {
  if (labelSource === 'fallback') return 'fallback';
  if (labelSource === 'intent') return 'intent';
  if (keywords.length >= 3 && qualityScore >= 70) return 'pillar';
  return 'supporting';
}

function buildCluster(
  key: string,
  name: string,
  keywords: ScoredKeyword[],
  seedKeyword: string,
  labelSource: ClusterLabelSource,
): TopicCluster | null {
  if (keywords.length === 0) return null;

  const sortedKeywords = [...keywords].sort((left, right) => right.score - left.score);
  const averageScore = round(average(sortedKeywords.map(keyword => keyword.score)));
  const cohesion = measureCohesion(name, sortedKeywords);
  const intentConsistency = measureIntentConsistency(sortedKeywords);
  const semanticTightness = measureSemanticTightness(sortedKeywords, seedKeyword);
  const qualityScore = round(average([averageScore, cohesion, intentConsistency, semanticTightness]));

  return {
    key,
    name,
    keywords: sortedKeywords,
    primaryIntent: primaryIntentFromKeywords(sortedKeywords),
    averageScore,
    qualityScore,
    cohesion,
    intentConsistency,
    semanticTightness,
    kind: clusterKindFromMetrics(labelSource, sortedKeywords, qualityScore),
    labelSource,
  };
}

function clusterSortWeight(cluster: TopicCluster): number {
  const kindWeight =
    cluster.kind === 'pillar' ? 40 : cluster.kind === 'supporting' ? 20 : cluster.kind === 'intent' ? 10 : -30;
  const sizeWeight = Math.min(cluster.keywords.length * 5, 30);
  return kindWeight + sizeWeight + cluster.qualityScore + cluster.averageScore;
}

export function clusterKeywords(keywords: ScoredKeyword[], seedKeyword: string): TopicCluster[] {
  const topicCounts = buildTopicCounts(keywords, seedKeyword);
  const clusterMap = new Map<string, { name: string; labelSource: ClusterLabelSource; keywords: ScoredKeyword[] }>();

  const localKeywords = keywords.filter(keyword => keyword.intent === 'local');
  const careerKeywords = keywords.filter(keyword => keyword.intent === 'jobs-career');
  const remainingKeywords = keywords.filter(keyword => keyword.intent !== 'local' && keyword.intent !== 'jobs-career');

  for (const keyword of remainingKeywords) {
    const topicCandidate = assignTopicCandidate(keyword, seedKeyword, topicCounts);
    const clusterKey = topicCandidate ? canonicalizeTopicKey(topicCandidate.key) : 'general-extensions';
    const clusterName = topicCandidate ? topicCandidate.label : 'General extensions';
    const labelSource = topicCandidate ? topicCandidate.labelSource : ('fallback' as const);
    const existing = clusterMap.get(clusterKey);

    keyword.clusterKey = clusterKey;
    keyword.clusterLabel = clusterName;

    if (existing) {
      existing.keywords.push(keyword);
      continue;
    }

    clusterMap.set(clusterKey, {
      name: clusterName,
      labelSource,
      keywords: [keyword],
    });
  }

  const clusters = Array.from(clusterMap.entries())
    .map(([key, value]) => buildCluster(key, value.name, value.keywords, seedKeyword, value.labelSource))
    .filter((cluster): cluster is TopicCluster => cluster !== null);

  const localCluster = buildCluster('local-care', 'Local care', localKeywords, seedKeyword, 'intent');
  const careersCluster = buildCluster('careers', 'Careers', careerKeywords, seedKeyword, 'intent');

  if (localCluster) clusters.push(localCluster);
  if (careersCluster) clusters.push(careersCluster);

  return clusters.sort((left, right) => clusterSortWeight(right) - clusterSortWeight(left));
}
