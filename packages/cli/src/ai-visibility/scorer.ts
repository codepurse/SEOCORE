import { CheckResult } from './types.js';

export interface ScoreReport {
  score: number;
  grade: string;
}

export function score(results: CheckResult[]): ScoreReport {
  if (results.length === 0) {
    return { score: 0, grade: 'F' };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let allPerfect = true;

  for (const r of results) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
    if (r.score < 100) {
      allPerfect = false;
    }
  }

  if (totalWeight === 0) {
    return { score: 0, grade: 'F' };
  }

  let finalScore = Math.round(weightedSum / totalWeight);

  // Strict enforcement: Never return 100 unless literally every checker scored 100
  if (finalScore === 100 && !allPerfect) {
    finalScore = 99;
  }

  let grade = 'F';
  if (finalScore >= 90) {
    grade = 'A';
  } else if (finalScore >= 75) {
    grade = 'B';
  } else if (finalScore >= 60) {
    grade = 'C';
  } else if (finalScore >= 40) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  return {
    score: finalScore,
    grade,
  };
}
