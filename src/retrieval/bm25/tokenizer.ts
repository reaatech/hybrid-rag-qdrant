/**
 * Text tokenization for BM25
 */

/**
 * Tokenizer configuration
 */
export interface TokenizerConfig {
  /** Whether to remove stop words (default: true) */
  removeStopWords?: boolean;
  /** Whether to apply stemming (default: false) */
  useStemming?: boolean;
  /** N-gram sizes to generate (default: [1] for unigrams only) */
  ngramSizes?: number[];
  /** Minimum word length (default: 2) */
  minWordLength?: number;
  /** Custom stop words list */
  customStopWords?: string[];
}

/**
 * Default English stop words
 */
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

/**
 * Simple stemmer (English)
 */
function simpleStem(word: string): string {
  // Very basic suffix stripping
  const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'sion', 'ment', 'ness', 'able', 'ible'];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

/**
 * Text tokenizer for BM25 retrieval
 */
export class Tokenizer {
  private readonly config: Required<TokenizerConfig>;
  private readonly stopWords: Set<string>;

  constructor(config: TokenizerConfig = {}) {
    this.config = {
      removeStopWords: config.removeStopWords ?? true,
      useStemming: config.useStemming ?? false,
      ngramSizes: config.ngramSizes ?? [1],
      minWordLength: config.minWordLength ?? 2,
      customStopWords: config.customStopWords ?? [],
    };

    this.stopWords = new Set([
      ...DEFAULT_STOP_WORDS,
      ...this.config.customStopWords.map((w) => w.toLowerCase()),
    ]);
  }

  /**
   * Tokenize text into terms
   */
  tokenize(text: string): string[] {
    // Lowercase and split on non-alphanumeric
    const words = text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= this.config.minWordLength);

    // Remove stop words
    const filtered = this.config.removeStopWords
      ? words.filter((w) => !this.stopWords.has(w))
      : words;

    // Apply stemming
    const stemmed = this.config.useStemming ? filtered.map((w) => simpleStem(w)) : filtered;

    // Generate n-grams
    return this.generateNgrams(stemmed);
  }

  /**
   * Generate n-grams from tokens
   */
  private generateNgrams(tokens: string[]): string[] {
    const result: string[] = [];

    for (const n of this.config.ngramSizes) {
      if (n === 1) {
        result.push(...tokens);
      } else {
        for (let i = 0; i <= tokens.length - n; i++) {
          result.push(tokens.slice(i, i + n).join(' '));
        }
      }
    }

    return result;
  }

  /**
   * Tokenize and return unique terms with counts
   */
  tokenizeWithCounts(text: string): Map<string, number> {
    const tokens = this.tokenize(text);
    const counts = new Map<string, number>();

    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    return counts;
  }
}
