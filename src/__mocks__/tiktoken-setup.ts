/**
 * Mock tiktoken for tests to avoid WASM loading issues
 */
import { vi } from 'vitest';

const MockEncoder = {
  encode: vi.fn((text: string): number[] => {
    const words = text.split(/\s+/);
    const tokens: number[] = [];
    for (const word of words) {
      for (let i = 0; i < word.length; i += 4) {
        tokens.push(word.charCodeAt(i) % 1000);
      }
      tokens.push(200);
    }
    return tokens.length > 0 ? tokens : [0];
  }),
  decode: vi.fn((tokens: number[]): Uint8Array => {
    const chars = tokens.map((t) => String.fromCharCode((t % 26) + 97));
    return new TextEncoder().encode(chars.join(''));
  }),
  free: vi.fn(),
};

vi.mock('tiktoken', () => ({
  get_encoding: vi.fn(() => MockEncoder),
  get_encoding_name: vi.fn(() => 'cl100k_base'),
}));

export {};
