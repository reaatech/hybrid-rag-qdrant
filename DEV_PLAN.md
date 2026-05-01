# DEV_PLAN.md — hybrid-rag-qdrant

## Overview

A serious hybrid RAG reference implementation: vector + BM25 + reranker, chunking strategies benchmarked, eval set included, ablation results in the README. Most public RAG repos are toys; this one has measured numbers.

**Target audience:** Engineering teams building production RAG systems who need a battle-tested reference architecture with real performance data, reproducible benchmarks, and enterprise-grade reliability.

**Repo type:** Public open-source reference implementation on GitHub.

---

## Phase 0: Project Scaffolding
- [x] `npm init` — package.json (name: `hybrid-rag-qdrant`, license: MIT, keywords: rag, hybrid-retrieval, qdrant, bm25, reranker, evaluation, benchmarking, mcp)
- [x] TypeScript config — `tsconfig.json` (strict, ESM, NodeNext module resolution)
- [x] ESLint config — `eslint.config.mjs` (flat config, typescript-eslint, no-console rule)
- [x] Prettier config — `.prettierrc` (single quotes, trailing commas, 2-space indent)
- [x] `.gitignore` — node_modules, dist, .env, coverage, .DS_Store, *.log, reports/, datasets/, models/
- [x] `.nvmrc` — pin Node 22 LTS
- [x] `.env.example` — all env vars with placeholder values (no real secrets)
- [x] Husky + lint-staged — pre-commit hook (lint + typecheck + test)
- [x] Vitest config — `vitest.config.ts` (ESM support, coverage thresholds: 80%)
- [x] Directory structure created

## Phase 1: Core Types & Schemas
- [x] `src/types/domain.ts` — Core domain types (Document, Chunk, ChunkingStrategy, VectorQuery, BM25Query, RetrievalResult, HybridResult, RerankedResult, EvaluationSample, EvaluationResult, AblationConfig, BenchmarkResult)
- [x] `src/types/schemas.ts` — Zod schemas (DocumentSchema, ChunkSchema, ChunkingStrategySchema, EvaluationSampleSchema, AblationConfigSchema)
- [x] `src/types/index.ts` — Re-exports and barrel exports

## Phase 2: Document Ingestion Pipeline
- [x] `src/ingestion/loader.ts` — Multi-format document loading (PDF, Markdown, Plain text, HTML)
- [x] `src/ingestion/validator.ts` — Document validation (file size, content type, encoding, duplicate detection)
- [x] `src/ingestion/preprocessor.ts` — Text preprocessing (Unicode normalization, whitespace, headers/footers)
- [x] `src/ingestion/index.ts` — Module exports
- [x] Unit tests for ingestion components

## Phase 3: Chunking Strategies
- [x] `src/chunking/strategies/fixed-size.ts` — Fixed-size chunking (character, word, token-based)
- [x] `src/chunking/strategies/semantic.ts` — Semantic chunking (sentence, paragraph, topic boundaries)
- [x] `src/chunking/strategies/recursive.ts` — Recursive character chunking (hierarchical splitting)
- [x] `src/chunking/strategies/sliding-window.ts` — Sliding window chunking
- [x] `src/chunking/engine.ts` — Chunking orchestration with deterministic IDs
- [x] `src/chunking/benchmark.ts` — Chunking strategy benchmarking
- [x] `src/chunking/index.ts` — Module exports
- [x] Unit tests for chunking components

## Phase 4: Vector Retrieval (Qdrant)
- [x] `src/retrieval/vector/qdrant-client.ts` — Qdrant client wrapper
- [x] `src/retrieval/vector/embedding.ts` — Embedding generation (provider-agnostic)
- [x] `src/retrieval/vector/search.ts` — Vector search with filtering
- [x] `src/retrieval/vector/index.ts` — Index management
- [x] Unit tests for vector retrieval components

## Phase 5: BM25 Sparse Retrieval
- [x] `src/retrieval/bm25/engine.ts` — BM25 implementation with configurable k1, b
- [x] `src/retrieval/bm25/tokenizer.ts` — Text tokenization (stop words, stemming, n-grams)
- [x] `src/retrieval/bm25/search.ts` — BM25 search and scoring
- [x] `src/retrieval/bm25/index.ts` — Index management and persistence
- [x] Unit tests for BM25 components

## Phase 6: Reranker (Cross-Encoder)
- [x] `src/retrieval/reranker/engine.ts` — Reranking engine (provider-agnostic)
- [x] `src/retrieval/reranker/providers/cohere.ts` — Cohere reranker integration
- [x] `src/retrieval/reranker/providers/jina.ts` — Jina reranker integration
- [x] `src/retrieval/reranker/providers/openai.ts` — OpenAI reranker integration
- [x] `src/retrieval/reranker/providers/local.ts` — Local reranker (no API cost)
- [x] `src/retrieval/reranker/index.ts` — Module exports
- [x] Unit tests for reranker components

## Phase 7: Hybrid Fusion Strategies
- [x] `src/retrieval/fusion/strategies.ts` — RRF, weighted sum, normalized fusion
- [x] `src/retrieval/fusion/engine.ts` — Fusion orchestration
- [x] `src/retrieval/fusion/normalization.ts` — Score normalization
- [x] `src/retrieval/fusion/index.ts` — Module exports
- [x] Unit tests for fusion components

## Phase 8: Evaluation Framework
- [x] `src/evaluation/metrics/retrieval.ts` — Precision@K, Recall@K, MAP, MRR, NDCG
- [x] `src/evaluation/metrics/index.ts` — Metrics exports
- [x] `src/evaluation/dataset/loader.ts` — Evaluation dataset loading (JSONL, YAML config)
- [x] `src/evaluation/dataset/index.ts` — Dataset exports
- [x] `src/evaluation/runner.ts` — Evaluation execution
- [x] `src/evaluation/index.ts` — Module exports
- [x] `src/evaluation/metrics/generation.ts` — Generation metrics (faithfulness, relevance)
- [x] `src/evaluation/dataset/generator.ts` — Synthetic eval dataset generation
- [x] Unit tests for evaluation components

## Phase 9: Ablation Study Framework
- [x] `src/evaluation/ablation/config.ts` — Ablation configuration
- [x] `src/evaluation/ablation/runner.ts` — Ablation study execution
- [x] `src/evaluation/ablation/reporter.ts` — Results reporting (markdown tables)
- [x] `src/evaluation/ablation/index.ts` — Module exports
- [x] Unit tests for ablation components

## Phase 10: Benchmarking Framework
- [x] `src/benchmarking/latency.ts` — Latency benchmarking (P50, P90, P95, P99)
- [x] `src/benchmarking/throughput.ts` — Throughput benchmarking (QPS, concurrency)
- [x] `src/benchmarking/cost.ts` — Cost benchmarking and tracking
- [x] `src/benchmarking/reporter.ts` — Benchmark reporting
- [x] `src/benchmarking/index.ts` — Module exports
- [x] Unit tests for benchmarking components

## Phase 11: MCP Server — Core RAG Tools
- [x] `src/mcp-server/mcp-server.ts` — MCP server implementation
- [x] `src/mcp-server/tools/retrieval.ts` — Retrieval tools (rag.retrieve, rag.vector_search, rag.bm25_search, rag.rerank)
- [x] `src/mcp-server/tools/ingestion.ts` — Ingestion tools (rag.ingest_document, rag.ingest_batch, rag.chunk_document)
- [x] `src/mcp-server/tools/evaluation.ts` — Evaluation tools (rag.evaluate, rag.ablation, rag.benchmark)
- [x] `src/mcp-server/tools/admin.ts` — Admin tools (rag.status, rag.collections, rag.config)
- [x] MCP server integration tests

## Phase 11b: MCP Server — Agent Workflow Tools
- [x] `src/mcp-server/tools/query-analysis.ts` — Query analysis tools:
  - `rag.analyze_query` — Query intent analysis and routing recommendation
  - `rag.decompose_query` — Multi-step query decomposition for complex questions
  - `rag.classify_intent` — Classify query intent for optimal retrieval strategy
- [x] `src/mcp-server/tools/session-management.ts` — Session management tools:
  - `rag.get_context` — Retrieve conversation context for multi-turn RAG
  - `rag.session_manage` — Create, update, and manage RAG sessions
  - `rag.session_history` — Retrieve session query history
- [x] `src/mcp-server/tools/agent-integration.ts` — Agent integration tools:
  - `rag.discover_agents` — Discover available agents in agent-mesh
  - `rag.route_to_agent` — Route query to specialized agent based on intent
  - `rag.get_agent_capabilities` — Query capabilities of registered agents
  - `rag.register_callback` — Register callback for async agent responses

## Phase 11c: MCP Server — Cost Management Tools
- [x] `src/mcp-server/tools/cost-management.ts` — Cost management tools:
  - `rag.get_cost_estimate` — Estimate cost for a query before execution
  - `rag.set_budget` — Configure budget limits (per-query, daily, monthly)
  - `rag.get_budget_status` — Current budget status and remaining capacity
  - `rag.optimize_cost` — Get cost optimization recommendations
  - `rag.get_cost_report` — Detailed cost breakdown by component
  - `rag.set_cost_controls` — Configure cost controls and alerts

## Phase 11d: MCP Server — Quality & Evaluation Tools
- [x] `src/mcp-server/tools/quality-tools.ts` — Quality assurance tools:
  - `rag.judge_quality` — LLM-as-judge for result quality assessment
  - `rag.validate_results` — Validate retrieval results against quality criteria
  - `rag.detect_hallucination` — Detect potential hallucinations in results
  - `rag.compare_configs` — A/B test different RAG configurations
  - `rag.get_quality_metrics` — Real-time quality metrics dashboard
  - `rag.run_quality_check` — Automated quality check for production queries

## Phase 11e: MCP Server — Observability Tools
- [x] `src/mcp-server/tools/observability-tools.ts` — Observability tools:
  - `rag.get_metrics` — Real-time system metrics (latency, throughput, errors)
  - `rag.get_trace` — Retrieve OpenTelemetry trace for a query
  - `rag.health_check` — Comprehensive system health status
  - `rag.get_performance` — Performance analytics and trends
  - `rag.get_collection_stats` — Statistics for specific collections
  - `rag.monitor_alerts` — Active alerts and monitoring status

## Phase 11f: MCP Server — Integration & Testing
- [x] MCP server integration tests for all tool categories
- [x] Agent-to-agent communication tests
- [x] Cost management enforcement tests
- [x] Quality tool validation tests
- [x] MCP protocol compliance tests
- [x] StreamableHTTP transport tests

## Phase 11g: MCP Server — Scheduling Tools (Cal.com Integration)
- [x] `src/mcp-server/tools/scheduling.ts` — Cal.com scheduling tools:
  - `cal.list_availability` — Check available time slots for scheduling
  - `cal.book_meeting` — Create a new booking/meeting
  - `cal.cancel_booking` — Cancel an existing booking
  - `cal.reschedule` — Reschedule an existing booking
  - `cal.get_event_types` — List available event types
  - `cal.get_booking_details` — Retrieve booking information
  - `cal.list_bookings` — List bookings with filters (date range, event type, status)
  - `cal.create_event_type` — Create new event type (admin)
  - `cal.update_event_type` — Update event type configuration (admin)
  - `cal.delete_event_type` — Delete event type (admin)
  - `cal.get_teams` — List teams for team scheduling
  - `cal.get_routing_forms` — List routing forms for intelligent scheduling
  - `cal.check_availability` — Check if specific time slot is available
  - `cal.get_calendar` — Retrieve calendar events
- [x] Cal.com API client implementation
- [x] OAuth authentication handling for Cal.com
- [x] Webhook handling for booking events
- [x] Scheduling tool integration tests

## Phase 12: Observability
- [x] `src/observability/tracing.ts` — OpenTelemetry tracing
- [x] `src/observability/metrics.ts` — OTel metrics
- [x] `src/observability/logger.ts` — Structured logging (pino)
- [x] `src/observability/dashboard.ts` — Dashboard metrics

## Phase 13: Testing
- [x] Unit tests for all modules (vitest):
  - [x] tests/unit/chunking.test.ts
  - [x] tests/unit/vector-retrieval.test.ts
  - [x] tests/unit/bm25-retrieval.test.ts
  - [x] tests/unit/reranker.test.ts
  - [x] tests/unit/fusion.test.ts
  - [x] tests/unit/evaluation.test.ts
  - [x] tests/unit/ablation.test.ts
  - [x] tests/unit/benchmarking.test.ts
- [x] Integration tests:
  - [x] tests/integration/rag-pipeline.test.ts
  - [x] tests/integration/qdrant.test.ts
  - [x] tests/integration/hybrid-retrieval.test.ts
  - [x] tests/integration/evaluation.test.ts
- [x] Coverage gate: 80% minimum

## Phase 14: CLI Tool
- [x] `src/cli/` — Command-line interface with all commands
- [x] `src/cli/commands/ingest.ts` — Ingest implementation
- [x] `src/cli/commands/query.ts` — Query implementation
- [x] `src/cli/commands/evaluate.ts` — Evaluate implementation
- [x] `src/cli/commands/ablate.ts` — Ablate implementation
- [x] `src/cli/commands/benchmark.ts` — Benchmark implementation
- [x] `src/cli/commands/chunk.ts` — Chunking preview
- [~] CLI excluded from build (tsconfig exclude) — WIP: needs API integration fixes

## Phase 15: Infrastructure
- [x] `Dockerfile` — Multi-stage build
- [x] `.dockerignore`
- [x] `docker-compose.yml` — Local dev with Qdrant
- [x] `infra/modules/cloud-run/` — Cloud Run module
- [x] `infra/environments/dev/` — Dev environment Terraform
- [x] `infra/environments/prod/` — Prod environment Terraform

## Phase 16: CI/CD
- [x] `.github/workflows/ci.yml` — PR checks
- [x] `.github/workflows/release.yml` — Tag-triggered release
- [x] `.github/workflows/eval.yml` — Evaluation workflow

## Phase 17: Documentation
- [x] `README.md` — Flagship document with quick start, architecture, examples
- [x] `CLAUDE.md` — Development guide
- [x] `AGENTS.md` — Agent development guide (provided)
- [x] `ARCHITECTURE.md` — System design deep dive (provided)
- [x] `datasets/examples/sample.jsonl` — Example eval dataset
- [x] `datasets/examples/config.yaml` — Example eval config
- [x] `datasets/examples/gates.yaml` — Example quality gates

## Phase 18: Skills Directory
- [x] `skills/document-ingestion/skill.md` — Document ingestion skill
- [x] `skills/chunking-strategies/skill.md` — Chunking strategies skill
- [x] `skills/vector-retrieval/skill.md` — Vector retrieval skill
- [x] `skills/bm25-retrieval/skill.md` — BM25 retrieval skill
- [x] `skills/reranker/skill.md` — Reranker skill
- [x] `skills/hybrid-fusion/skill.md` — Hybrid fusion skill
- [x] `skills/rag-evaluation/skill.md` — RAG evaluation skill
- [x] `skills/ablation-studies/skill.md` — Ablation studies skill
- [x] `skills/benchmarking/skill.md` — Benchmarking skill
- [x] `skills/query-analysis/skill.md` — Query intent analysis and decomposition
- [x] `skills/cost-management/skill.md` — Cost tracking, budgeting, and optimization
- [x] `skills/agent-integration/skill.md` — Multi-agent orchestration and agent-mesh integration
- [x] `skills/quality-scoring/skill.md` — LLM-as-judge for RAG quality assurance
- [x] `skills/session-management/skill.md` — Multi-turn conversation context management
- [x] `skills/scheduling-integration/skill.md` — Cal.com scheduling integration for meeting booking

## Phase 19: Polish & Launch
- [x] Template repo configuration
- [x] `CONTRIBUTING.md` — Contribution guidelines
- [x] `CHANGELOG.md` — Version history
- [x] Review for proprietary references (must be zero)
- [x] End-to-end walkthrough
- [x] Final README review

---

## Completed Core Implementation

The following core components are fully implemented:

### Types & Schemas
- Domain types for all entities
- Zod schemas for validation

### Ingestion Pipeline
- Multi-format document loading (PDF, MD, HTML, TXT)
- Validation and preprocessing

### Chunking Strategies
- Fixed-size (character, word, token)
- Semantic (sentence, paragraph, topic)
- Recursive (hierarchical)
- Sliding window

### Retrieval Engine
- Vector retrieval with Qdrant
- BM25 sparse retrieval
- Hybrid fusion (RRF, weighted, normalized)
- Reranking (Cohere, Jina, OpenAI, local)

### Evaluation Framework
- Retrieval metrics (Precision@K, Recall@K, MAP, MRR, NDCG)
- Dataset loading and management
- Evaluation runner
- Ablation study framework

### Benchmarking
- Latency benchmarking with percentiles
- Throughput benchmarking with concurrency
- Cost tracking and calculation
- Report generation

### Main Interfaces
- `RAGPipeline` — Main entry point
- CLI with all commands

---

## Dependency Budget

| Package | Purpose | Status |
|---------|---------|--------|
| `@modelcontextprotocol/sdk` | MCP protocol | ✅ Installed |
| `qdrant-js` | Qdrant client | ✅ Installed |
| `zod` | Schema validation | ✅ Installed |
| `pino` | Logging | ✅ Installed |
| `@opentelemetry/*` | Observability | ✅ Installed |
| `openai` | OpenAI client | ✅ Installed |
| `tiktoken` | Token counting | ✅ Installed |
| `pdf-parse` | PDF parsing | ✅ Installed |
| `cheerio` | HTML parsing | ✅ Installed |
| `marked` | Markdown parsing | ✅ Installed |
| `commander` | CLI framework | ✅ Installed |
| `yaml` | YAML parsing | ✅ Installed |
| `vitest` | Testing | ✅ Installed |

---

## Key Invariants

1. **Deterministic chunking** — same document + config = same chunks (seed-based)
2. **Reproducible evaluation** — same dataset + config = same metrics
3. **Cost transparency** — all API costs tracked and reported
4. **Provider-agnostic** — embeddings and rerankers are swappable
5. **No PII in logs** — never log raw document content
6. **Benchmark reproducibility** — benchmarks include environment details
7. **Agent interoperability** — all MCP tools follow standard patterns for agent-mesh compatibility
8. **Budget enforcement** — cost controls and budget limits are never exceeded
9. **Quality assurance** — retrieval results can be validated via LLM-as-judge
10. **Graceful degradation** — fallback chains for agent and retrieval failures
11. **Full observability** — every query and agent interaction is traceable
12. **Session persistence** — multi-turn conversations maintain context across requests
