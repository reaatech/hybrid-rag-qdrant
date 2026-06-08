# @reaatech/hybrid-rag-pinecone

Pinecone vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-pinecone
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'pinecone',
  apiKey: process.env.PINECONE_API_KEY,
  indexName: 'my-index',
  cloud: 'aws',
  region: 'us-west-2',
  namespace: 'my-namespace', // optional
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search (sparse-dense) | Yes |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | No |
| Multi-tenancy (namespaces) | Yes |
| Quantization | No |
| Scan (migration source) | No |
| Max Batch Size | 100 |
| Max Vector Dimension | 20000 |

## Local Development

Pinecone requires a Pinecone account and API key. No local emulator is available. Use the `sandbox` provider for local testing without credentials.

## Limitations

- Cannot be used as a migration source (no scan/list API)
- Collection management (create/delete indexes) must be done via Pinecone Console or API
- Sparse vectors are generated from BM25 term frequency (not a learned sparse model)
- Monthly base cost: ~$70 for starter pod

## Links

- [Pinecone Documentation](https://docs.pinecone.io/)
- [Pinecone Console](https://app.pinecone.io/)
