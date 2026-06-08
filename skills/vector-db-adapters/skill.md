# Skill: Vector DB Adapters

## Overview

Creating new vector database adapters for the multi-backend hybrid RAG system (v2.0.0). The system supports **15 backends** — Qdrant, Pinecone, Weaviate, Chroma, PgVector, Milvus, Elasticsearch, OpenSearch, Redis, MongoDB, Azure AI Search, LanceDB, Vespa, Supabase, and Sandbox. Every adapter is built against the canonical `VectorStoreAdapter` interface, which defines the full contract including filtering, capability flags, cost models, and hybrid search support.

## Adapter Interface: `VectorStoreAdapter`

Every vector DB adapter must implement the canonical `VectorStoreAdapter` interface:

```typescript
import type { VectorQuery, RetrievalResult, StandardFilter } from '@reaatech/hybrid-rag';

export interface VectorStoreAdapter {
  // Lifecycle
  initialize(): Promise<void>;
  healthCheck(): Promise<boolean>;

  // Collection management
  collectionExists(name: string): Promise<boolean>;
  createCollection(name: string, params: { size: number; distance: string }): Promise<void>;
  deleteCollection(name: string): Promise<void>;

  // Data operations
  upsertPoint(point: { id: string; vector: number[]; payload: Record<string, unknown> }): Promise<void>;
  upsertBatch(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>): Promise<void>;

  // Search
  search(query: VectorQuery): Promise<RetrievalResult[]>;
  hybridSearch?(query: { vector: number[]; text: string; topK: number; filter?: StandardFilter }): Promise<RetrievalResult[]>;

  // Filtering
  translateFilter(filter: StandardFilter): unknown;

  // Capability flags & cost
  getCapabilities(): VectorStoreCapabilities;
  getCostModel(): VectorStoreCostModel;
}

export interface VectorStoreCapabilities {
  supportsHybridSearch: boolean;      // Native vector + keyword fusion in-DB
  supportsSparseVectors: boolean;     // Sparse/dense hybrid embeddings
  supportsFiltering: boolean;         // Server-side metadata filtering
  supportsMultiVector: boolean;       // Multiple vectors per document
  supportsPayloadIndexing: boolean;   // Indexed metadata for fast filtering
  maxBatchSize: number;               // Maximum vectors per batch upsert
  maxVectorDimension: number;         // Maximum embedding dimension supported
}
```

## StandardFilter Translation

Every adapter must translate the unified `StandardFilter` to its own query DSL. The filter structure:

```typescript
export interface StandardFilter {
  metadata?: Record<string, FilterCondition>;
}

export type FilterCondition =
  | { $eq: string | number | boolean }
  | { $ne: string | number | boolean }
  | { $in: Array<string | number> }
  | { $nin: Array<string | number> }
  | { $gt: number } | { $gte: number } | { $lt: number } | { $lte: number }
  | { $contains: string }
  | { $and: FilterCondition[] } | { $or: FilterCondition[] } | { $not: FilterCondition };
```

**Example — Qdrant translation:**
```typescript
translateFilter(filter: StandardFilter): Filter {
  const conditions = Object.entries(filter.metadata ?? {}).map(([key, cond]) => {
    if ('$eq' in cond) return { key, match: { value: cond.$eq } };
    if ('$in' in cond) return { key, match: { any: cond.$in } };
    if ('$gt' in cond) return { key, range: { gt: cond.$gt } };
    if ('$gte' in cond && '$lte' in cond) return { key, range: { gte: cond.$gte, lte: cond.$lte } };
    // ... etc
  });
  return { must: conditions };
}
```

**Example — Pinecone translation:**
```typescript
translateFilter(filter: StandardFilter): PineconeFilter {
  return Object.fromEntries(
    Object.entries(filter.metadata ?? {}).map(([key, cond]) => {
      if ('$eq' in cond) return [key, { $eq: cond.$eq }];
      if ('$in' in cond) return [key, { $in: cond.$in }];
      // ...
    })
  );
}
```

Each backend's translation layer lives in the adapter package, insulating retrieval logic from backend-specific query syntax.

## Capability Flags

The `getCapabilities()` method advertises what the backend can do natively. The fusion layer, cost model, and query router all check these flags at runtime.

| Flag | Meaning | Fusion Impact |
|------|---------|---------------|
| `supportsHybridSearch` | Native vector + keyword in-DB | Skips client-side fusion |
| `supportsSparseVectors` | Sparse/dense hybrid embeddings | Enables learned sparse + dense |
| `supportsFiltering` | Server-side metadata filtering | Pushes filters to DB, avoids post-filter |
| `supportsMultiVector` | Multiple vectors per document | Enables ColBERT-style late interaction |
| `supportsPayloadIndexing` | Indexed metadata for fast filtering | Fast filtered search at scale |
| `maxBatchSize` | Maximum vectors per batch upsert | Controls chunking of bulk ingestion |
| `maxVectorDimension` | Maximum embedding dimension | Validates embedding model compatibility |

## Cost Model

Every adapter exposes a `VectorStoreCostModel` via `getCostModel()`:

```typescript
export interface VectorStoreCostModel {
  provider: string;                           // e.g. 'qdrant', 'pinecone'
  pricingModel: 'free' | 'per-query' | 'per-dimension' | 'per-node';
  costPerQuery: number;                       // USD per vector search (if applicable)
  costPerUpsert: number;                      // USD per vector upsert (if applicable)
  costPerGbMonth: number;                     // USD per GB storage per month (if applicable)
  estimatedMonthlyCost: (vectors: number, dims: number) => number;
}
```

Self-hosted backends (Qdrant, Chroma, PgVector, Milvus, Weaviate open-source) report `pricingModel: 'free'` with zero per-operation costs — infrastructure costs are tracked separately. SaaS backends (Pinecone, MongoDB Atlas, Azure AI Search, Supabase) report per-query or per-dimension pricing.

## Plugin Registry

Adapters register themselves into the global `VectorStoreFactory` for runtime resolution:

```typescript
import { registerVectorStore } from '@reaatech/hybrid-rag-retrieval';

// At package init time:
registerVectorStore('qdrant', {
  create: (config) => new QdrantAdapter(config),
  capabilities: {
    supportsHybridSearch: false,
    supportsSparseVectors: false,
    supportsFiltering: true,
    supportsMultiVector: false,
    supportsPayloadIndexing: true,
    maxBatchSize: 1000,
    maxVectorDimension: 65536,
  },
  costModel: {
    provider: 'qdrant',
    pricingModel: 'free',
    costPerQuery: 0,
    costPerUpsert: 0,
    costPerGbMonth: 0,
    estimatedMonthlyCost: () => 0,
  },
});
```

## Implementation Pattern

### 1. Create the adapter class

```typescript
// packages/my-vector-db/src/adapter.ts
import type { VectorQuery, RetrievalResult, StandardFilter } from '@reaatech/hybrid-rag';
import type { VectorStoreAdapter, VectorStoreCapabilities, VectorStoreCostModel } from '@reaatech/hybrid-rag-retrieval';
import { MyDBClient } from './client.js';
import { translateFilter } from './filter-translator.js';

export interface MyDBConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  distance?: 'Cosine' | 'Euclid' | 'Dot';
}

export class MyDBAdapter implements VectorStoreAdapter {
  private readonly client: MyDBClient;
  private readonly config: MyDBConfig;
  private initialized = false;

  constructor(config: MyDBConfig) {
    this.config = config;
    this.client = new MyDBClient(config);
  }

  async initialize(): Promise<void> {
    await this.client.connect();
    if (!(await this.client.collectionExists(this.config.collectionName))) {
      await this.client.createCollection(this.config.collectionName, {
        size: this.config.vectorSize,
        distance: this.config.distance ?? 'Cosine',
      });
    }
    this.initialized = true;
  }

  async collectionExists(name: string): Promise<boolean> {
    return this.client.collectionExists(name);
  }

  async createCollection(name: string, params: { size: number; distance: string }): Promise<void> {
    return this.client.createCollection(name, params);
  }

  async upsertPoint(point: { id: string; vector: number[]; payload: Record<string, unknown> }): Promise<void> {
    return this.client.upsertPoint(point);
  }

  async upsertBatch(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>): Promise<void> {
    const batchSize = this.getCapabilities().maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      await this.client.upsertBatch(points.slice(i, i + batchSize));
    }
  }

  async search(query: VectorQuery): Promise<RetrievalResult[]> {
    const nativeFilter = query.filter
      ? translateFilter(query.filter as StandardFilter)
      : undefined;
    return this.client.search({ ...query, filter: nativeFilter });
  }

  async deleteCollection(name: string): Promise<void> {
    return this.client.deleteCollection(name);
  }

  async healthCheck(): Promise<boolean> {
    return this.client.ping();
  }

  translateFilter(filter: StandardFilter): unknown {
    return translateFilter(filter);
  }

  getCapabilities(): VectorStoreCapabilities {
    return {
      supportsHybridSearch: false,
      supportsSparseVectors: false,
      supportsFiltering: true,
      supportsMultiVector: false,
      supportsPayloadIndexing: false,
      maxBatchSize: 100,
      maxVectorDimension: 4096,
    };
  }

  getCostModel(): VectorStoreCostModel {
    return {
      provider: 'mydb',
      pricingModel: 'free',
      costPerQuery: 0,
      costPerUpsert: 0,
      costPerGbMonth: 0,
      estimatedMonthlyCost: () => 0,
    };
  }
}
```

### 2. Filter translation module

```typescript
// packages/my-vector-db/src/filter-translator.ts
import type { StandardFilter, FilterCondition } from '@reaatech/hybrid-rag';

export function translateFilter(filter: StandardFilter): Record<string, unknown> {
  const conditions: Record<string, unknown> = {};
  for (const [key, cond] of Object.entries(filter.metadata ?? {})) {
    conditions[key] = translateCondition(cond);
  }
  return conditions;
}

function translateCondition(cond: FilterCondition): unknown {
  if ('$eq' in cond) return cond.$eq;
  if ('$ne' in cond) return { $ne: cond.$ne };
  if ('$in' in cond) return { $in: cond.$in };
  if ('$gt' in cond) return { $gt: cond.$gt };
  if ('$gte' in cond) return { $gte: cond.$gte };
  if ('$and' in cond) return cond.$and.map(translateCondition);
  if ('$or' in cond) return cond.$or.map(translateCondition);
  throw new Error(`Unsupported filter condition: ${JSON.stringify(cond)}`);
}
```

### 3. Package structure

```
packages/my-vector-db/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── LICENSE
├── README.md
├── docker-compose.yml     # for integration tests
└── src/
    ├── index.ts           # barrel export + registerVectorStore() call
    ├── adapter.ts         # implements VectorStoreAdapter
    ├── client.ts          # raw DB client wrapper
    ├── filter-translator.ts  # StandardFilter → native query DSL
    └── __tests__/
        ├── adapter.test.ts
        ├── filter-translator.test.ts
        └── integration.test.ts
```

### 4. package.json template

```json
{
  "name": "@your-scope/my-vector-db",
  "version": "0.1.0",
  "description": "MyDB vector database adapter for hybrid RAG",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean",
    "test": "vitest run --passWithNoTests",
    "test:integration": "vitest run src/__tests__/integration.test.ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@reaatech/hybrid-rag": "workspace:*",
    "my-db-client": "^x.y.z"
  },
  "devDependencies": {
    "tsup": "^8.4.0",
    "typescript": "^5.8.3",
    "vitest": "^3.1.1"
  }
}
```

## Adapter Checklist

When creating a new vector DB adapter, ensure:

- [ ] Implements `VectorStoreAdapter` interface with all required methods
- [ ] Implements `getCapabilities()` with accurate capability flags
- [ ] Implements `getCostModel()` with correct pricing
- [ ] `translateFilter()` maps all `FilterCondition` variants to native query DSL
- [ ] Calls `registerVectorStore()` in barrel export for plugin registry
- [ ] Batch upsert respects `maxBatchSize` from capabilities
- [ ] Search returns `RetrievalResult[]` with `chunkId`, `documentId`, `content`, `score`, `source: 'vector'`
- [ ] Supports `StandardFilter` metadata filtering on all supported condition types
- [ ] `hybridSearch()` implemented if `supportsHybridSearch` is true
- [ ] Collection auto-creation on `initialize()` if collection doesn't exist
- [ ] `healthCheck()` verifies connectivity
- [ ] Lazy initialization (deduplicate concurrent init calls)
- [ ] Proper error handling for connection failures, authentication errors, and not-found conditions

## Production Adapter Examples

Study the existing adapters for reference implementations:

| Backend | Package | Key Techniques |
|---------|---------|---------------|
| Qdrant | `@reaatech/hybrid-rag-qdrant` | Filter translation, RRF fusion, payload indexing |
| Pinecone | `@reaatech/hybrid-rag-pinecone` | Serverless indexes, sparse-dense hybrid, metadata filtering |
| Weaviate | `@reaatech/hybrid-rag-weaviate` | Native alpha-weighted hybrid, GraphQL queries, multi-tenancy |
| Chroma | `@reaatech/hybrid-rag-chroma` | Embedded mode, HNSW tuning, Python bridge patterns |
| PgVector | `@reaatech/hybrid-rag-pgvector` | SQL-based filtering, IVFFlat/HNSW indexes, batch COPY |
| Milvus | `@reaatech/hybrid-rag-milvus` | Partition key support, scalar indexing, multi-vector |
| Elasticsearch | `@reaatech/hybrid-rag-elasticsearch` | Native BM25+KNN, dense/sparse vectors, aggregations |
| OpenSearch | `@reaatech/hybrid-rag-opensearch` | Neural search + BM25, painless scripting |
| Redis | `@reaatech/hybrid-rag-redis` | RediSearch tags, hash-based payloads, FLAT/HNSW |
| MongoDB | `@reaatech/hybrid-rag-mongodb` | Atlas vector search, aggregation pipeline filtering |
| Azure AI Search | `@reaatech/hybrid-rag-azure-ai-search` | Semantic ranker, integrated vectorization, skillsets |
| LanceDB | `@reaatech/hybrid-rag-lancedb` | Lance columnar format, embedded/indexed modes |
| Vespa | `@reaatech/hybrid-rag-vespa` | WAND + nearest neighbor, ranking expressions |
| Supabase | `@reaatech/hybrid-rag-supabase` | pgvector + PostgREST, row-level security |

## Testing

### Unit tests (filter translation)

```typescript
import { describe, it, expect } from 'vitest';
import { translateFilter } from './filter-translator.js';
import type { StandardFilter } from '@reaatech/hybrid-rag';

describe('translateFilter', () => {
  it('translates equality filter', () => {
    const filter: StandardFilter = { metadata: { department: { $eq: 'engineering' } } };
    expect(translateFilter(filter)).toEqual({ department: 'engineering' });
  });

  it('translates range filter', () => {
    const filter: StandardFilter = { metadata: { date: { $gte: '2026-01-01', $lte: '2026-12-31' } } };
    expect(translateFilter(filter)).toEqual({ date: { $gte: '2026-01-01', $lte: '2026-12-31' } });
  });

  it('throws on unsupported condition', () => {
    const filter: StandardFilter = { metadata: { x: { $regex: '^abc' } as any } };
    expect(() => translateFilter(filter)).toThrow('Unsupported filter condition');
  });
});
```

### Integration tests

Each adapter should have integration tests that spin up the target DB (via Docker Compose) and verify the full lifecycle. A `docker-compose.yml` should be included in the package root. Test pattern:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MyDBAdapter } from './adapter.js';

describe('MyDBAdapter Integration', () => {
  const adapter = new MyDBAdapter({
    url: 'http://localhost:19530',
    collectionName: 'test-collection',
    vectorSize: 4,
  });

  beforeAll(async () => { await adapter.initialize(); });

  it('should initialize and create collection', async () => {
    const exists = await adapter.collectionExists('test-collection');
    expect(exists).toBe(true);
  });

  it('should upsert and search', async () => {
    await adapter.upsertPoint({
      id: 'vec-1',
      vector: [0.1, 0.2, 0.3, 0.4],
      payload: { text: 'hello', department: 'engineering' },
    });

    const results = await adapter.search({
      vector: [0.1, 0.2, 0.3, 0.4],
      topK: 1,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('vec-1');
  });

  it('should filter by metadata', async () => {
    const results = await adapter.search({
      vector: [0.1, 0.2, 0.3, 0.4],
      topK: 10,
      filter: { metadata: { department: { $eq: 'engineering' } } },
    });
    expect(results.every(r => r.metadata?.['department'] === 'engineering')).toBe(true);
  });

  it('should report capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.supportsFiltering).toBe(true);
    expect(caps.maxBatchSize).toBeGreaterThan(0);
  });

  it('should report cost model', () => {
    const cost = adapter.getCostModel();
    expect(cost.provider).toBe('mydb');
    expect(typeof cost.estimatedMonthlyCost).toBe('function');
  });

  it('should pass health check', async () => {
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);
  });

  afterAll(async () => { await adapter.deleteCollection('test-collection'); });
});
```

## Related Skills

- `vector-retrieval` — Multi-provider vector search via `VectorStoreFactory`
- `hybrid-fusion` — Native vs client-side fusion delegation
- `cost-management` — Per-provider cost tracking via `VectorStoreCostModel`
- `rag-evaluation` — Cross-DB benchmarking with `benchmarkVectorStores()`
- Embedding generation via `@reaatech/hybrid-rag-embedding`
