# Skill: Vector DB Adapters

## Overview

Creating new vector database adapters for the hybrid RAG system. The `@reaatech/hybrid-rag-qdrant` package provides the reference Qdrant implementation, but the architecture supports swapping to Milvus, Chroma, Pinecone, Weaviate, or any other vector database.

## Adapter Interface

Every vector DB adapter must implement:

```typescript
import type { VectorQuery, RetrievalResult } from '@reaatech/hybrid-rag';

export interface VectorDBAdapter {
  initialize(): Promise<void>;
  collectionExists(name: string): Promise<boolean>;
  createCollection(name: string, params: { size: number; distance: string }): Promise<void>;
  upsertPoint(point: { id: string; vector: number[]; payload: Record<string, unknown> }): Promise<void>;
  upsertBatch(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>): Promise<void>;
  search(query: VectorQuery): Promise<RetrievalResult[]>;
  deleteCollection(name: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

## Implementation Pattern

### 1. Create the adapter class

```typescript
// packages/my-vector-db/src/client.ts
import type { VectorQuery, RetrievalResult } from '@reaatech/hybrid-rag';

export interface MyDBConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  distance?: 'Cosine' | 'Euclid' | 'Dot';
}

export class MyDBClient {
  private readonly config: MyDBConfig;
  private initialized = false;

  constructor(config: MyDBConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Connect to your DB
    // Ensure collection exists (create if not)
    this.initialized = true;
  }

  async collectionExists(name: string): Promise<boolean> {
    // Check if collection exists in your DB
    return false;
  }

  async createCollection(name: string, params: { size: number; distance: string }): Promise<void> {
    // Create collection with vector parameters
  }

  async upsertPoint(point: { id: string; vector: number[]; payload: Record<string, unknown> }): Promise<void> {
    // Insert/update a single vector point
  }

  async upsertBatch(points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>): Promise<void> {
    // Batch insert with configurable batch size (recommend 100)
  }

  async search(query: VectorQuery): Promise<RetrievalResult[]> {
    // Execute vector similarity search
    // Convert results to RetrievalResult[] format
    // Apply metadata filters if provided
    return [];
  }

  async deleteCollection(name: string): Promise<void> {
    // Drop the collection
  }

  async healthCheck(): Promise<boolean> {
    // Verify connectivity
    return true;
  }
}
```

### 2. Create a vector search engine

```typescript
// packages/my-vector-db/src/search.ts
import type { RetrievalResult, Chunk } from '@reaatech/hybrid-rag';
import { EmbeddingService } from '@reaatech/hybrid-rag-embedding';
import { MyDBClient } from './client.js';

export class MyDBSearchEngine {
  private readonly db: MyDBClient;
  private readonly embedding: EmbeddingService;

  constructor(config: { db: MyDBConfig; embedding: { provider: string; model: string; apiKey?: string } }) {
    this.db = new MyDBClient(config.db);
    this.embedding = new EmbeddingService({
      provider: config.embedding.provider as 'openai' | 'vertex' | 'local',
      model: config.embedding.model,
      apiKey: config.embedding.apiKey,
    });
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  async indexChunks(chunks: Chunk[]): Promise<void> {
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embedding.embedBatch(texts);

    const points = chunks.map((chunk, i) => ({
      id: chunk.id,
      vector: embeddings[i]!.embedding,
      payload: {
        documentId: chunk.documentId,
        content: chunk.content,
        metadata: chunk.metadata,
      },
    }));

    await this.db.upsertBatch(points);
  }

  async search(query: string, options?: { topK?: number; filter?: Record<string, unknown> }): Promise<RetrievalResult[]> {
    const { embedding } = await this.embedding.embed(query);
    return this.db.search({
      vector: embedding,
      topK: options?.topK ?? 10,
      filter: options?.filter,
    });
  }
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
└── src/
    ├── index.ts       # barrel export
    ├── client.ts      # DB client wrapper
    └── search.ts      # search engine (client + embedding)
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
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@reaatech/hybrid-rag": "workspace:*",
    "@reaatech/hybrid-rag-embedding": "workspace:*",
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

- [ ] Implements all 8 methods of the adapter interface
- [ ] Batch upsert uses configurable batch size (100 default)
- [ ] Search returns `RetrievalResult[]` with `chunkId`, `documentId`, `content`, `score`, `source: 'vector'`
- [ ] Metadata filters are properly translated (basic: key-value match)
- [ ] Collection auto-creation on `initialize()` if collection doesn't exist
- [ ] `healthCheck()` verifies connectivity
- [ ] Lazy initialization (deduplicate concurrent init calls)
- [ ] Proper error handling for connection failures, authentication errors, and not-found conditions

## Supported Vector DBs

| Database | Status | Notes |
|----------|--------|-------|
| Qdrant | Reference | `@reaatech/hybrid-rag-qdrant` — full implementation |
| Milvus | Planned | Use `@zilliz/milvus2-sdk-node` |
| Chroma | Planned | Use `chromadb` client |
| Pinecone | Planned | Use `@pinecone-database/pinecone` |
| Weaviate | Planned | Use `weaviate-ts-client` |

## Testing

Each adapter should have integration tests that spin up the target DB (via Docker) and verify:

```typescript
import { describe, it, expect } from 'vitest';
import { MyDBClient } from './client.js';

describe('MyDBClient', () => {
  const client = new MyDBClient({
    url: 'http://localhost:19530',
    collectionName: 'test-collection',
    vectorSize: 4,
  });

  it('should initialize and create collection', async () => {
    await client.initialize();
    const exists = await client.collectionExists('test-collection');
    expect(exists).toBe(true);
  });

  it('should upsert and search', async () => {
    await client.upsertPoint({
      id: 'vec-1',
      vector: [0.1, 0.2, 0.3, 0.4],
      payload: { text: 'hello' },
    });

    const results = await client.search({
      vector: [0.1, 0.2, 0.3, 0.4],
      topK: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('vec-1');
  });

  it('should pass health check', async () => {
    const healthy = await client.healthCheck();
    expect(healthy).toBe(true);
  });
});
```

## Related Skills

- `vector-retrieval` — Vector search via Qdrant (reference implementation)
- `hybrid-fusion` — Combining vector and BM25 results
- Embedding generation via `@reaatech/hybrid-rag-embedding`
