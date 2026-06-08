# @reaatech/hybrid-rag-lancedb

LanceDB vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-lancedb @lancedb/lancedb
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'lancedb',
  uri: '.lancedb-data', // local path (embedded mode, no server)
  tableName: 'documents',
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
| Multi-tenancy | No |
| Quantization | Yes |
| Scan (migration source) | Yes |
| Max Batch Size | 1000 |
| Max Vector Dimension | 32768 |

## Local Development

LanceDB runs embedded in-process — no server, no Docker required. Data is stored at the configured local URI path. This is the default zero-config provider for `RAGPipeline` when no `vectorStore` is specified.

## Limitations

- Embedded/file-based; not suitable for shared high-concurrency production
- No native hybrid search; client-side BM25 fusion is used
- Data stored at the local URI path — ensure backups and `.gitignore` the data directory
- Cloud URI behavior differs from local URI

## Links

- [LanceDB Documentation](https://lancedb.github.io/lancedb/)
- [LanceDB JS Client](https://lancedb.github.io/lancedb/basic_concepts/)
