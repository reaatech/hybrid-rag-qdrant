/**
 * Zod schemas for validation
 */

import { z } from 'zod';

// ============================================================================
// Document Schemas
// ============================================================================

/**
 * Schema for Document validation
 */
export const DocumentSchema = z.object({
  id: z.string().min(1, 'Document ID is required'),
  content: z.string().min(1, 'Document content is required'),
  source: z.string().url().or(z.string().startsWith('/')),
  title: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  contentHash: z.string().optional(),
  fileSize: z.number().positive().optional(),
  contentType: z.string().optional(),
});

export type DocumentInput = z.infer<typeof DocumentSchema>;

// ============================================================================
// Chunk Schemas
// ============================================================================

/**
 * Schema for Chunk validation
 */
export const ChunkSchema = z.object({
  id: z.string().min(1, 'Chunk ID is required'),
  documentId: z.string().min(1, 'Document ID is required'),
  index: z.number().int().nonnegative(),
  content: z.string().min(1, 'Chunk content is required'),
  embedding: z.array(z.number()).optional(),
  tokenCount: z.number().int().positive(),
  characterCount: z.number().int().positive(),
  startPosition: z.number().int().nonnegative(),
  endPosition: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  strategy: z.enum(['fixed-size', 'semantic', 'recursive', 'sliding-window']),
});

export type ChunkInput = z.infer<typeof ChunkSchema>;

/**
 * Schema for ChunkingConfig validation
 */
export const ChunkingConfigSchema = z.object({
  strategy: z.enum(['fixed-size', 'semantic', 'recursive', 'sliding-window']),
  chunkSize: z.number().int().positive().default(512),
  overlap: z.number().int().nonnegative().default(50),
  seed: z.number().int().optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  separators: z.array(z.string()).optional(),
  windowSize: z.number().int().positive().optional(),
  stride: z.number().int().positive().optional(),
});

export type ChunkingConfigInput = z.infer<typeof ChunkingConfigSchema>;

// ============================================================================
// Evaluation Schemas
// ============================================================================

/**
 * Schema for EvaluationSample validation
 */
export const EvaluationSampleSchema = z.object({
  query_id: z.string().min(1, 'Query ID is required'),
  query: z.string().min(1, 'Query text is required'),
  relevant_docs: z.array(z.string()).min(1, 'At least one relevant doc is required'),
  relevant_chunks: z.array(z.string()).min(1, 'At least one relevant chunk is required'),
  ideal_answer: z.string().optional(),
});

export type EvaluationSampleInput = z.infer<typeof EvaluationSampleSchema>;

// ============================================================================
// Ablation Schemas
// ============================================================================

/**
 * Schema for AblationConfig validation
 */
export const AblationConfigSchema = z.object({
  baseline: z.object({
    chunking: z.string().default('fixed-size'),
    chunkSize: z.number().int().positive().default(512),
    overlap: z.number().int().nonnegative().default(50),
    retrieval: z.string().default('hybrid'),
    vectorWeight: z.number().min(0).max(1).default(0.7),
    bm25Weight: z.number().min(0).max(1).default(0.3),
    reranker: z.string().nullable().default(null),
    topK: z.number().int().positive().default(10),
  }),
  variants: z.array(
    z.object({
      name: z.string().min(1, 'Variant name is required'),
      description: z.string().optional(),
      changes: z.object({
        chunking: z.string().optional(),
        chunkSize: z.number().int().positive().optional(),
        overlap: z.number().int().nonnegative().optional(),
        retrieval: z.string().optional(),
        vectorWeight: z.number().min(0).max(1).optional(),
        bm25Weight: z.number().min(0).max(1).optional(),
        reranker: z.string().nullable().optional(),
        topK: z.number().int().positive().optional(),
      }),
    }),
  ),
});

export type AblationConfigInput = z.infer<typeof AblationConfigSchema>;

// ============================================================================
// Standard Filter Schemas
// ============================================================================

import type { StandardFilter } from './vector-store.js';

const standardScalarValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const standardArrayValueSchema = z.union([z.array(z.string()), z.array(z.number())]);
const standardFieldValueSchema = z.union([
  standardScalarValueSchema,
  standardArrayValueSchema,
  z.object({ $eq: z.union([standardScalarValueSchema, standardArrayValueSchema]) }).strict(),
  z.object({ $ne: z.union([standardScalarValueSchema, standardArrayValueSchema]) }).strict(),
  z.object({ $in: z.array(z.union([z.string(), z.number()])) }).strict(),
  z.object({ $nin: z.array(z.union([z.string(), z.number()])) }).strict(),
  z.object({ $gt: z.number() }).strict(),
  z.object({ $gte: z.number() }).strict(),
  z.object({ $lt: z.number() }).strict(),
  z.object({ $lte: z.number() }).strict(),
  z.object({ $exists: z.boolean() }).strict(),
]);

const standardFieldFilterSchema = z
  .record(z.string(), standardFieldValueSchema)
  .superRefine((filter, ctx) => {
    for (const key of Object.keys(filter)) {
      if (key.startsWith('$')) {
        ctx.addIssue({
          code: 'custom',
          message: `Unsupported logical filter key '${key}'`,
          path: [key],
        });
      }
    }
  });

export const standardFilterSchema: z.ZodType<StandardFilter> = z.lazy(() =>
  z.union([
    z.object({ $and: z.array(z.lazy(() => standardFilterSchema)) }).strict(),
    z.object({ $or: z.array(z.lazy(() => standardFilterSchema)) }).strict(),
    standardFieldFilterSchema,
  ]),
);

// ============================================================================
// Retrieval Schemas
// ============================================================================

/**
 * Schema for VectorQuery validation
 */
export const VectorQuerySchema = z.object({
  vector: z.array(z.number()).min(1, 'Vector is required'),
  topK: z.number().int().positive().default(10),
  distance: z.enum(['cosine', 'euclidean', 'dot']).optional(),
  filter: standardFilterSchema.optional(),
  collection: z.string().optional(),
});

export type VectorQueryInput = z.infer<typeof VectorQuerySchema>;

/**
 * Schema for BM25Query validation
 */
export const BM25QuerySchema = z.object({
  query: z.string().min(1, 'Query text is required'),
  topK: z.number().int().positive().default(10),
  k1: z.number().positive().default(1.2),
  b: z.number().min(0).max(1).default(0.75),
  filter: standardFilterSchema.optional(),
});

export type BM25QueryInput = z.infer<typeof BM25QuerySchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and parse a document
 */
export function validateDocument(data: unknown): DocumentInput {
  return DocumentSchema.parse(data);
}

/**
 * Validate and parse a chunk
 */
export function validateChunk(data: unknown): ChunkInput {
  return ChunkSchema.parse(data);
}

/**
 * Validate and parse a chunking config
 */
export function validateChunkingConfig(data: unknown): ChunkingConfigInput {
  return ChunkingConfigSchema.parse(data);
}

/**
 * Validate and parse an evaluation sample
 */
export function validateEvaluationSample(data: unknown): EvaluationSampleInput {
  return EvaluationSampleSchema.parse(data);
}

/**
 * Validate and parse an ablation config
 */
export function validateAblationConfig(data: unknown): AblationConfigInput {
  return AblationConfigSchema.parse(data);
}

/**
 * Validate and parse a vector query
 */
export function validateVectorQuery(data: unknown): VectorQueryInput {
  return VectorQuerySchema.parse(data);
}

/**
 * Validate and parse a BM25 query
 */
export function validateBM25Query(data: unknown): BM25QueryInput {
  return BM25QuerySchema.parse(data);
}

// ============================================================================
// Vector Store Schemas
// ============================================================================

import type { VectorStoreConfig } from './vector-store.js';

const qdrantConfigSchema = z.object({
  provider: z.literal('qdrant'),
  url: z.string(),
  apiKey: z.string().optional(),
  collectionName: z.string(),
  vectorSize: z.number().positive(),
  distance: z.enum(['Cosine', 'Euclid', 'Dot']).optional(),
});

const pineconeConfigSchema = z.object({
  provider: z.literal('pinecone'),
  apiKey: z.string(),
  indexName: z.string(),
  cloud: z.string().optional(),
  region: z.string().optional(),
  namespace: z.string().optional(),
});

const weaviateConfigSchema = z.object({
  provider: z.literal('weaviate'),
  url: z.string(),
  apiKey: z.string().optional(),
  className: z.string(),
  tenant: z.string().optional(),
});

const chromaConfigSchema = z.object({
  provider: z.literal('chroma'),
  url: z.string().optional(),
  collectionName: z.string(),
  tenant: z.string().optional(),
});

const pgvectorConfigSchema = z.object({
  provider: z.literal('pgvector'),
  connectionString: z.string(),
  tableName: z.string(),
  vectorDimension: z.number().positive(),
  schema: z.string().optional(),
});

const milvusConfigSchema = z.object({
  provider: z.literal('milvus'),
  address: z.string(),
  token: z.string().optional(),
  collectionName: z.string(),
  vectorDimension: z.number().positive(),
  database: z.string().optional(),
});

const elasticsearchConfigSchema = z.object({
  provider: z.literal('elasticsearch'),
  node: z.string(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  indexName: z.string(),
  vectorDimension: z.number().positive(),
});

const opensearchConfigSchema = z.object({
  provider: z.literal('opensearch'),
  node: z.string(),
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  indexName: z.string(),
  vectorDimension: z.number().positive(),
});

const redisConfigSchema = z.object({
  provider: z.literal('redis'),
  url: z.string(),
  indexName: z.string(),
  vectorDimension: z.number().positive(),
  keyPrefix: z.string().optional(),
});

const mongodbConfigSchema = z.object({
  provider: z.literal('mongodb'),
  connectionString: z.string(),
  databaseName: z.string(),
  collectionName: z.string(),
  vectorIndexName: z.string(),
  vectorDimension: z.number().positive(),
});

const azureAISearchConfigSchema = z.object({
  provider: z.literal('azure-ai-search'),
  endpoint: z.string(),
  apiKey: z.string(),
  indexName: z.string(),
  vectorDimension: z.number().positive(),
});

const lancedbConfigSchema = z.object({
  provider: z.literal('lancedb'),
  uri: z.string(),
  tableName: z.string(),
  vectorDimension: z.number().positive(),
});

const vespaConfigSchema = z.object({
  provider: z.literal('vespa'),
  endpoint: z.string(),
  namespace: z.string(),
  documentType: z.string(),
  vectorDimension: z.number().positive(),
  apiKey: z.string().optional(),
});

const supabaseConfigSchema = z.object({
  provider: z.literal('supabase'),
  url: z.string(),
  serviceRoleKey: z.string(),
  tableName: z.string(),
  vectorDimension: z.number().positive(),
  schema: z.string().optional(),
});

const sandboxConfigSchema = z.object({
  provider: z.literal('sandbox'),
  collectionName: z.string().optional(),
});

export const vectorStoreConfigSchema: z.ZodType<VectorStoreConfig> = z.discriminatedUnion(
  'provider',
  [
    qdrantConfigSchema,
    pineconeConfigSchema,
    weaviateConfigSchema,
    chromaConfigSchema,
    pgvectorConfigSchema,
    milvusConfigSchema,
    elasticsearchConfigSchema,
    opensearchConfigSchema,
    redisConfigSchema,
    mongodbConfigSchema,
    azureAISearchConfigSchema,
    lancedbConfigSchema,
    vespaConfigSchema,
    supabaseConfigSchema,
    sandboxConfigSchema,
  ],
);

export function validateVectorStoreConfig(data: unknown): VectorStoreConfig {
  return vectorStoreConfigSchema.parse(data);
}
