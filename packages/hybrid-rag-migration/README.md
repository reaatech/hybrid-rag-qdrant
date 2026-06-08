# @reaatech/hybrid-rag-migration

Cross-vector-database migration tools for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-migration
```

## Usage

```typescript
import { migrateVectors } from '@reaatech/hybrid-rag-migration';

const result = await migrateVectors(
  { provider: 'qdrant', url: '...', collectionName: 'docs', vectorSize: 1536 },
  { provider: 'pinecone', apiKey: '...', indexName: 'my-index' },
  { batchSize: 100, collection: 'docs' },
);

console.log(`Migrated ${result.pointsMigrated} points in ${result.durationMs}ms`);
```

## Export/Import

```typescript
import { exportVectors, importVectors } from '@reaatech/hybrid-rag-migration';

await exportVectors(
  { provider: 'qdrant', url: '...', collectionName: 'docs', vectorSize: 1536 },
  './export.ndjson',
);

await importVectors(
  { provider: 'pinecone', apiKey: '...', indexName: 'my-index' },
  './export.ndjson',
);
```

## Migration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `batchSize` | number | 100 | Number of points per batch |
| `collection` | string | — | Source collection to migrate |
| `dryRun` | boolean | false | Validate without writing |
| `continueOnError` | boolean | false | Skip failed points and continue |
| `maxErrors` | number | 10 | Stop after this many errors |
| `validateDimensions` | boolean | true | Check source/target dimension match |
| `idConflict` | `'skip' \| 'overwrite' \| 'fail'` | `'fail'` | How to handle conflicting IDs |

## Limitations

- Source adapter must support `scanPoints()` for migration (Pinecone, Vespa do not)
- File export format is NDJSON (one JSON object per line)
- Export files contain raw payloads and vectors — treat as sensitive data

## Links

- [hybrid-rag Documentation](https://github.com/reaatech/hybrid-rag)
