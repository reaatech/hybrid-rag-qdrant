import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeErrorResponse, validateInput } from './validation.js';

describe('validateInput', () => {
  const schema = z.object({
    name: z.string().min(1, 'name required'),
    age: z.number().optional(),
  });

  it('returns success with parsed data for valid input', () => {
    const result = validateInput(schema, { name: 'Ada', age: 36 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Ada', age: 36 });
    }
  });

  it('returns formatted errors with field paths for invalid input', () => {
    const result = validateInput(schema, { name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error).toBe('Invalid input');
      expect(result.error.details).toContain('name: name required');
    }
  });

  it('formats top-level (pathless) errors using the raw message', () => {
    const topLevel = z.string();
    const result = validateInput(topLevel, 123);
    expect(result.success).toBe(false);
    if (!result.success) {
      const detail = result.error.details?.[0] ?? '';
      // The issue path is empty, so the message is used verbatim (no field
      // path was prepended). For a field error the format would be
      // `field: message`; here there is no leading field segment.
      expect(detail.toLowerCase()).toContain('expected string');
      const fieldError = validateInput(z.object({ a: z.string() }), { a: 1 });
      if (!fieldError.success) {
        expect(fieldError.error.details?.[0]).toMatch(/^a: /);
      }
    }
  });
});

describe('makeErrorResponse', () => {
  it('wraps a validation error as an MCP error response', () => {
    const response = makeErrorResponse({ error: 'Invalid input', details: ['x: bad'] });
    expect(response.isError).toBe(true);
    expect(response.content[0].type).toBe('text');
    expect(JSON.parse(response.content[0].text)).toEqual({
      error: 'Invalid input',
      details: ['x: bad'],
    });
  });
});
