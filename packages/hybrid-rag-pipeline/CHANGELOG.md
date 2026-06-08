# @reaatech/hybrid-rag-pipeline

## 2.0.0

### Major Changes

- v2.0.0: multi-vector-DB adapter architecture.

  This release introduces a provider-agnostic vector store layer with adapters for
  Qdrant, Pinecone, Weaviate, Chroma, pgvector, Milvus, Redis, MongoDB, LanceDB,
  Elasticsearch, OpenSearch, Vespa, Supabase, and Azure AI Search.

  BREAKING: the top-level `qdrantUrl` / `qdrantApiKey` configuration fields are
  replaced by a structured `vectorStore` config (e.g. `vectorStore: { provider: "qdrant", url, apiKey }`).
  The deprecated `qdrantUrl` / `qdrantApiKey` fields are removed in v3.0.0; see the
  migration guide for the upgrade path.

### Patch Changes

- Updated dependencies []:
  - @reaatech/hybrid-rag@2.0.0
  - @reaatech/hybrid-rag-embedding@2.0.0
  - @reaatech/hybrid-rag-ingestion@2.0.0
  - @reaatech/hybrid-rag-observability@2.0.0
  - @reaatech/hybrid-rag-retrieval@2.0.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`55e0f72`](https://github.com/reaatech/hybrid-rag/commit/55e0f7262f7641d700c04457fe6752c1ba9b4070)]:
  - @reaatech/hybrid-rag-observability@0.1.1
  - @reaatech/hybrid-rag-ingestion@0.1.1
  - @reaatech/hybrid-rag-retrieval@0.1.1
