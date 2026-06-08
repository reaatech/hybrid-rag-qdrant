import { describe, expect, it } from 'vitest';
import { encodeSparse } from './sparse-encoder.js';

describe('encodeSparse', () => {
  it('should return correct shape with indices and values', () => {
    const result = encodeSparse('hello world');
    expect(result).toHaveProperty('indices');
    expect(result).toHaveProperty('values');
    expect(result.indices.length).toBe(result.values.length);
    expect(result.indices.length).toBeGreaterThan(0);
  });

  it('should be deterministic: same input produces same output', () => {
    const a = encodeSparse('the quick brown fox jumps over the lazy dog');
    const b = encodeSparse('the quick brown fox jumps over the lazy dog');
    expect(a.indices).toEqual(b.indices);
    expect(a.values).toEqual(b.values);
  });

  it('should handle case insensitivity (lowercase)', () => {
    const lower = encodeSparse('hello world');
    const upper = encodeSparse('HELLO WORLD');
    const mixed = encodeSparse('Hello World');
    expect(lower.indices).toEqual(upper.indices);
    expect(lower.values).toEqual(upper.values);
    expect(lower.indices).toEqual(mixed.indices);
  });

  it('should split on word boundaries', () => {
    const result = encodeSparse('hello-world foo_bar');
    expect(result.indices.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle empty string', () => {
    const result = encodeSparse('');
    expect(result.indices).toEqual([]);
    expect(result.values).toEqual([]);
  });

  it('should handle string with only whitespace', () => {
    const result = encodeSparse('   \n  \t  ');
    expect(result.indices).toEqual([]);
    expect(result.values).toEqual([]);
  });

  it('should give higher weight to repeated terms', () => {
    const single = encodeSparse('foo');
    const repeated = encodeSparse('foo foo foo foo foo');
    const firstIndex = single.indices[0]!;
    const singleVal = single.values[single.indices.indexOf(firstIndex)]!;
    const repeatedVal = repeated.values[repeated.indices.indexOf(firstIndex)]!;
    expect(repeatedVal).toBeGreaterThan(singleVal);
  });

  it('should accept custom k1 and b parameters', () => {
    const defaultResult = encodeSparse('test document', {});
    const customResult = encodeSparse('test document', { k1: 2.0, b: 1.0 });
    expect(defaultResult.indices).toEqual(customResult.indices);
  });

  it('should produce uint32 indices', () => {
    const result = encodeSparse('unique terms in this document');
    for (const idx of result.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it('should produce non-negative values', () => {
    const result = encodeSparse('positive term frequency values');
    for (const val of result.values) {
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });
});
