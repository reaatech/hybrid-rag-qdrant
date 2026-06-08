# @reaatech/hybrid-rag-vespa

Vespa vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-vespa
```

Vespa uses standard HTTP APIs — no additional client dependency is required.

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'vespa',
  endpoint: 'http://localhost:8080',
  namespace: 'my-namespace',
  documentType: 'doc',
  vectorDimension: 1536,
  apiKey: process.env.VESPA_API_KEY, // optional
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search | Yes |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | No |
| Multi-tenancy | Yes |
| Quantization | Yes |
| Scan (migration source) | Yes |
| Max Batch Size | 500 |
| Max Vector Dimension | 32768 |

## Local Development

Run Vespa locally with Docker:

```bash
docker run -p 8080:8080 vespaengine/vespa
```

Deploy an application package with the required schema and ranking profile before using.

## Limitations

- Collection management is false because app package/schema deployment is external
- Requires a Vespa application package with schema and ranking profile configured
- Native hybrid uses Vespa ranking profiles
- Deployment and schema management must be handled separately

## Links

- [Vespa Documentation](https://docs.vespa.ai/)
- [Vespa Getting Started](https://docs.vespa.ai/en/getting-started.html)
