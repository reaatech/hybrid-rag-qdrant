# Contributing to hybrid-rag-qdrant

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22+ (use `.nvmrc` for version)
- npm or pnpm
- Docker (for local testing with Qdrant)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/reaatech/hybrid-rag-qdrant.git
cd hybrid-rag-qdrant

# Install dependencies
npm install

# Start Qdrant for development
docker run -d -p 6333:6333 qdrant/qdrant
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your API keys
```

## Development Workflow

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests (requires Qdrant)
npm run test:integration

# With coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Lint
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Building

```bash
# Build the project
npm run build

# Watch mode for development
npm run dev
```

## Adding New Features

### New Chunking Strategy

1. Create `src/chunking/strategies/your-strategy.ts`
2. Implement the `ChunkingStrategy` interface
3. Add tests in `tests/unit/chunking.test.ts`
4. Update documentation

### New Retrieval Provider

1. Create `src/retrieval/vector/providers/your-provider.ts`
2. Implement the `EmbeddingProvider` interface
3. Add configuration options
4. Update tests

### New Reranker

1. Create `src/retrieval/reranker/providers/your-provider.ts`
2. Implement the `RerankerProvider` interface
3. Add cost tracking
4. Update tests

## Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Prettier with 2-space indentation
- **Linting**: ESLint with TypeScript support
- **Imports**: Use `.js` extension for ESM compatibility

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass
4. Update documentation if needed
5. Submit a PR with a clear description

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Lint checks pass
- [ ] Type checking passes
- [ ] No proprietary references

## Evaluation Contributions

When making changes that affect retrieval quality:

1. Run the evaluation workflow (triggered on PR)
2. Compare metrics against baseline
3. Document any expected metric changes

## Questions?

Open an issue for discussion before starting large changes.
