# @reaatech/hybrid-rag-supabase

Supabase Vector adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-supabase @supabase/supabase-js
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'supabase',
  url: 'https://your-project.supabase.co',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
| Collection Management | No |
| Multi-tenancy (RLS) | Yes |
| Quantization | No |
| Scan (migration source) | Yes |
| Max Batch Size | 500 |
| Max Vector Dimension | 16000 |

## Local Development

Supabase Vector is PgVector-backed. For local development, use the Supabase CLI:

```bash
supabase init
supabase start
```

Required SQL setup:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT,
  metadata JSONB,
  embedding VECTOR(1536)
);

CREATE OR REPLACE FUNCTION match_documents(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
RETURNS TABLE(id UUID, content TEXT, metadata JSONB, similarity FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT documents.id, documents.content, documents.metadata, 1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Limitations

- Collection management is external (SQL schema changes)
- No native hybrid search; client-side BM25 fusion is used
- Requires Supabase project or Supabase CLI for local dev
- Service role key is sensitive — never log it

## Links

- [Supabase Vector Documentation](https://supabase.com/docs/guides/ai)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
