/**
 * Generation evaluation metrics (LLM output quality)
 */

type GuardrailChainLike = {
  addGuardrail: (guardrail: unknown) => GuardrailChainLike;
  execute: (input: unknown) => Promise<{
    success: boolean;
    output?: unknown;
  }>;
};

type GuardrailModuleLike = {
  GuardrailChain?: new (...args: unknown[]) => GuardrailChainLike;
  Guardrail?: new (...args: unknown[]) => unknown;
  ChainBuilder?: new (
    ...args: unknown[]
  ) => {
    addCheck?: (...args: unknown[]) => unknown;
    build?: () => GuardrailChainLike;
  };
};

let guardrailModule: GuardrailModuleLike | null = null;
let guardrailLoadAttempted = false;

async function getGuardrailModule(): Promise<GuardrailModuleLike | null> {
  if (guardrailModule) return guardrailModule;
  if (guardrailLoadAttempted) return null;
  guardrailLoadAttempted = true;
  try {
    guardrailModule = (await import('@reaatech/guardrail-chain')) as GuardrailModuleLike;
    return guardrailModule;
  } catch {
    return null;
  }
}

/**
 * Generation evaluation result for a single query
 */
export interface QueryGenerationResult {
  queryId: string;
  relevance: number;
  fluency: number;
  coherence: number;
  faithfulness: number;
  answerCorrectness?: number;
}

/**
 * Aggregate generation metrics
 */
export interface GenerationMetrics {
  avgRelevance: number;
  avgFluency: number;
  avgCoherence: number;
  avgFaithfulness: number;
  avgAnswerCorrectness?: number;
  queryResults: QueryGenerationResult[];
}

/**
 * Calculate relevance score (how well the answer addresses the query)
 * Uses simple keyword overlap as a proxy
 */
export function relevanceScore(query: string, answer: string): number {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const answerWords = answer.toLowerCase().split(/\s+/);

  if (queryWords.length === 0) {
    return 0;
  }

  const answerSet = new Set(answerWords);
  const matches = queryWords.filter((w) => answerSet.has(w));
  return matches.length / queryWords.length;
}

/**
 * Calculate fluency score (grammatical correctness and readability)
 * Simple heuristic based on sentence structure
 */
export function fluencyScore(answer: string): number {
  // Check for basic fluency indicators
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (sentences.length === 0) {
    return 0;
  }

  // Check for proper capitalization
  const capitalizedSentences = sentences.filter((s) => /^[A-Z]/.test(s.trim()));
  const capitalizationScore = capitalizedSentences.length / sentences.length;

  // Check for reasonable sentence length
  const avgSentenceLength = answer.length / sentences.length;
  const lengthScore = avgSentenceLength > 10 && avgSentenceLength < 200 ? 1 : 0.5;

  // Check for proper punctuation
  const hasPunctuation = /[.!?]/.test(answer);

  return (capitalizationScore + lengthScore + (hasPunctuation ? 1 : 0)) / 3;
}

/**
 * Calculate coherence score (logical flow and consistency)
 */
export function coherenceScore(answer: string): number {
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (sentences.length <= 1) {
    return 1;
  }

  const transitionWords = [
    'however',
    'therefore',
    'moreover',
    'furthermore',
    'additionally',
    'consequently',
    'nevertheless',
    'thus',
    'hence',
    'meanwhile',
  ];
  const answerLower = answer.toLowerCase();
  const hasTransitions = transitionWords.some((w) => answerLower.includes(w));

  const pronouns = ['it', 'they', 'he', 'she', 'we', 'you'];
  const pronounCount = sentences.filter((s) => {
    const lower = s.toLowerCase();
    return pronouns.some((p) => lower.includes(p));
  }).length;

  const pronounRatio = pronounCount / sentences.length;

  if (hasTransitions && pronounRatio > 0.2) {
    return 0.95;
  }
  if (hasTransitions || pronounRatio > 0.2) {
    return 0.85;
  }
  if (pronounCount > 0) {
    return 0.7;
  }
  return 0.5;
}

/**
 * Calculate faithfulness score (how well the answer is grounded in the source)
 */
export function faithfulnessScore(answer: string, sourceChunks: string[]): number {
  if (sourceChunks.length === 0) {
    return 0;
  }

  const answerWords = answer
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  // Check word overlap with source chunks
  const maxOverlap = sourceChunks.map((chunk) => {
    const chunkWords = chunk
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (chunkWords.length === 0) {
      return 0;
    }

    const chunkSet = new Set(chunkWords);
    const matches = answerWords.filter((w) => chunkSet.has(w));
    return matches.length / answerWords.length;
  });

  return Math.max(...maxOverlap, 0);
}

/**
 * Calculate answer correctness (comparison with ground truth)
 */
export function answerCorrectnessScore(answer: string, groundTruth: string): number {
  const answerWords = new Set(
    answer
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  const truthWords = new Set(
    groundTruth
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

  if (truthWords.size === 0) {
    return 0;
  }

  const intersection = [...truthWords].filter((w) => answerWords.has(w));
  return intersection.length / truthWords.size;
}

/**
 * Evaluate a single query's generation with deterministic local metrics.
 */
export function evaluateGeneration(
  queryId: string,
  query: string,
  answer: string,
  sourceChunks: string[],
  groundTruth?: string,
): QueryGenerationResult {
  const result: QueryGenerationResult = {
    queryId,
    relevance: relevanceScore(query, answer),
    fluency: fluencyScore(answer),
    coherence: coherenceScore(answer),
    faithfulness: faithfulnessScore(answer, sourceChunks),
  };

  if (groundTruth) {
    result.answerCorrectness = answerCorrectnessScore(answer, groundTruth);
  }

  return result;
}

/**
 * Evaluate generation through @reaatech/guardrail-chain when available.
 * Falls back to the synchronous local metrics when the optional package cannot run.
 */
export async function evaluateGenerationWithGuardrails(
  queryId: string,
  query: string,
  answer: string,
  sourceChunks: string[],
  groundTruth?: string,
): Promise<QueryGenerationResult> {
  const fallback = evaluateGeneration(queryId, query, answer, sourceChunks, groundTruth);
  const mod = await getGuardrailModule();
  if (!mod?.GuardrailChain) {
    return fallback;
  }

  try {
    const metricGuardrail = {
      id: 'generation-quality-metrics',
      name: 'Generation Quality Metrics',
      type: 'output' as const,
      enabled: true,
      shortCircuitOnFail: false,
      execute: async () => ({
        passed: true,
        output: fallback,
        confidence: Math.min(
          fallback.relevance,
          fallback.fluency,
          fallback.coherence,
          fallback.faithfulness,
        ),
        metadata: { duration: 0 },
      }),
    };
    const chain = new mod.GuardrailChain({
      budget: { maxLatencyMs: 1_000, maxTokens: 4_000 },
      errorHandling: { failOpen: true },
    }).addGuardrail(metricGuardrail);
    const result = await chain.execute({
      queryId,
      query,
      answer,
      sourceChunks,
      groundTruth,
    });
    const output = (result.output ?? fallback) as Partial<QueryGenerationResult>;

    return {
      queryId,
      relevance: typeof output.relevance === 'number' ? output.relevance : fallback.relevance,
      fluency: typeof output.fluency === 'number' ? output.fluency : fallback.fluency,
      coherence: typeof output.coherence === 'number' ? output.coherence : fallback.coherence,
      faithfulness:
        typeof output.faithfulness === 'number' ? output.faithfulness : fallback.faithfulness,
      answerCorrectness:
        typeof output.answerCorrectness === 'number'
          ? output.answerCorrectness
          : fallback.answerCorrectness,
    };
  } catch {
    return fallback;
  }
}

/**
 * Aggregate generation metrics across queries
 */
export function aggregateGenerationMetrics(
  queryResults: QueryGenerationResult[],
): GenerationMetrics {
  const n = queryResults.length;
  if (n === 0) {
    return {
      avgRelevance: 0,
      avgFluency: 0,
      avgCoherence: 0,
      avgFaithfulness: 0,
      queryResults,
    };
  }

  const metrics: GenerationMetrics = {
    avgRelevance: queryResults.reduce((sum, r) => sum + r.relevance, 0) / n,
    avgFluency: queryResults.reduce((sum, r) => sum + r.fluency, 0) / n,
    avgCoherence: queryResults.reduce((sum, r) => sum + r.coherence, 0) / n,
    avgFaithfulness: queryResults.reduce((sum, r) => sum + r.faithfulness, 0) / n,
    queryResults,
  };

  // Only include answer correctness if all results have it
  if (queryResults.every((r) => r.answerCorrectness !== undefined)) {
    metrics.avgAnswerCorrectness =
      queryResults.reduce((sum, r) => sum + (r.answerCorrectness || 0), 0) / n;
  }

  return metrics;
}
