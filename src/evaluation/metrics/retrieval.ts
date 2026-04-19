/**
 * Retrieval evaluation metrics
 */

/**
 * Evaluation result for a single query
 */
export interface QueryEvaluationResult {
  queryId: string;
  precision: number;
  recall: number;
  ndcg: number;
  averagePrecision: number;
  reciprocalRank: number;
}

/**
 * Aggregate evaluation metrics
 */
export interface RetrievalMetrics {
  precisionAtK: number;
  recallAtK: number;
  ndcgAtK: number;
  map: number; // Mean Average Precision
  mrr: number; // Mean Reciprocal Rank
  queryResults: QueryEvaluationResult[];
}

/**
 * Calculate Precision@K
 */
export function precisionAtK(retrieved: string[], relevant: string[], k: number): number {
  const topK = retrieved.slice(0, k);
  const relevantInTopK = topK.filter(id => relevant.includes(id)).length;
  return topK.length > 0 ? relevantInTopK / topK.length : 0;
}

/**
 * Calculate Recall@K
 */
export function recallAtK(retrieved: string[], relevant: string[], k: number): number {
  const topK = retrieved.slice(0, k);
  const relevantInTopK = topK.filter(id => relevant.includes(id)).length;
  return relevant.length > 0 ? relevantInTopK / relevant.length : 0;
}

/**
 * Calculate DCG@K (Discounted Cumulative Gain)
 */
export function dcgAtK(retrieved: string[], relevant: string[], k: number): number {
  const topK = retrieved.slice(0, k);
  let dcg = 0;

  for (let i = 0; i < topK.length; i++) {
    const rel = relevant.includes(topK[i]!) ? 1 : 0;
    dcg += rel / Math.log2(i + 2); // i+2 because log(1) = 0
  }

  return dcg;
}

/**
 * Calculate IDCG@K (Ideal DCG)
 */
export function idcgAtK(relevant: string[], k: number): number {
  const idealRelevant = Math.min(relevant.length, k);
  let idcg = 0;

  for (let i = 0; i < idealRelevant; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg;
}

/**
 * Calculate NDCG@K (Normalized DCG)
 */
export function ndcgAtK(retrieved: string[], relevant: string[], k: number): number {
  const dcg = dcgAtK(retrieved, relevant, k);
  const idcg = idcgAtK(relevant, k);
  return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Calculate Average Precision (AP)
 */
export function averagePrecision(retrieved: string[], relevant: string[], k: number): number {
  const topK = retrieved.slice(0, k);
  let ap = 0;
  let relevantSeen = 0;

  for (let i = 0; i < topK.length; i++) {
    if (relevant.includes(topK[i]!)) {
      relevantSeen++;
      ap += relevantSeen / (i + 1);
    }
  }

  return relevant.length > 0 ? ap / relevant.length : 0;
}

/**
 * Calculate Reciprocal Rank (RR)
 */
export function reciprocalRank(retrieved: string[], relevant: string[]): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.includes(retrieved[i]!)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Evaluate a single query
 */
export function evaluateQuery(
  queryId: string,
  retrieved: string[],
  relevant: string[],
  k: number = 10,
): QueryEvaluationResult {
  return {
    queryId,
    precision: precisionAtK(retrieved, relevant, k),
    recall: recallAtK(retrieved, relevant, k),
    ndcg: ndcgAtK(retrieved, relevant, k),
    averagePrecision: averagePrecision(retrieved, relevant, k),
    reciprocalRank: reciprocalRank(retrieved, relevant),
  };
}

/**
 * Aggregate metrics across queries
 */
export function aggregateMetrics(queryResults: QueryEvaluationResult[]): RetrievalMetrics {
  const n = queryResults.length;
  if (n === 0) {
    return {
      precisionAtK: 0,
      recallAtK: 0,
      ndcgAtK: 0,
      map: 0,
      mrr: 0,
      queryResults,
    };
  }

  return {
    precisionAtK: queryResults.reduce((sum, r) => sum + r.precision, 0) / n,
    recallAtK: queryResults.reduce((sum, r) => sum + r.recall, 0) / n,
    ndcgAtK: queryResults.reduce((sum, r) => sum + r.ndcg, 0) / n,
    map: queryResults.reduce((sum, r) => sum + r.averagePrecision, 0) / n,
    mrr: queryResults.reduce((sum, r) => sum + r.reciprocalRank, 0) / n,
    queryResults,
  };
}
