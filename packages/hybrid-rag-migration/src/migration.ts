import type { VectorStoreConfig, VectorStorePoint } from '@reaatech/hybrid-rag';
import { VectorStoreOperationError } from '@reaatech/hybrid-rag';
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

export interface MigrationOptions {
  dryRun?: boolean;
  validateDimensions?: boolean;
  continueOnError?: boolean;
  maxErrors?: number;
  targetCollectionExists?: 'fail' | 'append' | 'overwrite';
  idConflict?: 'skip' | 'overwrite' | 'fail';
  batchSize?: number;
  collection?: string;
}

export interface ExportOptions {
  collection?: string;
  batchSize?: number;
  dimension?: number;
}

export interface ImportOptions {
  batchSize?: number;
  continueOnError?: boolean;
}

export interface MigrationResult {
  sourceProvider: string;
  targetProvider: string;
  pointsMigrated: number;
  errors: Array<{ pointId: string; error: string }>;
  durationMs: number;
}

export interface ExportMetadata {
  type: 'metadata';
  format: 'hybrid-rag-vector-export';
  version: string;
  provider: string;
  collection: string;
  dimension: number;
  exportedAt: string;
}

export async function migrateVectors(
  sourceConfig: VectorStoreConfig,
  targetConfig: VectorStoreConfig,
  options?: MigrationOptions,
): Promise<MigrationResult> {
  const source = await createVectorStore(sourceConfig);
  const target = await createVectorStore(targetConfig);

  await source.initialize();
  await target.initialize();

  if (!source.scanPoints) {
    throw new VectorStoreOperationError(
      `Source provider '${sourceConfig.provider}' does not support scanning/iteration required for migration`,
      sourceConfig.provider,
      'scanPoints',
    );
  }

  if (options?.validateDimensions) {
    const srcInfo = await source.getCollectionInfo(options?.collection ?? 'documents');
    const tgtInfo = await target.getCollectionInfo(options?.collection ?? 'documents');
    if (srcInfo && tgtInfo && srcInfo.vectorDimension !== tgtInfo.vectorDimension) {
      throw new Error(
        `Vector dimension mismatch: source has dimension ${srcInfo.vectorDimension}, target has ${tgtInfo.vectorDimension}`,
      );
    }
  }

  if (options?.dryRun) {
    return {
      sourceProvider: sourceConfig.provider,
      targetProvider: targetConfig.provider,
      pointsMigrated: 0,
      errors: [],
      durationMs: 0,
    };
  }

  const startTime = performance.now();
  const errors: Array<{ pointId: string; error: string }> = [];
  let pointsMigrated = 0;

  const batchSize = options?.batchSize ?? 100;
  const collectionName = options?.collection ?? 'documents';

  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const result = await source.scanPoints(collectionName, { batchSize, cursor });

    if (pointsMigrated > 0 || result.points.length > 0) {
      try {
        await target.upsertBatch(result.points);
        pointsMigrated += result.points.length;
      } catch (err) {
        if (options?.continueOnError) {
          for (const point of result.points) {
            errors.push({ pointId: point.id, error: String(err) });
            if (options.maxErrors && errors.length >= options.maxErrors) {
              hasMore = false;
              break;
            }
          }
        } else {
          throw err;
        }
      }
    }

    cursor = result.nextCursor;
    hasMore = cursor !== undefined;
  }

  const durationMs = performance.now() - startTime;

  return {
    sourceProvider: sourceConfig.provider,
    targetProvider: targetConfig.provider,
    pointsMigrated,
    errors,
    durationMs,
  };
}

export async function exportVectors(
  config: VectorStoreConfig,
  outputPath: string,
  options?: ExportOptions,
): Promise<void> {
  const store = await createVectorStore(config);
  await store.initialize();

  if (!store.scanPoints) {
    throw new VectorStoreOperationError(
      `Provider '${config.provider}' does not support scanning required for export`,
      config.provider,
      'scanPoints',
    );
  }

  const collectionName = options?.collection ?? 'documents';
  const { writeFile, appendFile } = await import('node:fs/promises');

  const meta: ExportMetadata = {
    type: 'metadata',
    format: 'hybrid-rag-vector-export',
    version: '2.0.0',
    provider: config.provider,
    collection: collectionName,
    dimension: options?.dimension ?? 0,
    exportedAt: new Date().toISOString(),
  };

  await writeFile(outputPath, `${JSON.stringify(meta)}\n`, { mode: 0o600 });

  let cursor: string | undefined;
  let hasMore = true;
  const batchSize = options?.batchSize ?? 100;

  while (hasMore) {
    const result = await store.scanPoints(collectionName, { batchSize, cursor });
    const lines = result.points
      .map((p) => `${JSON.stringify({ type: 'point', point: p })}\n`)
      .join('');
    await appendFile(outputPath, lines);
    cursor = result.nextCursor;
    hasMore = cursor !== undefined;
  }
}

export async function importVectors(
  config: VectorStoreConfig,
  inputPath: string,
  options?: ImportOptions,
): Promise<MigrationResult> {
  const target = await createVectorStore(config);
  await target.initialize();

  const { readFile } = await import('node:fs/promises');
  const content = await readFile(inputPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) {
    throw new Error('Export file is empty');
  }

  const header = JSON.parse(lines[0]!);
  if (header.type !== 'metadata' || header.format !== 'hybrid-rag-vector-export') {
    throw new Error('Invalid export file format');
  }

  const startTime = performance.now();
  const errors: Array<{ pointId: string; error: string }> = [];
  let pointsMigrated = 0;
  const batchSize = options?.batchSize ?? 100;

  const points: VectorStorePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    try {
      const record = JSON.parse(line);
      if (record.type === 'point') {
        points.push(record.point as VectorStorePoint);
      }
    } catch (err) {
      if (options?.continueOnError) {
        errors.push({ pointId: `line-${i + 1}`, error: `Failed to parse: ${err}` });
      } else {
        throw new Error(`Failed to parse line ${i + 1}: ${err}`);
      }
    }

    if (points.length >= batchSize) {
      try {
        await target.upsertBatch(points);
        pointsMigrated += points.length;
        points.length = 0;
      } catch (err) {
        if (options?.continueOnError) {
          for (const p of points) {
            errors.push({ pointId: p.id, error: String(err) });
          }
          points.length = 0;
        } else {
          throw err;
        }
      }
    }
  }

  if (points.length > 0) {
    await target.upsertBatch(points);
    pointsMigrated += points.length;
  }

  const durationMs = performance.now() - startTime;

  return {
    sourceProvider: 'export',
    targetProvider: config.provider,
    pointsMigrated,
    errors,
    durationMs,
  };
}
