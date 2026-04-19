# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure and scaffolding
- Core types and Zod schemas
- Document ingestion pipeline (PDF, Markdown, HTML, Text)
- Chunking strategies: fixed-size, semantic, recursive, sliding-window
- Vector retrieval with Qdrant integration
- BM25 sparse retrieval implementation
- Reranker engine with provider support (Cohere, Jina, OpenAI, local)
- Hybrid fusion strategies: RRF, weighted sum, normalized
- Evaluation framework with retrieval metrics
- Ablation study framework
- Benchmarking framework (latency, throughput, cost)
- MCP server with retrieval, ingestion, evaluation, and admin tools
- CLI tool with ingest, query, evaluate, ablate, benchmark commands
- Observability: OpenTelemetry tracing, metrics, structured logging
- Docker support with docker-compose for local development
- CI/CD workflows for testing and releases

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

---

## [0.1.0] - 2026-04-16

### Added
- Initial release with core RAG pipeline implementation
