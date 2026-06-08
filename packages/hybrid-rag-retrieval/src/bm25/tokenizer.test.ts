import { describe, expect, it } from 'vitest';
import { Tokenizer } from './tokenizer.js';

describe('Tokenizer', () => {
  it('lowercases and removes stop words by default', () => {
    const t = new Tokenizer();
    const tokens = t.tokenize('The Quick Brown Fox');
    expect(tokens).toEqual(['quick', 'brown', 'fox']);
  });

  it('filters tokens shorter than minWordLength', () => {
    const t = new Tokenizer({ minWordLength: 4, removeStopWords: false });
    const tokens = t.tokenize('I am a cat running');
    expect(tokens).toEqual(['running']);
  });

  it('keeps stop words when removeStopWords is false', () => {
    const t = new Tokenizer({ removeStopWords: false });
    const tokens = t.tokenize('the cat');
    expect(tokens).toContain('the');
  });

  it('applies stemming when enabled', () => {
    const t = new Tokenizer({ useStemming: true, removeStopWords: false });
    const tokens = t.tokenize('running quickly jumped');
    expect(tokens).toContain('runn');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('jump');
  });

  it('does not over-stem short words', () => {
    const t = new Tokenizer({ useStemming: true, removeStopWords: false });
    // 'red' ends with 'ed' but is too short to strip
    expect(t.tokenize('red')).toEqual(['red']);
  });

  it('supports custom stop words', () => {
    const t = new Tokenizer({ customStopWords: ['Foo'] });
    expect(t.tokenize('foo bar')).toEqual(['bar']);
  });

  it('generates bigrams', () => {
    const t = new Tokenizer({ ngramSizes: [2], removeStopWords: false });
    expect(t.tokenize('quick brown fox')).toEqual(['quick brown', 'brown fox']);
  });

  it('generates mixed unigrams and bigrams', () => {
    const t = new Tokenizer({ ngramSizes: [1, 2], removeStopWords: false });
    const tokens = t.tokenize('cat dog');
    expect(tokens).toEqual(['cat', 'dog', 'cat dog']);
  });

  it('handles unicode word boundaries', () => {
    const t = new Tokenizer({ removeStopWords: false });
    expect(t.tokenize('hello-world,foo')).toEqual(['hello', 'world', 'foo']);
  });

  it('tokenizeWithCounts counts repeats', () => {
    const t = new Tokenizer({ removeStopWords: false });
    const counts = t.tokenizeWithCounts('cat cat dog');
    expect(counts.get('cat')).toBe(2);
    expect(counts.get('dog')).toBe(1);
  });
});
