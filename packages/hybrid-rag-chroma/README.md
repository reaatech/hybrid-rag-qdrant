# @reaatech/hybrid-rag-chroma

Chroma vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-chroma chromadb@^3.4.3
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'chroma',
  url: 'http://localhost:8000', // optional, defaults to localhost:8000
  collectionName: 'documents',
  tenant: 'default', // optional
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
| Quantization | No |
| Scan (migration source) | Yes |
| Max Batch Size | 5461 |
| Max Vector Dimension | 20000 |

## Local Development

Chroma requires a running server. Use Docker:

```bash
docker run -p 8000:8000 chromadb/chroma:latest
```

Or via the Chroma CLI:

```bash
pip install chromadb
chroma run --path ./chroma-data
```

## Limitations

- **Server-only** — the JavaScript client requires a running Chroma server (no embedded in-process mode in Node.js)
- Not recommended for high-concurrency production without validation
- Hybrid search is not supported; client-side BM25 fusion is used instead
- No persistence without a server

## Links

- [Chroma Documentation](https://docs.trychroma.com/)
- [Chroma JS Client](https://github.com/chroma-core/chroma)
