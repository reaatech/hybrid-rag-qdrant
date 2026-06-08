# @reaatech/hybrid-rag-mongodb

MongoDB Atlas Vector Search adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-mongodb mongodb
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'mongodb',
  connectionString: 'mongodb+srv://user:password@cluster.mongodb.net',
  databaseName: 'ragdb',
  collectionName: 'documents',
  vectorIndexName: 'vector_index',
  vectorDimension: 1536,
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search | No |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | Yes |
| Multi-tenancy | Yes |
| Quantization | Yes |
| Scan (migration source) | Yes |
| Max Batch Size | 1000 |
| Max Vector Dimension | 4096 |

## Local Development

MongoDB Atlas Vector Search requires an Atlas cluster (M10+). For local testing, use the `sandbox` provider instead.

## Limitations

- Requires MongoDB Atlas cluster with vector search enabled
- No hybrid search support; client-side BM25 fusion is used
- Connection strings are sensitive — never log them

## Links

- [MongoDB Atlas Vector Search](https://www.mongodb.com/products/platform/atlas-vector-search)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
