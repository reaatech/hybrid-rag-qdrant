import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  qualityTools,
  ragCompareConfigs,
  ragDetectHallucination,
  ragGetQualityMetrics,
  ragJudgeQuality,
  ragRunQualityCheck,
  ragValidateResults,
} from './quality-tools.js';

// Controllable guardrail-chain mock. The source memoizes the imported module,
// so all tests share this instance. When `chainRun` is set it overrides the
// chain result; otherwise the mock invokes the real guardrail `detect`
// implementation supplied by the source so that closure is exercised too.
const { chainRun } = vi.hoisted(() => ({ chainRun: vi.fn() }));
vi.mock('@reaatech/guardrail-chain', () => ({
  Guardrail: class {
    detect: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    constructor(options: {
      detect: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }) {
      this.detect = options.detect;
    }
  },
  GuardrailChain: class {
    guardrails: Array<{
      detect: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }>;
    constructor(options: {
      guardrails: Array<{
        detect: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }>;
    }) {
      this.guardrails = options.guardrails;
    }
    async run(input: Record<string, unknown>) {
      const override = chainRun(input);
      if (override !== undefined) {
        return override;
      }
      // Drive the source-provided detect implementation to exercise it, then
      // shape the result the way the source expects from `chain.run`.
      const detection = await this.guardrails[0].detect(input);
      const contradictions = (detection.contradictions as Array<Record<string, unknown>>) ?? [];
      return {
        hallucinations: contradictions.map((c) => ({
          claim: c.claim,
          contradiction_type: c.contradiction_type,
          source: c.source,
        })),
        score: detection.score,
      };
    }
  },
}));

const pipeline = makePipeline({});

afterEach(() => {
  vi.clearAllMocks();
});

describe('qualityTools registry', () => {
  it('exports six tools', () => {
    expect(qualityTools.map((t) => t.name)).toEqual([
      'rag.judge_quality',
      'rag.validate_results',
      'rag.detect_hallucination',
      'rag.compare_configs',
      'rag.get_quality_metrics',
      'rag.run_quality_check',
    ]);
  });
});

describe('rag.judge_quality', () => {
  it('judges results across default criteria', async () => {
    const res = await ragJudgeQuality.handler(
      {
        query: 'what is rag',
        results: [
          { chunk_id: 'c1', content: 'a'.repeat(250), score: 0.9 },
          { chunk_id: 'c2', content: 'short', score: 0.4 },
        ],
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect((payload.results as unknown[]).length).toBe(2);
    expect(typeof payload.consensus_score).toBe('number');
    expect(Array.isArray(payload.recommendations)).toBe(true);
  });

  it('accepts custom judge model, criteria and consensus count', async () => {
    const res = await ragJudgeQuality.handler(
      {
        query: 'q',
        results: [{ chunk_id: 'c1', content: 'content', score: 0.95 }],
        judge_model: 'gpt-4',
        criteria: ['relevance'],
        consensus_count: 3,
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.judge_model).toBe('gpt-4');
    expect(payload.judgments_count).toBe(3);
  });
});

describe('rag.validate_results', () => {
  it('passes validation when criteria are met', async () => {
    const res = await ragValidateResults.handler(
      {
        query: 'q',
        results: [
          { chunk_id: 'c1', content: 'x', score: 0.9 },
          { chunk_id: 'c2', content: 'y', score: 0.8 },
          { chunk_id: 'c3', content: 'z', score: 0.7 },
        ],
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.passed).toBe(true);
  });

  it('fails validation and reports recommendations when below thresholds', async () => {
    const res = await ragValidateResults.handler(
      {
        query: 'q',
        results: [{ chunk_id: 'c1', content: 'x', score: 0.1 }],
        thresholds: { min_relevance: 0.6, min_results: 3 },
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.passed).toBe(false);
    expect((payload.recommendations as unknown[]).length).toBeGreaterThan(0);
  });

  it('handles an empty result set', async () => {
    const res = await ragValidateResults.handler({ query: 'q', results: [] }, pipeline);
    expect(parseToolResult(res).passed).toBe(false);
  });
});

describe('rag.detect_hallucination', () => {
  it('uses guardrail-chain when it returns hallucinations', async () => {
    chainRun.mockResolvedValue({
      hallucinations: [{ claim: 'The sky is green', contradiction_type: 'missing' }],
      score: 0.4,
    });
    const res = await ragDetectHallucination.handler(
      {
        query: 'q',
        generated_answer: 'The sky is green for sure. Grass is also green and quite tall today.',
        retrieved_chunks: [{ content: 'Grass is green.', source: 's1' }],
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.detection_source).toBe('guardrail-chain');
    expect(payload.hallucination_detected).toBe(true);
  });

  it('uses guardrail-chain when no hallucinations are returned', async () => {
    chainRun.mockResolvedValue({ hallucinations: [], score: 1 });
    const res = await ragDetectHallucination.handler(
      {
        query: 'q',
        generated_answer: 'Grass is green and grows in fields everywhere outdoors.',
        retrieved_chunks: [{ content: 'Grass is green and grows in fields.' }],
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.detection_source).toBe('guardrail-chain');
    expect(payload.hallucination_detected).toBe(false);
  });

  it('drives the guardrail detect implementation when no override is set', async () => {
    chainRun.mockReturnValue(undefined);
    const res = await ragDetectHallucination.handler(
      {
        query: 'q',
        generated_answer:
          'An entirely fabricated assertion about interdimensional quantum widgets here.',
        retrieved_chunks: [{ content: 'Grass is green.', source: 's1' }],
        threshold: 0.5,
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.detection_source).toBe('guardrail-chain');
    expect(payload.hallucination_detected).toBe(true);
  });

  it('falls back to heuristics when guardrail-chain throws', async () => {
    chainRun.mockRejectedValue(new Error('guardrail exploded'));
    const res = await ragDetectHallucination.handler(
      {
        query: 'q',
        generated_answer:
          'Completely unrelated invented statement about quantum teleportation devices.',
        retrieved_chunks: [{ content: 'Grass is green.', source: 's1' }],
        threshold: 0.7,
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.detection_source).toBe('heuristics');
    expect(payload.hallucination_detected).toBe(true);
  });

  it('heuristics path can find supported claims', async () => {
    chainRun.mockRejectedValue(new Error('down'));
    const res = await ragDetectHallucination.handler(
      {
        query: 'q',
        generated_answer:
          'Retrieval augmented generation combines retrieval with generation effectively.',
        retrieved_chunks: [
          {
            content:
              'Retrieval augmented generation combines retrieval with generation effectively in systems.',
            source: 's1',
          },
        ],
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.detection_source).toBe('heuristics');
    expect(payload.hallucination_detected).toBe(false);
  });
});

describe('rag.compare_configs', () => {
  it('compares two configurations and picks a winner or tie', async () => {
    const res = await ragCompareConfigs.handler(
      {
        query: 'q',
        config_a: { vectorWeight: 0.7, topK: 10 },
        config_b: { vectorWeight: 0.5, topK: 5 },
        metric: 'diversity',
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(['a', 'b', 'tie']).toContain(payload.winner);
    expect(payload.metric).toBe('diversity');
  });

  it('uses default topK when not provided', async () => {
    const res = await ragCompareConfigs.handler(
      { query: 'q', config_a: {}, config_b: {} },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect((payload.config_a as Record<string, number>).results_count).toBe(10);
  });
});

describe('rag.get_quality_metrics', () => {
  it('returns a dashboard for default metrics', async () => {
    // Seed some metrics first so averages are populated.
    await ragValidateResults.handler(
      { query: 'q', results: [{ chunk_id: 'c1', content: 'x', score: 0.9 }] },
      pipeline,
    );
    const res = await ragGetQualityMetrics.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.metrics).toBeDefined();
    expect((payload.summary as Record<string, unknown>).total_evaluations).toBeDefined();
  });

  it('honors explicit metric_names and limit', async () => {
    const res = await ragGetQualityMetrics.handler(
      { metric_names: ['quality_score'], limit: 5 },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect((payload.metrics as Record<string, unknown>).quality_score).toBeDefined();
  });

  it('supports the camelCase metricNames alias', async () => {
    const res = await ragGetQualityMetrics.handler({ metricNames: ['ab_test'] }, pipeline);
    expect((parseToolResult(res).metrics as Record<string, unknown>).ab_test).toBeDefined();
  });
});

describe('rag.run_quality_check', () => {
  it('runs with defaults', async () => {
    const res = await ragRunQualityCheck.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.frequency).toBe('daily');
    expect(typeof payload.passed).toBe('boolean');
    expect(payload.next_check).toBeDefined();
  });

  it('supports hourly frequency and strict thresholds', async () => {
    const res = await ragRunQualityCheck.handler(
      {
        frequency: 'hourly',
        sample_size: 10,
        thresholds: {
          min_relevance: 0.99,
          min_completeness: 0.99,
          max_hallucination_rate: 0,
        },
        alert_on_failure: true,
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.frequency).toBe('hourly');
    // Near-impossible thresholds force a failure and populate recommendations.
    expect(payload.passed).toBe(false);
    expect((payload.recommendations as unknown[]).length).toBeGreaterThan(0);
  });

  it('supports weekly frequency', async () => {
    const res = await ragRunQualityCheck.handler({ frequency: 'weekly' }, pipeline);
    expect(parseToolResult(res).frequency).toBe('weekly');
  });
});
