import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateGenerationMetrics,
  answerCorrectnessScore,
  coherenceScore,
  evaluateGeneration,
  faithfulnessScore,
  fluencyScore,
  type QueryGenerationResult,
  relevanceScore,
} from './generation.js';

// Hoisted controller for the optional @reaatech/guardrail-chain package.
// Tests reconfigure these fields to drive the various guardrail code paths.
const guardrailControl = vi.hoisted(() => ({
  hasGuardrailChain: true,
  throwOnConstruct: false,
  execute: undefined as ((...args: unknown[]) => Promise<unknown>) | undefined,
  factoryCalls: 0,
}));

vi.mock('@reaatech/guardrail-chain', () => {
  guardrailControl.factoryCalls++;
  // A real class is required: vitest v4 strips `vi.fn().mockImplementation`
  // constructability when returned directly from a mock factory.
  class GuardrailChain {
    constructor() {
      if (guardrailControl.throwOnConstruct) {
        throw new Error('boom');
      }
    }
    addGuardrail() {
      return {
        execute: async (input: unknown) => {
          if (guardrailControl.execute) {
            return guardrailControl.execute(input);
          }
          return { success: true };
        },
      };
    }
  }
  const mod: Record<string, unknown> = {};
  if (guardrailControl.hasGuardrailChain) {
    mod.GuardrailChain = GuardrailChain;
  }
  return mod;
});

describe('relevanceScore', () => {
  it('measures keyword overlap of long words', () => {
    // both query words (>3 chars) appear in the answer
    expect(relevanceScore('transformers attention', 'transformers use attention')).toBe(1);
  });

  it('returns 0 when the query has no long words', () => {
    expect(relevanceScore('a an of', 'anything')).toBe(0);
  });

  it('returns partial overlap', () => {
    expect(relevanceScore('alpha gamma', 'alpha only')).toBe(0.5);
  });
});

describe('fluencyScore', () => {
  it('returns 0 for empty answers', () => {
    expect(fluencyScore('   ')).toBe(0);
  });

  it('rewards well formed sentences', () => {
    const score = fluencyScore('This is a clear sentence. It reads well.');
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('penalizes short, uncapitalized, unpunctuated text', () => {
    const score = fluencyScore('hi');
    expect(score).toBeLessThan(0.5);
  });
});

describe('coherenceScore', () => {
  it('returns 1 for single-sentence answers', () => {
    expect(coherenceScore('Just one sentence')).toBe(1);
  });

  it('rewards transitions and pronouns', () => {
    expect(coherenceScore('They started early. However, it changed. They adapted quickly.')).toBe(
      0.95,
    );
  });

  it('gives 0.85 with transitions only', () => {
    // "Thus" is a transition word and no sentence contains a pronoun substring
    expect(coherenceScore('Rain falls. Thus plants grow.')).toBe(0.85);
  });

  it('gives 0.85 with pronoun ratio only', () => {
    expect(coherenceScore('It rains. They run. We hide.')).toBe(0.85);
  });

  it('gives 0.7 with a single pronoun below the ratio threshold', () => {
    // 5 sentences, exactly one contains a pronoun => ratio 0.2 (not > 0.2)
    expect(
      coherenceScore(
        'Dogs run fast. Cats nap long. Birds fly high. Fish swim deep. It rains today.',
      ),
    ).toBe(0.7);
  });

  it('gives 0.5 with no transitions or pronouns', () => {
    expect(coherenceScore('Dogs bark loudly. Cats sleep soundly.')).toBe(0.5);
  });
});

describe('faithfulnessScore', () => {
  it('returns 0 with no source chunks', () => {
    expect(faithfulnessScore('anything', [])).toBe(0);
  });

  it('returns max overlap across chunks', () => {
    expect(
      faithfulnessScore('quantum physics rules', ['quantum physics theory', 'unrelated']),
    ).toBeGreaterThan(0);
  });

  it('handles empty chunk content', () => {
    expect(faithfulnessScore('words words words', [''])).toBe(0);
  });
});

describe('answerCorrectnessScore', () => {
  it('returns 0 for empty ground truth', () => {
    expect(answerCorrectnessScore('something', 'a an of')).toBe(0);
  });

  it('measures overlap with ground truth', () => {
    expect(answerCorrectnessScore('paris france', 'paris france')).toBe(1);
  });
});

describe('evaluateGeneration', () => {
  it('omits answerCorrectness when no ground truth', () => {
    const r = evaluateGeneration('q1', 'query here', 'answer here', ['source here']);
    expect(r.answerCorrectness).toBeUndefined();
    expect(r.queryId).toBe('q1');
  });

  it('includes answerCorrectness when ground truth given', () => {
    const r = evaluateGeneration('q1', 'query', 'paris', ['chunk'], 'paris');
    expect(r.answerCorrectness).toBe(1);
  });
});

describe('aggregateGenerationMetrics', () => {
  it('returns zeroes for empty list', () => {
    const m = aggregateGenerationMetrics([]);
    expect(m.avgRelevance).toBe(0);
    expect(m.avgAnswerCorrectness).toBeUndefined();
  });

  it('averages and includes answerCorrectness when all present', () => {
    const results: QueryGenerationResult[] = [
      {
        queryId: 'a',
        relevance: 1,
        fluency: 1,
        coherence: 1,
        faithfulness: 1,
        answerCorrectness: 1,
      },
      {
        queryId: 'b',
        relevance: 0,
        fluency: 0,
        coherence: 0,
        faithfulness: 0,
        answerCorrectness: 0,
      },
    ];
    const m = aggregateGenerationMetrics(results);
    expect(m.avgRelevance).toBe(0.5);
    expect(m.avgAnswerCorrectness).toBe(0.5);
  });

  it('omits answerCorrectness when not all present', () => {
    const results: QueryGenerationResult[] = [
      {
        queryId: 'a',
        relevance: 1,
        fluency: 1,
        coherence: 1,
        faithfulness: 1,
        answerCorrectness: 1,
      },
      { queryId: 'b', relevance: 0, fluency: 0, coherence: 0, faithfulness: 0 },
    ];
    const m = aggregateGenerationMetrics(results);
    expect(m.avgAnswerCorrectness).toBeUndefined();
  });

  it('handles undefined answerCorrectness defaulting to 0 in sum', () => {
    const results: QueryGenerationResult[] = [
      {
        queryId: 'a',
        relevance: 1,
        fluency: 1,
        coherence: 1,
        faithfulness: 1,
        answerCorrectness: undefined as unknown as number,
      },
    ];
    // every() short circuits: undefined => not included
    const m = aggregateGenerationMetrics(results);
    expect(m.avgAnswerCorrectness).toBeUndefined();
  });
});

describe('evaluateGenerationWithGuardrails', () => {
  beforeEach(() => {
    vi.resetModules();
    guardrailControl.hasGuardrailChain = true;
    guardrailControl.throwOnConstruct = false;
    guardrailControl.execute = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the guardrail chain output when available', async () => {
    guardrailControl.execute = vi.fn().mockResolvedValue({
      success: true,
      output: {
        relevance: 0.42,
        fluency: 0.5,
        coherence: 0.6,
        faithfulness: 0.7,
        answerCorrectness: 0.8,
      },
    });
    const mod = await import('./generation.js');
    const r = await mod.evaluateGenerationWithGuardrails(
      'q2',
      'query',
      'an answer',
      ['src'],
      'truth',
    );
    expect(r.relevance).toBe(0.42);
    expect(r.answerCorrectness).toBe(0.8);
  });

  it('falls back to local values for non-numeric guardrail output', async () => {
    guardrailControl.execute = vi.fn().mockResolvedValue({ success: true, output: {} });
    const mod = await import('./generation.js');
    const fallback = mod.evaluateGeneration(
      'q3',
      'query',
      'answer here',
      ['answer here'],
      'answer',
    );
    const r = await mod.evaluateGenerationWithGuardrails(
      'q3',
      'query',
      'answer here',
      ['answer here'],
      'answer',
    );
    expect(r.relevance).toBe(fallback.relevance);
    expect(r.faithfulness).toBe(fallback.faithfulness);
    expect(r.answerCorrectness).toBe(fallback.answerCorrectness);
  });

  it('falls back when no output is returned', async () => {
    guardrailControl.execute = vi.fn().mockResolvedValue({ success: true });
    const mod = await import('./generation.js');
    const r = await mod.evaluateGenerationWithGuardrails('q4', 'query', 'answer text', [
      'answer text',
    ]);
    expect(typeof r.relevance).toBe('number');
  });

  it('falls back when the chain throws', async () => {
    guardrailControl.throwOnConstruct = true;
    const mod = await import('./generation.js');
    const r = await mod.evaluateGenerationWithGuardrails('q5', 'query', 'answer text', [
      'answer text',
    ]);
    expect(r.queryId).toBe('q5');
  });

  it('falls back when the module has no GuardrailChain export', async () => {
    guardrailControl.hasGuardrailChain = false;
    const mod = await import('./generation.js');
    const r = await mod.evaluateGenerationWithGuardrails('q6', 'query', 'answer text', [
      'answer text',
    ]);
    expect(r.queryId).toBe('q6');
  });

  it('caches the loaded module across calls', async () => {
    guardrailControl.execute = vi
      .fn()
      .mockResolvedValue({ success: true, output: { relevance: 0.1 } });
    const mod = await import('./generation.js');
    await mod.evaluateGenerationWithGuardrails('a', 'q', 'answer text', ['answer text']);
    const first = guardrailControl.execute;
    await mod.evaluateGenerationWithGuardrails('b', 'q', 'answer text', ['answer text']);
    // the cached module means a fresh GuardrailChain is built each call but the
    // optional module is only imported once; output is honored on both calls
    expect(first).toHaveBeenCalledTimes(2);
  });
});
