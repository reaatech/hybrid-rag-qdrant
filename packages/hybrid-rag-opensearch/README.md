# @reaatech/hybrid-rag-opensearch

OpenSearch vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-opensearch @opensearch-project/opensearch
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'opensearch',
  node: 'http://localhost:9200',
  apiKey: process.env.OS_API_KEY, // optional
  username: 'admin', // optional, for basic auth
  password: process.env.OS_PASSWORD, // optional
  indexName: 'documents',
  vectorDimension: 1536,
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search | Yes |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | Yes |
| Multi-tenancy | No |
| Quantization | Yes |
| Scan (migration source) | Yes |
| Max Batch Size | 500 |
| Max Vector Dimension | 16000 |

## Local Development

Run OpenSearch with Docker:

```bash
docker run -p 9200:9200 -e "discovery.type=single-node" -e "DISABLE_SECURITY_PLUGIN=true" opensearchproject/opensearch:latest
```

## Limitations

- Requires k-NN plugin for vector search functionality
- Hybrid search uses neural/kNN plus lexical query where configured
- Version compatibility may affect available features

## Links

- [OpenSearch Documentation](https://opensearch.org/docs/latest/)
- [OpenSearch JS Client](https://opensearch.org/docs/latest/clients/javascript/index/)
