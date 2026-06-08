import { describe, expect, it } from 'vitest';
import { CostTracker } from './cost-management.js';

describe('CostTracker', () => {
  it('tracks spending per component and reports the day breakdown', () => {
    const tracker = new CostTracker();
    const components = [
      'embeddings',
      'vector_search',
      'bm25_search',
      'reranking',
      'llm_judge',
      'vector_store',
    ];
    for (const component of components) {
      tracker.trackSpending('user-1', 1, component, { note: component });
    }
    // An unknown component still adds to total but no per-component bucket.
    tracker.trackSpending('user-1', 5, 'mystery');

    const report = tracker.getCostReport('day');
    expect(report.embeddings).toBe(1);
    expect(report.vector_search).toBe(1);
    expect(report.bm25_search).toBe(1);
    expect(report.reranking).toBe(1);
    expect(report.llm_judge).toBe(1);
    expect(report.vector_store).toBe(1);
    expect(report.total).toBe(11);
  });

  it('supports week and month report periods', () => {
    const tracker = new CostTracker();
    tracker.trackSpending('k', 2, 'embeddings');
    expect(tracker.getCostReport('week').total).toBe(2);
    expect(tracker.getCostReport('month').total).toBe(2);
  });

  it('trims cost history beyond the retention cap', () => {
    const tracker = new CostTracker();
    for (let i = 0; i < 10_005; i++) {
      tracker.trackSpending('k', 1, 'embeddings');
    }
    // Still reports correctly after trimming the in-memory history.
    expect(tracker.getCostReport('day').embeddings).toBeGreaterThan(0);
  });

  it('canSpend allows spending when no budget is configured', () => {
    const tracker = new CostTracker();
    expect(tracker.canSpend('no-budget', 100)).toBe(true);
  });

  it('canSpend blocks spending past a hard limit but allows soft limits', () => {
    const tracker = new CostTracker();
    tracker.setBudget('hard', {
      budget_type: 'daily',
      limit: 10,
      alert_thresholds: [0.8],
      hard_limit: true,
    });
    tracker.trackSpending('hard', 9, 'embeddings');
    expect(tracker.canSpend('hard', 0.5)).toBe(true);
    expect(tracker.canSpend('hard', 5)).toBe(false);

    tracker.setBudget('soft', {
      budget_type: 'daily',
      limit: 10,
      alert_thresholds: [0.8],
      hard_limit: false,
    });
    tracker.trackSpending('soft', 9, 'embeddings');
    expect(tracker.canSpend('soft', 100)).toBe(true);
  });
});
