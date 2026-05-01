# @reaatech/hybrid-rag-ingestion

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-ingestion.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-ingestion)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Multi-format document loading, preprocessing, validation, and four configurable chunking strategies for hybrid RAG systems. Supports PDF, Markdown, HTML, and plain text with deterministic chunk ID generation.

## Installation

```bash
npm install @reaatech/hybrid-rag-ingestion
# or
pnpm add @reaatech/hybrid-rag-ingestion
```

## Feature Overview

- **Multi-format loading** — PDF, Markdown, HTML, and plain text with automatic format detection
- **Text preprocessing** — Unicode normalization, whitespace normalization, special character handling
- **Document validation** — duplicate detection via content hashing, file size limits, format verification
- **Four chunking strategies** — Fixed-Size, Semantic, Recursive, Sliding Window
- **Deterministic chunk IDs** — reproducible IDs based on document ID + chunk index
- **Chunking benchmarks** — compare strategies on your documents with measured quality
- **Typed errors** — `UnsupportedFormatError`, `FileSizeExceededError`, `DocumentParseError`

## Quick Start

```typescript
import {
  DocumentLoader,
  TextPreprocessor,
  DocumentValidator,
  chunkDocument,
  ChunkingStrategy,
} from '@reaatech/hybrid-rag-ingestion';

// Load a document
const loader = new DocumentLoader({ allowedFormats: ['pdf', 'md', 'html', 'txt'] });
const doc = await loader.loadFile('./docs/report.pdf');
console.log(`Loaded: ${doc.id}, ${doc.content.length} chars`);

// Validate
const validator = new DocumentValidator({ maxFileSize: 10 * 1024 * 1024 }); // 10MB
const validation = validator.validate(doc);

// Chunk
const chunks = await chunkDocument(
  doc.content,
  doc.id,
  {
    strategy: ChunkingStrategy.SEMANTIC,
    chunkSize: 512,
    overlap: 50,
    similarityThreshold: 0.5,
  },
  doc.metadata,
);
```

## API Reference

### Document Loading

#### `DocumentLoader`

| Constructor Option | Type | Default | Description |
|--------------------|------|---------|-------------|
| `allowedFormats` | `string[]` | `['pdf','md','html','txt']` | Whitelist of accepted formats |

| Method | Returns | Description |
|--------|---------|-------------|
| `loadFile(filePath)` | `Document` | Load and parse a single file |
| `loadDirectory(dirPath)` | `Document[]` | Load all supported files in a directory |

#### Custom Errors

| Error | When |
|-------|------|
| `UnsupportedFormatError` | File format not in `allowedFormats` |
| `FileSizeExceededError` | File exceeds `maxFileSize` limit |
| `DocumentParseError` | Parse failure for the detected format |

### Preprocessing

#### `TextPreprocessor`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `normalizeUnicode` | `boolean` | `true` | Normalize to NFC form |
| `normalizeWhitespace` | `boolean` | `true` | Collapse multiple spaces, normalize newlines |
| `removeControlChars` | `boolean` | `true` | Strip non-printable control characters |

### Validation

#### `DocumentValidator`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxFileSize` | `number` | `10 * 1024 * 1024` | Max file size in bytes |
| `minContentLength` | `number` | `1` | Minimum document content length |

#### `ValidationResult`

| Property | Type | Description |
|----------|------|-------------|
| `valid` | `boolean` | Whether the document passed all checks |
| `errors` | `string[]` | List of validation error messages |

### Chunking Strategies

All strategies produce `Chunk[]` with deterministic IDs.

#### Fixed-Size

Splits by token count, word count, or character count with configurable overlap.

```typescript
const chunks = await chunkDocument(content, docId, {
  strategy: ChunkingStrategy.FIXED_SIZE,
  chunkSize: 512,  // tokens
  overlap: 50,
});
```

| Parameter | Description |
|-----------|-------------|
| `chunkSize` | Target size in tokens |
| `overlap` | Overlap between consecutive chunks in tokens |

#### Semantic

Splits at topic boundaries using sentence-level similarity. Best for long-form content.

```typescript
const chunks = await chunkDocument(content, docId, {
  strategy: ChunkingStrategy.SEMANTIC,
  chunkSize: 512,
  overlap: 50,
  similarityThreshold: 0.5,
});
```

| Parameter | Description |
|-----------|-------------|
| `similarityThreshold` | Minimum similarity for boundary detection (0–1) |

#### Recursive

Hierarchical splitting: headers → paragraphs → sentences. Best for structured documents.

```typescript
const chunks = await chunkDocument(content, docId, {
  strategy: ChunkingStrategy.RECURSIVE,
  chunkSize: 512,
  separators: ['\n## ', '\n', '. '],
});
```

| Parameter | Description |
|-----------|-------------|
| `separators` | Splitting delimiters in priority order |

#### Sliding Window

Fixed window moving by configurable stride. Best for dense retrieval scenarios.

```typescript
const chunks = await chunkDocument(content, docId, {
  strategy: ChunkingStrategy.SLIDING_WINDOW,
  windowSize: 512,
  stride: 256,
});
```

| Parameter | Description |
|-----------|-------------|
| `windowSize` | Size of each window in tokens |
| `stride` | Step size between windows in tokens |

### Chunking Engine

#### `ChunkingEngine`

Orchestrator that routes to the correct strategy:

| Method | Description |
|--------|-------------|
| `chunkDocument(content, docId, config, metadata?)` | Main entry point — returns `Chunk[]` |
| `chunkBatch(documents, config)` | Process multiple documents in sequence |

#### `ChunkingBenchmark`

Compare strategies head-to-head:

```typescript
import { ChunkingBenchmark } from '@reaatech/hybrid-rag-ingestion';

const benchmark = new ChunkingBenchmark();
const results = await benchmark.benchmark(documents, [
  { name: 'fixed-512', config: { strategy: ChunkingStrategy.FIXED_SIZE, chunkSize: 512, overlap: 50 } },
  { name: 'semantic-512', config: { strategy: ChunkingStrategy.SEMANTIC, chunkSize: 512, overlap: 50 } },
]);

console.table(results.map(r => ({ name: r.name, chunkCount: r.chunkCount, avgTokens: r.avgTokens })));
```

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types (`Document`, `Chunk`, `ChunkingConfig`)
- [@reaatech/hybrid-rag-retrieval](https://www.npmjs.com/package/@reaatech/hybrid-rag-retrieval) — Retrieval engines (consume chunks)
- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline orchestrator

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
