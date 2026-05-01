/**
 * Provider-agnostic embedding generation
 */

import { OpenAI } from 'openai';

/**
 * Embedding provider types
 */
export type EmbeddingProvider = 'openai' | 'vertex' | 'local';

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  /** Provider type */
  provider: EmbeddingProvider;
  /** Model name */
  model: string;
  /** API key (for cloud providers) */
  apiKey?: string;
  /** Dimension of embeddings (optional, can be inferred from model) */
  dimension?: number;
  /** Batch size for embedding requests */
  batchSize?: number;
  /** Rate limit (requests per minute) */
  rateLimit?: number;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Number of tokens used */
  tokens: number;
  /** Cost in USD */
  cost: number;
}

/**
 * Embedding generation service
 */
export class EmbeddingService {
  private readonly config: EmbeddingConfig;
  private openaiClient: OpenAI | null = null;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    switch (this.config.provider) {
      case 'openai':
        return this.embedOpenAI(text);
      case 'vertex':
        return this.embedVertex(text);
      case 'local':
        return this.embedLocal(text);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const batchSize = this.config.batchSize ?? 100;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await this.embedBatchInternal(batch);
      results.push(...batchResults);

      // Rate limiting
      if (this.config.rateLimit && batchResults.length > 0) {
        const delay = (60 / this.config.rateLimit) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * OpenAI embedding
   */
  private async embedOpenAI(text: string): Promise<EmbeddingResult> {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: this.config.apiKey });
    }

    const response = await this.openaiClient.embeddings.create({
      model: this.config.model,
      input: text,
    });

    const embedding = response.data[0]?.embedding ?? [];
    const tokens = response.usage?.prompt_tokens ?? 0;
    const cost = this.calculateCost(tokens);

    return { embedding, tokens, cost };
  }

  /**
   * Vertex AI embedding (placeholder - implement with @google/generative-ai)
   */
  private async embedVertex(_text: string): Promise<EmbeddingResult> {
    // Placeholder implementation
    // In production, use @google/generative-ai package
    throw new Error('Vertex AI embedding not yet implemented');
  }

  /**
   * Local embedding (placeholder - implement with transformers.js)
   */
  private async embedLocal(_text: string): Promise<EmbeddingResult> {
    // Placeholder implementation
    // In production, use @xenova/transformers.js
    throw new Error('Local embedding not yet implemented');
  }

  /**
   * Internal batch embedding
   */
  private async embedBatchInternal(texts: string[]): Promise<EmbeddingResult[]> {
    if (this.config.provider === 'openai') {
      if (!this.openaiClient) {
        this.openaiClient = new OpenAI({ apiKey: this.config.apiKey });
      }

      const response = await this.openaiClient.embeddings.create({
        model: this.config.model,
        input: texts,
      });

      const totalTokens = response.usage?.prompt_tokens ?? 0;
      const tokensPerItem = texts.length > 0 ? Math.ceil(totalTokens / texts.length) : 0;

      return response.data.map((data) => ({
        embedding: data.embedding,
        tokens: tokensPerItem,
        cost: this.calculateCost(tokensPerItem),
      }));
    }

    return Promise.all(texts.map((text) => this.embed(text)));
  }

  /**
   * Calculate cost based on token count
   */
  private calculateCost(tokens: number): number {
    const pricing: Record<string, number> = {
      'text-embedding-3-small': 0.02 / 1_000_000, // $0.02 per 1M tokens
      'text-embedding-3-large': 0.13 / 1_000_000, // $0.13 per 1M tokens
    };

    const rate = pricing[this.config.model] ?? 0;
    return tokens * rate;
  }

  /**
   * Get the dimension for a model
   */
  static getDimension(model: string): number {
    const dimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
    };
    return dimensions[model] ?? 1536;
  }
}
