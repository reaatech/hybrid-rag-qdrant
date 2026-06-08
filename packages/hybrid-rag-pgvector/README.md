# @reaatech/hybrid-rag-pgvector

PostgreSQL pgvector adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-pgvector pg
pnpm add -D @types/pg
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'pgvector',
  connectionString: 'postgres://user:password@localhost:5432/ragdb',
  tableName: 'documents',
  vectorDimension: 1536,
  schema: 'public', // optional
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search | No |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | Yes |
| Multi-tenancy (RLS) | Yes |
| Quantization | No |
| Scan (migration source) | Yes |
| Max Batch Size | 1000 |
| Max Vector Dimension | 16000 |

## Local Development

Requires PostgreSQL with pgvector extension:

```bash
docker run -p 5432:5432 -e POSTGRES_PASSWORD=password pgvector/pgvector:pg16
```

Then create the extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Limitations

- Requires careful HNSW/IVFFlat index selection and Postgres tuning
- No native hybrid search; client-side BM25 fusion is used
- SQL identifiers must be validated and quoted to prevent injection
- Connection strings are sensitive — never log them

## Links

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
