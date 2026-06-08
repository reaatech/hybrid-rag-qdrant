# Changelog

## v2.0.0 (2026-06-07)

### Added

- Multi-vector-database support via `VectorStoreAdapter` interface
- Pinecone, Weaviate, Chroma, PgVector adapters
- Milvus/Zilliz, Elasticsearch, OpenSearch, Redis Vector, MongoDB Atlas Vector Search, Azure AI Search, LanceDB, Vespa, and Supabase Vector adapters
- `VectorStoreFactory` with dynamic lazy-loading of provider packages
- Plugin registry for third-party adapter registration
- Unified `StandardFilter` for cross-DB metadata filtering
- Hybrid-native delegation (Weaviate alpha-weighted fusion; Pinecone sparse-dense)
- Deterministic BM25 sparse-vector encoding (`encodeSparse`) enabling native sparse-dense hybrid
- Zero-config local dev mode via embedded LanceDB default (in-process, no server)
- Sandbox/dry-run mode for cost-free testing
- Cross-DB vector migration tools (`hybrid-rag-migration`)
- Cross-DB benchmarking in evaluation package
- Per-DB cost tracking with cost models per provider
- 6 new MCP tools: `rag.migrate`, `rag.detect_capabilities`, `rag.benchmark_db`, `rag.list_providers`, `rag.db_health`, `rag.sandbox`
- >90% test coverage enforced across all packages

### Changed

- **BREAKING:** `RAGPipelineConfig.qdrantUrl` / `qdrantApiKey` replaced by `vectorStore: VectorStoreConfig`
- **BREAKING:** `VectorSearchConfig.qdrant` replaced by `VectorStoreConfig`
- `VectorSearchEngine` uses dependency injection — no longer hard-coupled to Qdrant
- `RAGPipeline` defaults to embedded LanceDB local mode (in-process, no server) when no `vectorStore` is provided
- MCP tools updated to be DB-agnostic (no hardcoded Qdrant references)
- Cost breakdown includes `vector_store` component

### Deprecated

- `qdrantUrl` and `qdrantApiKey` in `RAGPipelineConfig` — backward compat shim maps these to `vectorStore: { provider: 'qdrant', ... }` automatically. Will be removed in v3.0.0.
