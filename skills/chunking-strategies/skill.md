# Chunking Strategies

## Capability
Split documents into retrievable chunks with configurable strategies.

## Available Strategies

| Strategy | Best For | Pros | Cons |
|----------|----------|------|------|
| `fixed-size` | General purpose | Predictable, fast | May split semantic units |
| `semantic` | Long-form content | Preserves meaning | Slower, needs NLP |
| `recursive` | Structured docs | Preserves hierarchy | Complex |
| `sliding-window` | Dense retrieval | High overlap | More chunks |

## Usage

```typescript
import { ChunkingEngine, ChunkingStrategy } from 'hybrid-rag-qdrant';

const engine = new ChunkingEngine();

const result = engine.chunk(documentContent, documentId, {
  strategy: ChunkingStrategy.SEMANTIC,
  chunkSize: 512, // tokens for token-based, chars for others
  overlap: 50, // overlap between chunks
  seed: 42, // for deterministic IDs
});

console.log(result.chunks); // Array of chunks
console.log(result.stats);   // Chunking statistics
```

## Chunk ID Generation

```
chunk_id = hash(document_id + strategy + chunk_index + seed)
```

Deterministic IDs enable reproducible experiments and cache-friendly operations.

## Benchmarking

Use the benchmarking framework to compare strategies on your data:

```bash
npx hybrid-rag-qdrant benchmark chunking \
  --documents docs/ \
  --dataset eval-queries.jsonl \
  --strategies fixed-size,semantic,recursive,sliding-window
```

## Performance Characteristics

| Strategy | Speed | Chunks/1000 words | Quality (NDCG@10) |
|----------|-------|-------------------|-------------------|
| fixed-size (512) | Fast | ~8 | 0.72 |
| semantic | Medium | ~6 | 0.78 |
| recursive | Slow | ~7 | 0.76 |
| sliding-window (256/128) | Fast | ~15 | 0.74 |

*Numbers are illustrative; run ablation on your data for accurate results.*
