/**
 * Simple tiktoken mock for tests
 * Avoids WASM loading issues in vitest workers
 */

class MockEncoder {
  encode(text) {
    if (!text) return [];
    const words = text.split(/\s+/);
    const tokens = [];
    for (const word of words) {
      if (!word) continue;
      for (let i = 0; i < word.length; i += 4) {
        tokens.push(word.charCodeAt(i) % 1000);
      }
      tokens.push(200);
    }
    return tokens.length > 0 ? tokens : [0];
  }

  decode(tokens) {
    const chars = tokens.map(t => String.fromCharCode((t % 26) + 97));
    return new TextEncoder().encode(chars.join(''));
  }

  free() {}
}

function get_encoding(name = 'cl100k_base') {
  return new MockEncoder();
}

function get_encoding_name() {
  return 'cl100k_base';
}

module.exports = { get_encoding, get_encoding_name };
module.exports.default = { get_encoding, get_encoding_name };
