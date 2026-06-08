# @reaatech/hybrid-rag-elasticsearch

Elasticsearch vector database adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-elasticsearch @elastic/elasticsearch
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'elasticsearch',
  node: 'http://localhost:9200',
  apiKey: process.env.ES_API_KEY, // optional
  username: 'elastic', // optional, for basic auth
  password: process.env.ES_PASSWORD, // optional
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
| Max Vector Dimension | 4096 |

## Local Development

Run Elasticsearch with Docker:

```bash
docker run -p 9200:9200 -e "discovery.type=single-node" docker.elastic.co/elasticsearch/elasticsearch:8.12.0
```

## Limitations

- Requires Elasticsearch 8.x for vector and RRF features
- Authentication credentials must be kept secure
- Hybrid search uses kNN plus lexical query with RRF where available

## Links

- [Elasticsearch Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Elasticsearch JS Client](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)
