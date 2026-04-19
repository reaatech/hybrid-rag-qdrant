# CLAUDE.md — Development Guide for hybrid-rag-qdrant

This document provides guidance for AI assistants (Claude, etc.) working on this codebase.

## Project Overview

This is a production-grade hybrid RAG (Retrieval-Augmented Generation) reference implementation featuring:
- Vector + BM25 + Reranker hybrid retrieval
- Multiple chunking strategies with benchmarking
- Comprehensive evaluation framework
- Ablation study capabilities
- MCP server with 42+ tools for agent integration
- Full observability with OpenTelemetry

## Development Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Testing
npm test                    # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run test:integration  # Integration tests only
npm run test:perf         # Performance tests

# Clean build artifacts
npm run clean
```

## Project Structure

```
src/
├── types/           # Domain types and Zod schemas
├── ingestion/       # Document loading, validation, preprocessing
├── chunking/        # Chunking strategies and engine
├── retrieval/       # Vector, BM25, reranker, fusion
├── evaluation/      # Metrics, dataset loading, runner, ablation
├── benchmarking/    # Latency, throughput, cost benchmarking
├── mcp-server/      # MCP server and tools (42+ tools)
├── observability/   # Tracing, metrics, logging, dashboard
├── cli/             # CLI commands
└── index.ts         # Main entry point

tests/
├── unit/            # Unit tests
└── integration/     # Integration tests

skills/              # Agent skills documentation
datasets/            # Example evaluation datasets
infra/               # Infrastructure (Docker, Terraform)
```

## Key Architectural Decisions

1. **Provider-Agnostic Design**: Embeddings and rerankers are swappable via provider interfaces
2. **Deterministic Chunking**: Same document + config = same chunks (seed-based IDs)
3. **Hybrid Retrieval**: Combines semantic (vector) and keyword (BM25) search with configurable fusion
4. **Cost Tracking**: All API costs are tracked and reported per query
5. **Full Observability**: OpenTelemetry integration for tracing, metrics, and logging

## MCP Tools Categories

The MCP server exposes 42+ tools across 7 categories:

1. **Query Analysis** (3 tools) - Intent analysis, query decomposition
2. **Session Management** (3 tools) - Multi-turn conversation context
3. **Agent Integration** (4 tools) - Agent discovery and routing
4. **Cost Management** (6 tools) - Budgeting and cost optimization
5. **Quality Tools** (6 tools) - LLM-as-judge, hallucination detection
6. **Observability** (6 tools) - Metrics, tracing, health checks
7. **Scheduling** (14 tools) - Cal.com integration

## Testing Guidelines

- All new features must have unit tests
- Integration tests for end-to-end workflows
- Minimum 80% code coverage required
- Use vitest for all testing

## Code Style

- TypeScript strict mode
- ESLint with typescript-eslint
- Prettier for formatting (single quotes, 2-space indent)
- No console.log in production code (use pino logger)

## Environment Variables

Required environment variables:
- `QDRANT_URL` - Qdrant server URL (default: http://localhost:6333)
- `OPENAI_API_KEY` - For embeddings and reranking
- `COHERE_API_KEY` - For Cohere reranker (optional)
- `JINA_API_KEY` - For Jina reranker (optional)

## Common Tasks

### Adding a New Chunking Strategy
1. Create `src/chunking/strategies/new-strategy.ts`
2. Implement the `ChunkingStrategy` interface
3. Add to the chunking engine
4. Write unit tests
5. Update documentation

### Adding a New MCP Tool
1. Create or update tool file in `src/mcp-server/tools/`
2. Define tool with name, description, inputSchema, and handler
3. Register in `src/mcp-server/mcp-server.ts`
4. Write integration tests
5. Update README.md

### Adding a New Evaluation Metric
1. Add metric function to `src/evaluation/metrics/retrieval.ts` or `generation.ts`
2. Export from metrics index
3. Write unit tests
4. Update evaluation runner if needed

## Debugging

- Use the `rag.get_trace` MCP tool to retrieve OpenTelemetry traces
- Check logs with `pino-pretty` for formatted output
- Use `rag.health_check` for system status
- Dashboard metrics available via `rag.get_metrics`

## Performance Targets

| Metric | Target |
|--------|--------|
| P50 latency (no rerank) | < 300ms |
| P90 latency (no rerank) | < 700ms |
| P99 latency (no rerank) | < 1500ms |
| Cost per query (no rerank) | < $0.005 |

## Contributing

1. Create feature branch
2. Implement changes with tests
3. Run `npm run lint && npm run typecheck && npm test`
4. Submit PR with description of changes
5. All CI checks must pass

## Resources

- [README.md](./README.md) - Main documentation
- [AGENTS.md](./AGENTS.md) - Agent development guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design deep dive
- [DEV_PLAN.md](./DEV_PLAN.md) - Development roadmap
- [skills/](./skills/) - Detailed skill documentation
