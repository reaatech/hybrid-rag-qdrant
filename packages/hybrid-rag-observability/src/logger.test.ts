import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  createQueryLogger,
  getLogger,
  logEvaluationResults,
  logIngestionComplete,
  logIngestionStart,
  logQueryComplete,
  logQueryError,
  logQueryStart,
} from './logger.js';

function makeFakeLogger() {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

describe('createLogger', () => {
  it('creates a logger with default level', () => {
    const logger = createLogger();
    expect(typeof logger.info).toBe('function');
    expect(logger.level).toBe('info');
  });

  it('honors a custom level', () => {
    const logger = createLogger({ level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  it('configures pretty print transport without throwing', () => {
    const logger = createLogger({ prettyPrint: true, level: 'warn' });
    expect(logger.level).toBe('warn');
  });
});

describe('createQueryLogger', () => {
  it('creates a child logger with query context', () => {
    const fake = makeFakeLogger();
    const child = createQueryLogger(fake as never, 'q-123');
    expect(fake.child).toHaveBeenCalledWith({ queryId: 'q-123' });
    expect(child).toBe(fake);
  });
});

describe('log helpers', () => {
  let logger: ReturnType<typeof makeFakeLogger>;

  beforeEach(() => {
    logger = makeFakeLogger();
  });

  it('logQueryStart truncates the query', () => {
    logQueryStart(logger as never, 'q1', 'x'.repeat(200));
    const [fields] = logger.info.mock.calls[0] as [{ query: string; operation: string }];
    expect(fields.operation).toBe('query_start');
    expect(fields.query.length).toBe(100);
  });

  it('logQueryComplete merges fields', () => {
    logQueryComplete(logger as never, 'q1', { latencyMs: 5, totalCost: 0.01 });
    const [fields] = logger.info.mock.calls[0] as [Record<string, unknown>];
    expect(fields.operation).toBe('query_complete');
    expect(fields.latencyMs).toBe(5);
  });

  it('logQueryError logs error details', () => {
    logQueryError(logger as never, 'q1', new Error('boom'));
    const [fields] = logger.error.mock.calls[0] as [{ error: string }];
    expect(fields.error).toBe('boom');
  });

  it('logIngestionStart and logIngestionComplete', () => {
    logIngestionStart(logger as never, 3);
    logIngestionComplete(logger as never, 3, 12, 99);
    expect(logger.info).toHaveBeenCalledTimes(2);
    const complete = logger.info.mock.calls[1]?.[0] as { chunkCount: number };
    expect(complete.chunkCount).toBe(12);
  });

  it('logEvaluationResults merges metric fields', () => {
    logEvaluationResults(logger as never, { precision: 0.9 });
    const [fields] = logger.info.mock.calls[0] as [{ precision: number }];
    expect(fields.precision).toBe(0.9);
  });
});

describe('getLogger', () => {
  const original = { LOG_LEVEL: process.env.LOG_LEVEL, NODE_ENV: process.env.NODE_ENV };

  afterEach(() => {
    process.env.LOG_LEVEL = original.LOG_LEVEL;
    process.env.NODE_ENV = original.NODE_ENV;
  });

  it('returns a singleton logger', () => {
    const a = getLogger();
    const b = getLogger();
    expect(a).toBe(b);
    expect(typeof a.info).toBe('function');
  });
});
