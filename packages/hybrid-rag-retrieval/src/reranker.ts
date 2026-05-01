/**
 * Reranker (Cross-Encoder) engine
 */

import type { RetrievalResult } from '@reaatech/hybrid-rag';
import { getLogger } from '@reaatech/hybrid-rag-observability';

const logger = getLogger();

/**
 * Reranker provider types
 */
export type RerankerProvider = 'cohere' | 'jina' | 'openai' | 'local';

/**
 * Reranker configuration
 */
export interface RerankerConfig {
  /** Provider type */
  provider: RerankerProvider;
  /** Model name */
  model?: string;
  /** API key */
  apiKey?: string;
  /** Top-K documents to rerank */
  topK?: number;
  /** Final number of results to return */
  finalK?: number;
}

/**
 * Reranker result
 */
export interface RerankerResult {
  chunkId: string;
  documentId: string;
  content: string;
  relevanceScore: number;
  metadata: Record<string, unknown>;
}

/**
 * Reranker interface
 */
export interface RerankerInterface {
  /**
   * Rerank documents for a query
   */
  rerank(query: string, documents: string[]): Promise<RerankerResult[]>;
}

/**
 * Compute relevance score based on query-document term overlap
 * This provides a deterministic baseline scoring when API is unavailable
 */
function computeRelevanceScore(query: string, document: string): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const docTerms = document.toLowerCase().split(/\s+/);
  const docSet = new Set(docTerms);

  if (queryTerms.length === 0) {
    return 0;
  }

  let matchCount = 0;
  for (const term of queryTerms) {
    if (docSet.has(term)) {
      matchCount++;
    } else {
      for (const docTerm of docTerms) {
        if (docTerm.includes(term) || term.includes(docTerm)) {
          matchCount += 0.5;
          break;
        }
      }
    }
  }

  const exactMatchRatio = matchCount / queryTerms.length;
  const coverage = matchCount / (queryTerms.length + docTerms.length);

  return Math.min(1, exactMatchRatio * 0.7 + coverage * 0.3);
}

/**
 * Reranker engine - provider-agnostic
 */
export class RerankerEngine implements RerankerInterface {
  private readonly config: Required<RerankerConfig>;

  constructor(config: RerankerConfig) {
    this.config = {
      provider: config.provider,
      model: config.model ?? this.getDefaultModel(config.provider),
      apiKey: config.apiKey ?? '',
      topK: config.topK ?? 10,
      finalK: config.finalK ?? 5,
    };
  }

  private getDefaultModel(provider: RerankerProvider): string {
    switch (provider) {
      case 'cohere':
        return 'rerank-english-v3.0';
      case 'jina':
        return 'jina-reranker-v2-base-multilingual';
      case 'openai':
        return 'gpt-4o';
      case 'local':
        return 'cross-encoder/ms-marco-MiniLM-L-6-v2';
      default:
        return 'rerank-english-v3.0';
    }
  }

  async rerank(query: string, documents: string[]): Promise<RerankerResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const docsToRerank = documents.slice(0, this.config.topK);

    switch (this.config.provider) {
      case 'cohere':
        return this.rerankCohere(query, docsToRerank);
      case 'jina':
        return this.rerankJina(query, docsToRerank);
      case 'openai':
        return this.rerankOpenAI(query, docsToRerank);
      case 'local':
        return this.rerankLocal(query, docsToRerank);
      default:
        throw new Error(`Unknown reranker provider: ${this.config.provider}`);
    }
  }

  async rerankResults(
    query: string,
    results: RetrievalResult[],
  ): Promise<Array<RetrievalResult & { rerankScore: number; rerankRank: number }>> {
    if (results.length === 0) {
      return [];
    }

    const resultsList = [...results];
    const rerankedDocs = await this.rerank(
      query,
      resultsList.map((r) => r.content),
    );

    return rerankedDocs
      .slice(0, this.config.finalK)
      .map((r, index) => {
        const originalIdx = resultsList.findIndex((res) => res.content === r.content);
        if (originalIdx === -1) {
          return null;
        }
        const original = resultsList[originalIdx];
        return {
          ...original,
          rerankScore: r.relevanceScore,
          rerankRank: index + 1,
        } as RetrievalResult & { rerankScore: number; rerankRank: number };
      })
      .filter(
        (r): r is RetrievalResult & { rerankScore: number; rerankRank: number } => r !== null,
      );
  }

  private async rerankCohere(query: string, documents: string[]): Promise<RerankerResult[]> {
    if (!this.config.apiKey) {
      logger.warn('Cohere reranker: no API key provided, using local fallback');
      return this.rerankLocal(query, documents);
    }

    try {
      const response = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          documents,
          model: this.config.model,
          top_n: Math.min(documents.length, this.config.finalK),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Cohere API ${response.status}: ${body}`);
      }

      const data = (await response.json()) as {
        results: Array<{ index: number; relevance_score: number }>;
      };

      return data.results.map((r) => ({
        chunkId: `cohere-${r.index}`,
        documentId: `doc-${r.index}`,
        content: documents[r.index] ?? '',
        relevanceScore: r.relevance_score,
        metadata: { provider: 'cohere', model: this.config.model },
      }));
    } catch (error) {
      logger.warn(`Cohere reranker failed, falling back to local: ${(error as Error).message}`);
      return this.rerankLocal(query, documents);
    }
  }

  private async rerankJina(query: string, documents: string[]): Promise<RerankerResult[]> {
    if (!this.config.apiKey) {
      logger.warn('Jina reranker: no API key provided, using local fallback');
      return this.rerankLocal(query, documents);
    }

    try {
      const response = await fetch('https://api.jina.ai/v1/rerank', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          documents,
          model: this.config.model,
          top_n: Math.min(documents.length, this.config.finalK),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Jina API ${response.status}: ${body}`);
      }

      const data = (await response.json()) as {
        results: Array<{ index: number; relevance_score: number; document: { text: string } }>;
      };

      return data.results.map((r) => ({
        chunkId: `jina-${r.index}`,
        documentId: `doc-${r.index}`,
        content: r.document?.text ?? documents[r.index] ?? '',
        relevanceScore: r.relevance_score,
        metadata: { provider: 'jina', model: this.config.model },
      }));
    } catch (error) {
      logger.warn(`Jina reranker failed, falling back to local: ${(error as Error).message}`);
      return this.rerankLocal(query, documents);
    }
  }

  private async rerankOpenAI(query: string, documents: string[]): Promise<RerankerResult[]> {
    if (!this.config.apiKey) {
      logger.warn('OpenAI reranker: no API key provided, using local fallback');
      return this.rerankLocal(query, documents);
    }

    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: this.config.apiKey });

      const scoredDocs: Array<{ index: number; score: number }> = [];
      const batchSize = 10;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const numberedDocs = batch.map((d, j) => `[${i + j}] ${d}`).join('\n\n');

        const completion = await client.chat.completions.create({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a relevance scoring engine. Score each document\'s relevance to the query on a scale of 0.0 to 1.0. Respond ONLY with a JSON array of objects with "index" and "score" fields, no other text.',
            },
            {
              role: 'user',
              content: `Query: "${query}"\n\nDocuments:\n${numberedDocs}\n\nScore each document's relevance to the query.`,
            },
          ],
          temperature: 0,
          max_tokens: 1024,
        });

        const text = completion.choices[0]?.message?.content ?? '[]';
        const cleaned = text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        const scores = JSON.parse(cleaned) as Array<{ index: number; score: number }>;
        scoredDocs.push(...scores);
      }

      return scoredDocs
        .sort((a, b) => b.score - a.score)
        .slice(0, this.config.finalK)
        .map((r) => ({
          chunkId: `openai-${r.index}`,
          documentId: `doc-${r.index}`,
          content: documents[r.index] ?? '',
          relevanceScore: Math.max(0, Math.min(1, r.score)),
          metadata: { provider: 'openai', model: this.config.model },
        }));
    } catch (error) {
      logger.warn(`OpenAI reranker failed, falling back to local: ${(error as Error).message}`);
      return this.rerankLocal(query, documents);
    }
  }

  private async rerankLocal(query: string, documents: string[]): Promise<RerankerResult[]> {
    return documents
      .map((doc, i) => ({
        chunkId: `local-${i}`,
        documentId: `doc-${i}`,
        content: doc,
        relevanceScore: computeRelevanceScore(query, doc),
        metadata: { provider: 'local' },
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  getConfig(): RerankerConfig {
    return this.config;
  }
}
