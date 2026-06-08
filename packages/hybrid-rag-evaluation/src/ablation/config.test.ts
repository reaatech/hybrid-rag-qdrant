import { describe, expect, it } from 'vitest';
import { type AblationConfig, DEFAULT_BASELINE, validateAblationConfig } from './config.js';

function makeConfig(overrides: Partial<AblationConfig['baseline']> = {}): AblationConfig {
  return {
    baseline: { ...DEFAULT_BASELINE, ...overrides },
    variants: [{ name: 'v1', changes: { chunkSize: 256 } }],
  };
}

describe('DEFAULT_BASELINE', () => {
  it('has hybrid weights summing to 1', () => {
    expect(DEFAULT_BASELINE.vectorWeight + DEFAULT_BASELINE.bm25Weight).toBeCloseTo(1, 6);
  });
});

describe('validateAblationConfig', () => {
  it('accepts a valid hybrid config', () => {
    expect(validateAblationConfig(makeConfig())).toBe(true);
  });

  it('rejects when chunking is missing', () => {
    const config = makeConfig();
    (config.baseline as { chunking?: unknown }).chunking = undefined;
    expect(validateAblationConfig(config)).toBe(false);
  });

  it('rejects when retrieval is missing', () => {
    const config = makeConfig();
    (config.baseline as { retrieval?: unknown }).retrieval = undefined;
    expect(validateAblationConfig(config)).toBe(false);
  });

  it('rejects when weights are undefined', () => {
    const config = makeConfig();
    (config.baseline as { vectorWeight?: unknown }).vectorWeight = undefined;
    expect(validateAblationConfig(config)).toBe(false);
  });

  it('rejects hybrid weights that do not sum to 1', () => {
    expect(validateAblationConfig(makeConfig({ vectorWeight: 0.5, bm25Weight: 0.2 }))).toBe(false);
  });

  it('allows non-hybrid configs with arbitrary weights', () => {
    expect(
      validateAblationConfig(makeConfig({ retrieval: 'vector', vectorWeight: 1, bm25Weight: 0 })),
    ).toBe(true);
  });

  it('rejects variants without a name', () => {
    const config = makeConfig();
    config.variants.push({ name: '', changes: {} });
    expect(validateAblationConfig(config)).toBe(false);
  });
});
