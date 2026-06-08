import type { SparseVector } from './vector-store.js';

const DEFAULT_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'as',
  'if',
  'when',
  'than',
  'so',
  'not',
  'no',
  'nor',
  'too',
  'very',
  'just',
  'about',
  'above',
  'after',
  'again',
  'all',
  'also',
  'any',
  'because',
  'before',
  'between',
  'both',
  'each',
  'few',
  'get',
  'here',
  'how',
  'into',
  'more',
  'most',
  'other',
  'our',
  'over',
  'own',
  'same',
  'some',
  'such',
  'then',
  'there',
  'they',
  'through',
  'under',
  'until',
  'up',
  'what',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'your',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !DEFAULT_STOP_WORDS.has(w));
}

function stableHash(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash) >>> 0;
}

function computeTf(tokens: string[], term: string): number {
  let count = 0;
  for (const t of tokens) {
    if (t === term) count++;
  }
  return count;
}

export function encodeSparse(text: string, options?: { k1?: number; b?: number }): SparseVector {
  const k1 = options?.k1 ?? 1.2;
  const b = options?.b ?? 0.75;

  const tokens = tokenize(text);
  const uniqueTerms = [...new Set(tokens)];
  const docLen = tokens.length;

  const indices: number[] = [];
  const values: number[] = [];

  for (const term of uniqueTerms) {
    const tf = computeTf(tokens, term);
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLen / Math.max(docLen, 1)));
    const weight = numerator / denominator;

    indices.push(stableHash(term));
    values.push(weight);
  }

  return { indices, values };
}
