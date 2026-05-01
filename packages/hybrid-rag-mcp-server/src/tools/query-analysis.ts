/**
 * MCP Query Analysis Tools
 *
 * Tools for query intent analysis, decomposition, and classification
 * to optimize retrieval strategy selection.
 */

import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import type { RAGTool } from '../types.js';

/**
 * Query intent categories
 */
export type QueryIntent =
  | 'factual'
  | 'procedural'
  | 'comparative'
  | 'exploratory'
  | 'troubleshooting'
  | 'definitional';

/**
 * Intent classification keywords and patterns
 */
const INTENT_PATTERNS: Record<QueryIntent, RegExp[]> = {
  factual: [
    /\b(what|who|when|where|how many|how much)\b/i,
    /\b(is|are|does|do|did|was|were)\b.*\?/i,
  ],
  procedural: [
    /\b(how to|how do i|how can i|steps? to|guide|tutorial)\b/i,
    /\b(install|setup|configure|create|build|make|implement)\b/i,
  ],
  comparative: [
    /\b(vs|versus|compare|difference|better|best|which)\b/i,
    /\b(more.*than|less.*than|compared to)\b/i,
  ],
  exploratory: [
    /\b(tell me about|explain|overview|introduction to|learn about)\b/i,
    /\b(what do you know about|information about)\b/i,
  ],
  troubleshooting: [
    /\b(error|bug|issue|problem|not working|failed|broken)\b/i,
    /\b(fix|resolve|debug|solve|help with)\b/i,
  ],
  definitional: [
    /\b(what is|what are|define|definition|meaning of)\b/i,
    /\b(explain the term|what does.*mean)\b/i,
  ],
};

/**
 * Recommended retrieval strategies per intent
 */
const INTENT_STRATEGIES: Record<
  QueryIntent,
  { vectorWeight: number; bm25Weight: number; useReranker: boolean; topK: number }
> = {
  factual: { vectorWeight: 0.8, bm25Weight: 0.2, useReranker: true, topK: 5 },
  procedural: { vectorWeight: 0.5, bm25Weight: 0.5, useReranker: true, topK: 10 },
  comparative: { vectorWeight: 0.6, bm25Weight: 0.4, useReranker: true, topK: 15 },
  exploratory: { vectorWeight: 0.4, bm25Weight: 0.6, useReranker: false, topK: 20 },
  troubleshooting: { vectorWeight: 0.7, bm25Weight: 0.3, useReranker: true, topK: 10 },
  definitional: { vectorWeight: 0.9, bm25Weight: 0.1, useReranker: false, topK: 3 },
};

/**
 * Classify query intent based on patterns
 */
function classifyIntent(query: string, candidates?: QueryIntent[]): QueryIntent {
  const candidateIntents = candidates || (Object.keys(INTENT_PATTERNS) as QueryIntent[]);

  let bestIntent: QueryIntent = 'factual';
  let bestScore = 0;

  for (const intent of candidateIntents) {
    const patterns = INTENT_PATTERNS[intent];
    let score = 0;

    for (const pattern of patterns) {
      if (pattern.test(query)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestIntent;
}

/**
 * Decompose a complex query into sub-queries
 */
function decomposeQuery(query: string): {
  subQueries: string[];
  strategy: 'parallel' | 'sequential';
  aggregation: 'concatenate' | 'merge' | 'vote';
} {
  // Simple decomposition based on conjunctions
  const conjunctions = [' and ', ' or ', ' but ', '; '];
  let parts = [query];

  for (const conjunction of conjunctions) {
    if (query.toLowerCase().includes(conjunction)) {
      parts = query
        .split(new RegExp(conjunction, 'i'))
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      break;
    }
  }

  // If query has multiple question words, it's likely multi-part
  const questionWords = query.match(/\b(what|how|when|where|who|why|which)\b/gi);
  if (questionWords && questionWords.length > 1 && parts.length === 1) {
    // Try to split by question words
    const splitPattern = /\b(what|how|when|where|who|why|which)\b/gi;
    const splits = query.split(splitPattern);
    if (splits.length > 2) {
      parts = [];
      for (let i = 0; i < splits.length - 1; i += 2) {
        if (i + 1 < splits.length) {
          parts.push(`${splits[i]}${splits[i + 1]}`.trim());
        }
      }
    }
  }

  return {
    subQueries: parts.length > 1 ? parts : [query],
    strategy: 'parallel',
    aggregation: parts.length > 1 ? 'concatenate' : 'merge',
  };
}

/**
 * rag.analyze_query - Analyze query intent and provide recommendations
 */
export const ragAnalyzeQuery: RAGTool = {
  name: 'rag.analyze_query',
  description: 'Analyze query intent and provide routing recommendations for optimal retrieval',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query to analyze',
      },
      context: {
        type: 'object',
        description: 'Optional context about the user or conversation',
        properties: {
          user_tier: { type: 'string', description: 'User tier (e.g., enterprise, free)' },
          previous_queries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Previous queries in the conversation',
          },
        },
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const query = args.query as string;
    const context = args.context as Record<string, unknown> | undefined;

    const intent = classifyIntent(query);
    const strategy = INTENT_STRATEGIES[intent];
    const decomposition = decomposeQuery(query);

    // Calculate confidence based on pattern matching
    const confidence = intent === 'factual' ? 0.6 : 0.8; // Simple confidence heuristic

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              intent,
              confidence,
              isComplex: decomposition.subQueries.length > 1,
              recommended_config: {
                vectorWeight: strategy.vectorWeight,
                bm25Weight: strategy.bm25Weight,
                useReranker: strategy.useReranker,
                topK: strategy.topK,
              },
              sub_queries:
                decomposition.subQueries.length > 1 ? decomposition.subQueries : undefined,
              context_used: context ? Object.keys(context) : [],
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * rag.decompose_query - Decompose complex queries into sub-queries
 */
export const ragDecomposeQuery: RAGTool = {
  name: 'rag.decompose_query',
  description: 'Break down complex queries into simpler sub-queries for multi-step retrieval',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The complex query to decompose',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum decomposition depth',
        default: 3,
      },
      minSubQueryConfidence: {
        type: 'number',
        description: 'Minimum confidence threshold for sub-queries (0-1)',
        default: 0.7,
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const query = args.query as string;
    const _maxDepth = (args.maxDepth as number) ?? 3;
    const minConfidence = (args.minSubQueryConfidence as number) ?? 0.7;

    const decomposition = decomposeQuery(query);

    // Analyze each sub-query for confidence
    const subQueriesWithConfidence = decomposition.subQueries.map((sq) => {
      const intent = classifyIntent(sq);
      // Simple confidence based on query length and intent clarity
      const confidence = sq.length > 10 ? 0.9 : 0.6;
      return { query: sq, intent, confidence };
    });

    // Filter by confidence threshold
    const confidentQueries = subQueriesWithConfidence.filter(
      (sq) => sq.confidence >= minConfidence,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              original_query: query,
              sub_queries: confidentQueries.map((sq) => ({
                query: sq.query,
                intent: sq.intent,
                confidence: sq.confidence,
              })),
              strategy: decomposition.strategy,
              aggregation: decomposition.aggregation,
              total_sub_queries: confidentQueries.length,
              filtered_count: subQueriesWithConfidence.length - confidentQueries.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * rag.classify_intent - Classify query intent with optional candidate filtering
 */
export const ragClassifyIntent: RAGTool = {
  name: 'rag.classify_intent',
  description: 'Classify query intent for optimal retrieval strategy selection',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query to classify',
      },
      candidates: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'factual',
            'procedural',
            'comparative',
            'exploratory',
            'troubleshooting',
            'definitional',
          ],
        },
        description: 'Optional list of candidate intents to choose from',
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const query = args.query as string;
    const candidates = args.candidates as QueryIntent[] | undefined;

    const intent = classifyIntent(query, candidates);
    const strategy = INTENT_STRATEGIES[intent];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              intent,
              description: getIntentDescription(intent),
              recommended_strategy: {
                vectorWeight: strategy.vectorWeight,
                bm25Weight: strategy.bm25Weight,
                useReranker: strategy.useReranker,
                topK: strategy.topK,
              },
              all_intents: candidates || Object.keys(INTENT_PATTERNS),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * Get description for an intent type
 */
function getIntentDescription(intent: QueryIntent): string {
  const descriptions: Record<QueryIntent, string> = {
    factual: 'Specific fact-seeking questions requiring precise answers',
    procedural: 'How-to and step-by-step questions requiring instructional content',
    comparative: 'Comparison questions requiring analysis of multiple items',
    exploratory: 'Broad topic exploration requiring diverse result sets',
    troubleshooting: 'Problem-solving queries requiring recent/updated content',
    definitional: 'Definition/terminology questions requiring precise matching',
  };
  return descriptions[intent] || 'Unknown intent';
}

export const queryAnalysisTools: RAGTool[] = [
  ragAnalyzeQuery,
  ragDecomposeQuery,
  ragClassifyIntent,
];
