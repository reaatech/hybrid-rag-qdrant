/**
 * Unit tests for observability/logger
 */

import { describe, it, expect, vi } from 'vitest';

describe('observability/logger', async () => {
  const {
    createLogger,
    createQueryLogger,
    logQueryStart,
    logQueryComplete,
    logQueryError,
    logIngestionStart,
    logIngestionComplete,
    logEvaluationResults,
    getLogger,
  } = await import('../../../src/observability/logger.js');

  describe('createLogger', () => {
    it('should create logger with default config', () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    });

    it('should create logger with custom level', () => {
      const logger = createLogger({ level: 'debug' });
      expect(logger.level).toBe('debug');
    });

    it('should create logger with trace level', () => {
      const logger = createLogger({ level: 'trace' });
      expect(logger.level).toBe('trace');
    });

    it('should create logger with error level', () => {
      const logger = createLogger({ level: 'error' });
      expect(logger.level).toBe('error');
    });
  });

  describe('createQueryLogger', () => {
    it('should create child logger with queryId', () => {
      const parent = createLogger();
      const child = createQueryLogger(parent, 'test-query-123');
      expect(child).toBeDefined();
    });

    it('should inherit level from parent', () => {
      const parent = createLogger({ level: 'warn' });
      const child = createQueryLogger(parent, 'test-query-123');
      expect(child.level).toBe('warn');
    });
  });

  describe('logQueryStart', () => {
    it('should log query start with queryId', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logQueryStart(logger, 'q-123', 'test query');

      expect(infoSpy).toHaveBeenCalled();
      const [logObj, logMsg] = infoSpy.mock.calls[0];
      expect(logObj).toHaveProperty('queryId', 'q-123');
      expect(logObj).toHaveProperty('operation', 'query_start');
      expect(logMsg).toBe('Query started');
    });

    it('should truncate query to 100 characters', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      const longQuery = 'a'.repeat(200);
      logQueryStart(logger, 'q-123', longQuery);

      const [logObj] = infoSpy.mock.calls[0];
      expect((logObj.query as string).length).toBe(100);
    });

    it('should log short query without truncation', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      const shortQuery = 'short query';
      logQueryStart(logger, 'q-123', shortQuery);

      const [logObj] = infoSpy.mock.calls[0];
      expect(logObj.query).toBe('short query');
    });
  });

  describe('logQueryComplete', () => {
    it('should log query completion with fields', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logQueryComplete(logger, 'q-123', {
        latencyMs: 150,
        resultsCount: 10,
        totalCost: 0.002,
      });

      expect(infoSpy).toHaveBeenCalled();
      const [logObj, logMsg] = infoSpy.mock.calls[0];
      expect(logObj.queryId).toBe('q-123');
      expect(logObj.operation).toBe('query_complete');
      expect(logObj.latencyMs).toBe(150);
      expect(logObj.resultsCount).toBe(10);
      expect(logObj.totalCost).toBe(0.002);
      expect(logMsg).toBe('Query completed');
    });

    it('should log with embedding and reranker costs', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logQueryComplete(logger, 'q-123', {
        embeddingCost: 0.0001,
        rerankerCost: 0.001,
        totalCost: 0.0011,
      });

      const [logObj] = infoSpy.mock.calls[0];
      expect(logObj.embeddingCost).toBe(0.0001);
      expect(logObj.rerankerCost).toBe(0.001);
      expect(logObj.totalCost).toBe(0.0011);
    });
  });

  describe('logQueryError', () => {
    it('should log query error with message and stack', () => {
      const logger = createLogger();
      const errorSpy = vi.spyOn(logger, 'error');

      const error = new Error('Query failed');
      logQueryError(logger, 'q-123', error);

      expect(errorSpy).toHaveBeenCalled();
      const [logObj, logMsg] = errorSpy.mock.calls[0];
      expect(logObj.queryId).toBe('q-123');
      expect(logObj.operation).toBe('query_error');
      expect(logObj.error).toBe('Query failed');
      expect(logObj.stack).toBeDefined();
      expect(logMsg).toBe('Query failed');
    });

    it('should handle error without stack', () => {
      const logger = createLogger();
      const errorSpy = vi.spyOn(logger, 'error');

      const error = new Error('Simple error');
      delete error.stack;
      logQueryError(logger, 'q-123', error);

      expect(errorSpy).toHaveBeenCalled();
      const [logObj] = errorSpy.mock.calls[0];
      expect(logObj.error).toBe('Simple error');
    });
  });

  describe('logIngestionStart', () => {
    it('should log ingestion start with document count', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logIngestionStart(logger, 5);

      expect(infoSpy).toHaveBeenCalled();
      const [logObj, logMsg] = infoSpy.mock.calls[0];
      expect(logObj.operation).toBe('ingestion_start');
      expect(logObj.documentCount).toBe(5);
      expect(logMsg).toBe('Document ingestion started');
    });

    it('should log ingestion start with zero documents', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logIngestionStart(logger, 0);

      expect(infoSpy).toHaveBeenCalled();
      const [logObj] = infoSpy.mock.calls[0];
      expect(logObj.documentCount).toBe(0);
    });
  });

  describe('logIngestionComplete', () => {
    it('should log ingestion completion with all metrics', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logIngestionComplete(logger, 5, 25, 320);

      expect(infoSpy).toHaveBeenCalled();
      const [logObj, logMsg] = infoSpy.mock.calls[0];
      expect(logObj.operation).toBe('ingestion_complete');
      expect(logObj.documentCount).toBe(5);
      expect(logObj.chunkCount).toBe(25);
      expect(logObj.latencyMs).toBe(320);
      expect(logMsg).toBe('Document ingestion completed');
    });

    it('should log with large chunk counts', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logIngestionComplete(logger, 100, 5000, 5000);

      const [logObj] = infoSpy.mock.calls[0];
      expect(logObj.documentCount).toBe(100);
      expect(logObj.chunkCount).toBe(5000);
    });
  });

  describe('logEvaluationResults', () => {
    it('should log evaluation metrics', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      const metrics = {
        precision: 0.85,
        recall: 0.72,
        ndcg: 0.78,
      };
      logEvaluationResults(logger, metrics);

      expect(infoSpy).toHaveBeenCalled();
      const [logObj, logMsg] = infoSpy.mock.calls[0];
      expect(logObj.operation).toBe('evaluation_complete');
      expect(logObj.precision).toBe(0.85);
      expect(logObj.recall).toBe(0.72);
      expect(logObj.ndcg).toBe(0.78);
      expect(logMsg).toBe('Evaluation completed');
    });

    it('should log with empty metrics', () => {
      const logger = createLogger();
      const infoSpy = vi.spyOn(logger, 'info');

      logEvaluationResults(logger, {});

      expect(infoSpy).toHaveBeenCalled();
      const [logObj] = infoSpy.mock.calls[0];
      expect(logObj.operation).toBe('evaluation_complete');
    });
  });

  describe('getLogger', () => {
    it('should return a logger instance', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
      expect(logger.level).toBeDefined();
    });

    it('should return singleton instance', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });
  });
});
