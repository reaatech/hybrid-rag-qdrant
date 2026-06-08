# @reaatech/hybrid-rag-milvus

Milvus / Zilliz Cloud vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-milvus @zilliz/milvus2-sdk-node
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'milvus',
  address: 'localhost:19530',
  token: process.env.MILVUS_TOKEN, // optional
  collectionName: 'documents',
  vectorDimension: 1536,
  database: 'default', // optional
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
| Max Vector Dimension | 32768 |

## Local Development

Use Docker for local Milvus:

```bash
docker compose -f standalone.yml up
```

For Zilliz Cloud, use the provided endpoint and API token instead.

## Limitations

- No native hybrid search; client-side BM25 fusion is used
- Requires index configuration for production performance
- Scan may not be available on all collection/index types

## Links

- [Milvus Documentation](https://milvus.io/docs)
- [Zilliz Cloud](https://zilliz.com/cloud)
