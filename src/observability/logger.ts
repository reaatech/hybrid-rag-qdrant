/**
 * Structured logging for hybrid-rag-qdrant
 */

import pino from 'pino';

/**
 * Log level configuration
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Log level */
  level?: LogLevel;
  /** Enable pretty print (for development) */
  prettyPrint?: boolean;
  /** Include query ID in all logs */
  includeQueryId?: boolean;
}

/**
 * Common log fields
 */
export interface LogFields {
  /** Query ID for request tracing */
  queryId?: string;
  /** Operation name */
  operation?: string;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Number of results */
  resultsCount?: number;
  /** Embedding cost */
  embeddingCost?: number;
  /** Reranker cost */
  rerankerCost?: number;
  /** Total cost */
  totalCost?: number;
}

/**
 * Create a structured logger
 */
export function createLogger(config: LoggerConfig = {}): pino.Logger {
  const options: pino.LoggerOptions = {
    level: config.level ?? 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (config.prettyPrint) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    };
  }

  return pino(options);
}

/**
 * Create a child logger with query context
 */
export function createQueryLogger(
  parent: pino.Logger,
  queryId: string,
): pino.Logger {
  return parent.child({ queryId });
}

/**
 * Log a query start
 */
export function logQueryStart(
  logger: pino.Logger,
  queryId: string,
  query: string,
): void {
  logger.info(
    {
      queryId,
      operation: 'query_start',
      query: query.substring(0, 100), // Truncate for privacy
    },
    'Query started',
  );
}

/**
 * Log a query completion
 */
export function logQueryComplete(
  logger: pino.Logger,
  queryId: string,
  fields: LogFields,
): void {
  logger.info(
    {
      queryId,
      operation: 'query_complete',
      ...fields,
    },
    'Query completed',
  );
}

/**
 * Log a query error
 */
export function logQueryError(
  logger: pino.Logger,
  queryId: string,
  error: Error,
): void {
  logger.error(
    {
      queryId,
      operation: 'query_error',
      error: error.message,
      stack: error.stack,
    },
    'Query failed',
  );
}

/**
 * Log ingestion start
 */
export function logIngestionStart(
  logger: pino.Logger,
  documentCount: number,
): void {
  logger.info(
    {
      operation: 'ingestion_start',
      documentCount,
    },
    'Document ingestion started',
  );
}

/**
 * Log ingestion completion
 */
export function logIngestionComplete(
  logger: pino.Logger,
  documentCount: number,
  chunkCount: number,
  latencyMs: number,
): void {
  logger.info(
    {
      operation: 'ingestion_complete',
      documentCount,
      chunkCount,
      latencyMs,
    },
    'Document ingestion completed',
  );
}

/**
 * Log evaluation results
 */
export function logEvaluationResults(
  logger: pino.Logger,
  metrics: Record<string, number>,
): void {
  logger.info(
    {
      operation: 'evaluation_complete',
      ...metrics,
    },
    'Evaluation completed',
  );
}

/**
 * Global logger instance
 */
let globalLogger: pino.Logger | null = null;

/**
 * Get or create the global logger
 */
export function getLogger(): pino.Logger {
  if (!globalLogger) {
    globalLogger = createLogger({
      level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
      prettyPrint: process.env.NODE_ENV !== 'production',
    });
  }
  return globalLogger;
}
