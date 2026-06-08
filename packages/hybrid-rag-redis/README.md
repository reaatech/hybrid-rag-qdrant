# @reaatech/hybrid-rag-redis

Redis Vector adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-redis redis
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'redis',
  url: 'redis://localhost:6379',
  indexName: 'documents_idx',
  vectorDimension: 1536,
  keyPrefix: 'doc:', // optional
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search | Yes |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | Yes |
| Multi-tenancy | Yes |
| Quantization | No |
| Scan (migration source) | Yes |
| Max Batch Size | 1000 |
| Max Vector Dimension | 32768 |

## Local Development

Redis Stack is required (includes RediSearch):

```bash
docker run -p 6379:6379 redis/redis-stack:latest
```

## Limitations

- Requires Redis Stack with RediSearch module
- Scan operations on large datasets can be expensive (key prefix scan)
- Hybrid uses RediSearch text queries plus KNN where available

## Links

- [Redis Vector Search](https://redis.io/docs/latest/develop/interact/search-and-query/)
- [Redis Stack Documentation](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/)
