# BM25 Retrieval

## Capability
Keyword-based sparse retrieval using BM25 algorithm.

## Algorithm

BM25 scores documents based on term frequency and inverse document frequency:

```
Score = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
```

Default parameters: `k1 = 1.2`, `b = 0.75`

## Usage

```typescript
import { BM25Retriever } from '@reaatech/hybrid-rag-retrieval';

const retriever = new BM25Retriever({
  k1: 1.2,
  b: 0.75,
  indexFilePath: './bm25-index.json',
});

// Build index
await retriever.buildIndex(documents);

// Search
const results = await retriever.search('password reset instructions', {
  topK: 10,
});
```

## Tokenization Options

```typescript
const retriever = new BM25Retriever({
  removeStopWords: true,
  stemmer: 'compromise',
  ngramRange: [1, 2], // unigrams and bigrams
  minDocumentFrequency: 2,
  maxDocumentFrequency: 0.95,
});
```

## Incremental Updates

```typescript
// Add new documents
await retriever.addDocuments(newDocs);

// Remove documents
await retriever.removeDocuments(['doc-123', 'doc-456']);

// Rebuild index
await retriever.rebuild();
```

## Persistence

Index is persisted to disk by default:

```typescript
// Save index
await retriever.save('./my-bm25-index.json');

// Load existing index
await retriever.load('./my-bm25-index.json');
```

## Performance

BM25 is extremely fast (~10ms for 100K documents) and captures exact keyword matches that vector search may miss.
