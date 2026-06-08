# Changelog

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

## v2.0.0 (2026-06-07)

### Added

- Initial LanceDB adapter implementation
- VectorStoreAdapter interface compliance
- StandardFilter translation
- Unit tests and contract tests
