import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEnv, resolveWithPrecedence } from './env-config.js';

const ORIGINAL_ENV = { ...process.env };

describe('env-config', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.HYBRID_RAG_QDRANT_URL;
    delete process.env.QDRANT_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('readEnv', () => {
    it('prefers the prefixed name over the legacy name', () => {
      process.env.HYBRID_RAG_QDRANT_URL = 'http://prefixed:6333';
      process.env.QDRANT_URL = 'http://legacy:6333';
      expect(readEnv('HYBRID_RAG_QDRANT_URL', 'QDRANT_URL')).toBe('http://prefixed:6333');
    });

    it('falls back to the legacy name when the prefixed name is unset', () => {
      process.env.QDRANT_URL = 'http://legacy:6333';
      expect(readEnv('HYBRID_RAG_QDRANT_URL', 'QDRANT_URL')).toBe('http://legacy:6333');
    });

    it('treats empty strings as unset and falls back', () => {
      process.env.HYBRID_RAG_QDRANT_URL = '';
      process.env.QDRANT_URL = 'http://legacy:6333';
      expect(readEnv('HYBRID_RAG_QDRANT_URL', 'QDRANT_URL')).toBe('http://legacy:6333');
    });

    it('treats an empty legacy value as unset', () => {
      process.env.QDRANT_URL = '';
      expect(readEnv('HYBRID_RAG_QDRANT_URL', 'QDRANT_URL')).toBeUndefined();
    });

    it('returns undefined when neither is set', () => {
      expect(readEnv('HYBRID_RAG_QDRANT_URL', 'QDRANT_URL')).toBeUndefined();
    });

    it('works without a legacy name', () => {
      expect(readEnv('HYBRID_RAG_QDRANT_URL')).toBeUndefined();
      process.env.HYBRID_RAG_QDRANT_URL = 'http://x';
      expect(readEnv('HYBRID_RAG_QDRANT_URL')).toBe('http://x');
    });
  });

  describe('resolveWithPrecedence', () => {
    it('CLI argument beats everything', () => {
      process.env.HYBRID_RAG_QDRANT_URL = 'env';
      expect(
        resolveWithPrecedence({
          cliValue: 'cli',
          configValue: 'config',
          prefixedEnv: 'HYBRID_RAG_QDRANT_URL',
          legacyEnv: 'QDRANT_URL',
          defaultValue: 'default',
        }),
      ).toBe('cli');
    });

    it('config file beats env and default', () => {
      process.env.HYBRID_RAG_QDRANT_URL = 'env';
      expect(
        resolveWithPrecedence({
          configValue: 'config',
          prefixedEnv: 'HYBRID_RAG_QDRANT_URL',
          defaultValue: 'default',
        }),
      ).toBe('config');
    });

    it('env beats default', () => {
      process.env.HYBRID_RAG_QDRANT_URL = 'env';
      expect(
        resolveWithPrecedence({
          prefixedEnv: 'HYBRID_RAG_QDRANT_URL',
          defaultValue: 'default',
        }),
      ).toBe('env');
    });

    it('falls back to the default when nothing else is set', () => {
      expect(
        resolveWithPrecedence({
          prefixedEnv: 'HYBRID_RAG_QDRANT_URL',
          defaultValue: 'default',
        }),
      ).toBe('default');
    });

    it('ignores empty CLI and config values', () => {
      process.env.HYBRID_RAG_QDRANT_URL = 'env';
      expect(
        resolveWithPrecedence({
          cliValue: '',
          configValue: '',
          prefixedEnv: 'HYBRID_RAG_QDRANT_URL',
          defaultValue: 'default',
        }),
      ).toBe('env');
    });

    it('returns undefined when no source and no default', () => {
      expect(
        resolveWithPrecedence({
          prefixedEnv: 'HYBRID_RAG_QDRANT_URL',
        }),
      ).toBeUndefined();
    });
  });
});
