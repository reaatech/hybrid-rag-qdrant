# @reaatech/hybrid-rag-weaviate

Weaviate vector database adapter for the hybrid-rag system, using the v3 Collections API.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-weaviate weaviate-client@^3.13.1
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'weaviate',
  url: 'http://localhost:8080',
  apiKey: process.env.WEAVIATE_API_KEY, // optional
  className: 'Document',
  tenant: 'tenant-1', // optional, for multi-tenancy
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search (alpha-weighted) | Yes |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | Yes |
| Multi-tenancy (tenants) | Yes |
| Quantization | No |
| Scan (migration source) | Yes |
| Max Batch Size | 100 |
| Max Vector Dimension | 65535 |

## Local Development

Weaviate requires a running Weaviate instance. Use Docker:

```bash
docker run -p 8080:8080 cr.weaviate.io/semitechnologies/weaviate:latest
```

## Limitations

- Native hybrid depends on schema/text field configuration
- Requires `weaviate-client@^3.13.1` (v3 Collections API) — not compatible with `weaviate-ts-client`
- Vectorizers must be configured as `none` since embeddings are provided externally

## Links

- [Weaviate Documentation](https://weaviate.io/developers/weaviate)
- [Weaviate v3 Client](https://weaviate.io/developers/weaviate/client-libraries/typescript)
