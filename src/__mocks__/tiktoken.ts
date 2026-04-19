/**
 * Mock implementation of tiktoken for testing
 */

export type TiktokenEncoding = string;

export interface MockTiktoken {
  encode(text: string): number[];
  decode(tokens: number[]): Uint8Array;
  free(): void;
}

const CL100K_BASE = 'cl100k_base';

class MockEncoder implements MockTiktoken {
  private readonly encoding: string;

  constructor(encoding: string) {
    this.encoding = encoding;
  }

  encode(text: string): number[] {
    const words = text.split(/\s+/);
    const tokens: number[] = [];
    for (const word of words) {
      for (let i = 0; i < word.length; i += 4) {
        tokens.push(word.charCodeAt(i) % 1000);
      }
      tokens.push(200); // approximate token for space
    }
    return tokens.length > 0 ? tokens : [0];
  }

  decode(tokens: number[]): Uint8Array {
    const chars = tokens.map(t => String.fromCharCode((t % 26) + 97));
    return new TextEncoder().encode(chars.join(''));
  }

  free(): void {
    // no-op for mock
  }
}

export function get_encoding(encoding: TiktokenEncoding = CL100K_BASE): MockTiktoken {
  return new MockEncoder(encoding);
}

export function get_encoding_name(): string {
  return CL100K_BASE;
}
