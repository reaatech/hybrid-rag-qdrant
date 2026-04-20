/**
 * Ablation results reporting
 */

import type { AblationResults, AblationVariantResult } from './runner.js';

/**
 * Generate markdown table from ablation results
 */
export function generateMarkdownTable(results: AblationResults): string {
  const lines: string[] = [];

  // Header
  lines.push('| Configuration | Precision@K | Recall@K | NDCG@K | MAP | MRR | Δ NDCG@K |');
  lines.push('|---------------|-------------|----------|--------|-----|-----|----------|');

  // Baseline
  const baseline = results.baseline.metrics;
  lines.push(
    `| **Baseline** | ${baseline.precisionAtK.toFixed(4)} | ${baseline.recallAtK.toFixed(4)} | ${baseline.ndcgAtK.toFixed(4)} | ${baseline.map.toFixed(4)} | ${baseline.mrr.toFixed(4)} | — |`,
  );

  // Variants
  for (const variant of results.variants) {
    const m = variant.metrics;
    const delta = variant.delta.ndcgAtK;
    const deltaStr = delta >= 0 ? `+${delta.toFixed(4)}` : delta.toFixed(4);
    lines.push(
      `| ${variant.variant.name} | ${m.precisionAtK.toFixed(4)} | ${m.recallAtK.toFixed(4)} | ${m.ndcgAtK.toFixed(4)} | ${m.map.toFixed(4)} | ${m.mrr.toFixed(4)} | ${deltaStr} |`,
    );
  }

  return lines.join('\n');
}

/**
 * Generate summary text from ablation results
 */
export function generateSummary(results: AblationResults): string {
  const lines: string[] = [];

  lines.push('# Ablation Study Results\n');
  lines.push(`**Total variants tested:** ${results.variants.length}\n`);
  lines.push('## Baseline Configuration\n');
  lines.push(`- Chunking: ${results.baseline.config.chunking}`);
  lines.push(`- Chunk size: ${results.baseline.config.chunkSize}`);
  lines.push(`- Overlap: ${results.baseline.config.overlap}`);
  lines.push(`- Retrieval: ${results.baseline.config.retrieval}`);
  lines.push(`- Vector weight: ${results.baseline.config.vectorWeight}`);
  lines.push(`- BM25 weight: ${results.baseline.config.bm25Weight}`);
  lines.push(`- Reranker: ${results.baseline.config.reranker ?? 'none'}`);
  lines.push(`- Top-K: ${results.baseline.config.topK}\n`);

  lines.push('## Baseline Metrics\n');
  const bm = results.baseline.metrics;
  lines.push(`- Precision@K: ${bm.precisionAtK.toFixed(4)}`);
  lines.push(`- Recall@K: ${bm.recallAtK.toFixed(4)}`);
  lines.push(`- NDCG@K: ${bm.ndcgAtK.toFixed(4)}`);
  lines.push(`- MAP: ${bm.map.toFixed(4)}`);
  lines.push(`- MRR: ${bm.mrr.toFixed(4)}\n`);

  lines.push('## Variant Results\n');
  lines.push(generateMarkdownTable(results));
  lines.push('\n');

  // Find best variant
  const bestVariant =
    results.variants.length > 0
      ? results.variants.reduce((best, v) => (v.metrics.ndcgAtK > best.metrics.ndcgAtK ? v : best))
      : null;

  lines.push('## Key Findings\n');
  if (bestVariant) {
    lines.push(
      `- **Best performing variant:** ${bestVariant.variant.name} (NDCG@K: ${bestVariant.metrics.ndcgAtK.toFixed(4)})`,
    );
    lines.push(
      `- **Biggest improvement over baseline:** +${bestVariant.delta.ndcgAtK.toFixed(4)} NDCG@K`,
    );
  }

  // Find worst variant
  const worstVariant =
    results.variants.length > 0
      ? results.variants.reduce((worst, v) =>
          v.metrics.ndcgAtK < worst.metrics.ndcgAtK ? v : worst,
        )
      : null;

  if (worstVariant) {
    lines.push(
      `- **Worst performing variant:** ${worstVariant.variant.name} (NDCG@K: ${worstVariant.metrics.ndcgAtK.toFixed(4)})`,
    );
  }

  return lines.join('\n');
}

/**
 * Get variant results sorted by NDCG@K
 */
export function sortByNDCG(variants: AblationVariantResult[]): AblationVariantResult[] {
  return [...variants].sort((a, b) => b.metrics.ndcgAtK - a.metrics.ndcgAtK);
}

/**
 * Get variant results sorted by delta from baseline
 */
export function sortByDelta(variants: AblationVariantResult[]): AblationVariantResult[] {
  return [...variants].sort((a, b) => b.delta.ndcgAtK - a.delta.ndcgAtK);
}
