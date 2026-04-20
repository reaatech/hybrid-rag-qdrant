/**
 * MCP Cost Management Tools
 *
 * Tools for cost tracking, budgeting, optimization recommendations,
 * and cost control enforcement across RAG operations.
 */

import type { RAGTool } from '../../mcp-server/types.js';
import type { RAGPipeline } from '../../pipeline.js';

/**
 * Budget configuration
 */
export interface BudgetConfig {
  budget_type: 'per-query' | 'daily' | 'monthly';
  limit: number;
  alert_thresholds: number[];
  hard_limit: boolean;
  scope?: {
    user_id?: string;
    project?: string;
  };
}

/**
 * Budget status tracking
 */
export interface BudgetStatus {
  budget_type: string;
  limit: number;
  spent: number;
  remaining: number;
  percentage_used: number;
  alert_triggered: boolean;
  hard_limit_reached: boolean;
}

/**
 * Cost breakdown by component
 */
export interface CostBreakdown {
  embeddings: number;
  vector_search: number;
  bm25_search: number;
  reranking: number;
  llm_judge: number;
  total: number;
}

/**
 * Simple in-memory cost tracker
 * In production, this would be backed by a database
 */
class CostTracker {
  private budgets: Map<string, BudgetConfig> = new Map();
  private spending: Map<string, number> = new Map();
  private costHistory: Array<{
    timestamp: string;
    amount: number;
    component: string;
    metadata: Record<string, unknown>;
  }> = [];
  private static readonly MAX_COST_HISTORY = 10000;

  /**
   * Set a budget
   */
  setBudget(key: string, config: BudgetConfig): void {
    this.budgets.set(key, config);
    if (!this.spending.has(key)) {
      this.spending.set(key, 0);
    }
  }

  /**
   * Get budget status
   */
  getBudgetStatus(key: string): BudgetStatus | null {
    const budget = this.budgets.get(key);
    if (!budget) {
      return null;
    }

    const spent = this.spending.get(key) || 0;
    const remaining = budget.limit - spent;
    const percentageUsed = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
    const alertTriggered = budget.alert_thresholds.some((t) => percentageUsed >= t * 100);
    const hardLimitReached = budget.hard_limit && spent >= budget.limit;

    return {
      budget_type: budget.budget_type,
      limit: budget.limit,
      spent,
      remaining: Math.max(0, remaining),
      percentage_used: Math.min(100, percentageUsed),
      alert_triggered: alertTriggered,
      hard_limit_reached: hardLimitReached,
    };
  }

  /**
   * Track spending
   */
  trackSpending(
    key: string,
    amount: number,
    component: string,
    metadata: Record<string, unknown> = {},
  ): void {
    const current = this.spending.get(key) || 0;
    this.spending.set(key, current + amount);

    this.costHistory.push({
      timestamp: new Date().toISOString(),
      amount,
      component,
      metadata,
    });
    if (this.costHistory.length > CostTracker.MAX_COST_HISTORY) {
      this.costHistory = this.costHistory.slice(-CostTracker.MAX_COST_HISTORY);
    }
  }

  /**
   * Get cost report
   */
  getCostReport(period: 'day' | 'week' | 'month' = 'day'): CostBreakdown {
    const now = new Date();
    let cutoff: Date;

    switch (period) {
      case 'day':
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case 'month':
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
    }

    const breakdown: CostBreakdown = {
      embeddings: 0,
      vector_search: 0,
      bm25_search: 0,
      reranking: 0,
      llm_judge: 0,
      total: 0,
    };

    for (const record of this.costHistory) {
      const recordDate = new Date(record.timestamp);
      if (recordDate >= cutoff) {
        switch (record.component) {
          case 'embeddings':
            breakdown.embeddings += record.amount;
            break;
          case 'vector_search':
            breakdown.vector_search += record.amount;
            break;
          case 'bm25_search':
            breakdown.bm25_search += record.amount;
            break;
          case 'reranking':
            breakdown.reranking += record.amount;
            break;
          case 'llm_judge':
            breakdown.llm_judge += record.amount;
            break;
        }
        breakdown.total += record.amount;
      }
    }

    return breakdown;
  }

  /**
   * Check if spending is within budget
   */
  canSpend(key: string, amount: number): boolean {
    const budget = this.budgets.get(key);
    if (!budget) {
      return true;
    } // No budget set

    const current = this.spending.get(key) || 0;
    const newTotal = current + amount;

    if (budget.hard_limit && newTotal > budget.limit) {
      return false;
    }

    return true;
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(currentConfig: {
    useReranker: boolean;
    rerankerProvider?: string;
    topK: number;
    embeddingModel?: string;
  }): Array<{
    strategy: string;
    estimated_savings: number;
    quality_impact: 'none' | 'low' | 'medium' | 'high';
    description: string;
  }> {
    const recommendations = [];

    // Reranker optimization
    if (currentConfig.useReranker) {
      if (currentConfig.rerankerProvider === 'cohere') {
        recommendations.push({
          strategy: 'Use local reranker',
          estimated_savings: 0.008 * currentConfig.topK,
          quality_impact: 'medium' as const,
          description: 'Switch from Cohere API to local cross-encoder model',
        });
      }

      recommendations.push({
        strategy: 'Skip reranking for simple queries',
        estimated_savings: 0.01 * currentConfig.topK,
        quality_impact: 'low' as const,
        description: "Use query analysis to identify simple queries that don't need reranking",
      });
    }

    // TopK optimization
    if (currentConfig.topK > 10) {
      recommendations.push({
        strategy: 'Reduce topK',
        estimated_savings: 0.001 * (currentConfig.topK - 10),
        quality_impact: 'low' as const,
        description: `Reduce results from ${currentConfig.topK} to 10 for non-critical queries`,
      });
    }

    // Embedding model optimization
    if (currentConfig.embeddingModel === 'text-embedding-3-large') {
      recommendations.push({
        strategy: 'Use smaller embedding model',
        estimated_savings: 0.0001,
        quality_impact: 'medium' as const,
        description: 'Switch from text-embedding-3-large to text-embedding-3-small',
      });
    }

    return recommendations.sort((a, b) => b.estimated_savings - a.estimated_savings);
  }
}

// Global cost tracker instance
const costTracker = new CostTracker();

/**
 * Default pricing (per 1K tokens unless otherwise noted)
 */
const PRICING = {
  embeddings: {
    'text-embedding-3-small': 0.02,
    'text-embedding-3-large': 0.13,
  },
  reranking: {
    cohere: 0.01, // per document
    jina: 0.005, // per document
    openai: 0.002, // per document (estimated)
    local: 0, // no API cost
  },
  llm_judge: {
    'claude-opus': 0.015, // per 1K input tokens (estimated)
    'claude-sonnet': 0.003, // per 1K input tokens
    'gpt-4': 0.03, // per 1K input tokens
  },
};

/**
 * rag.get_cost_estimate - Estimate cost for a query before execution
 */
export const ragGetCostEstimate: RAGTool = {
  name: 'rag.get_cost_estimate',
  description: 'Estimate the cost of a query before execution',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query to estimate cost for',
      },
      config: {
        type: 'object',
        description: 'Query configuration',
        properties: {
          useReranker: { type: 'boolean', default: false },
          rerankerProvider: { type: 'string', enum: ['cohere', 'jina', 'openai', 'local'] },
          topK: { type: 'number', default: 10 },
          embeddingModel: { type: 'string', default: 'text-embedding-3-small' },
        },
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const query = args.query as string;
    const config = args.config as Record<string, unknown> | undefined;

    // Estimate token count (rough approximation: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil(query.length / 4);
    const embeddingModel = (config?.embeddingModel as string) ?? 'text-embedding-3-small';
    const topK = (config?.topK as number) ?? 10;
    const useReranker = (config?.useReranker as boolean) ?? false;
    const rerankerProvider = (config?.rerankerProvider as string) ?? 'cohere';

    // Calculate costs
    const embeddingCost =
      (estimatedTokens / 1000) *
      (PRICING.embeddings[embeddingModel as keyof typeof PRICING.embeddings] ||
        PRICING.embeddings['text-embedding-3-small']);
    const rerankerCost = useReranker
      ? topK * (PRICING.reranking[rerankerProvider as keyof typeof PRICING.reranking] || 0)
      : 0;
    const vectorSearchCost = 0.0001; // Minimal Qdrant cost
    const bm25SearchCost = 0.00005; // Minimal compute cost

    const totalCost = embeddingCost + rerankerCost + vectorSearchCost + bm25SearchCost;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              estimated_tokens: estimatedTokens,
              cost_breakdown: {
                embeddings: parseFloat(embeddingCost.toFixed(6)),
                reranking: parseFloat(rerankerCost.toFixed(6)),
                vector_search: vectorSearchCost,
                bm25_search: bm25SearchCost,
              },
              total_cost: parseFloat(totalCost.toFixed(6)),
              config: {
                embedding_model: embeddingModel,
                top_k: topK,
                use_reranker: useReranker,
                reranker_provider: rerankerProvider,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * rag.set_budget - Configure budget limits
 */
export const ragSetBudget: RAGTool = {
  name: 'rag.set_budget',
  description: 'Configure budget limits for cost control',
  inputSchema: {
    type: 'object',
    properties: {
      budget_type: {
        type: 'string',
        enum: ['per-query', 'daily', 'monthly'],
        description: 'Type of budget limit',
      },
      limit: {
        type: 'number',
        description: 'Budget limit amount in USD',
      },
      alert_thresholds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Alert thresholds as decimals (e.g., [0.5, 0.75, 0.9])',
        default: [0.5, 0.75, 0.9],
      },
      hard_limit: {
        type: 'boolean',
        description: 'Whether to enforce hard limit (stop processing when exceeded)',
        default: false,
      },
      scope: {
        type: 'object',
        description: 'Budget scope',
        properties: {
          user_id: { type: 'string' },
          project: { type: 'string' },
        },
      },
    },
    required: ['budget_type', 'limit'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const budgetType = args.budget_type as string;
    const limit = args.limit as number;
    const alertThresholds = (args.alert_thresholds as number[]) ?? [0.5, 0.75, 0.9];
    const hardLimit = (args.hard_limit as boolean) ?? false;
    const scope = args.scope as { user_id?: string; project?: string } | undefined;

    const key = [scope?.user_id, scope?.project].filter(Boolean).join(':') || 'default';

    const config: BudgetConfig = {
      budget_type: budgetType as BudgetConfig['budget_type'],
      limit,
      alert_thresholds: alertThresholds,
      hard_limit: hardLimit,
      scope,
    };

    costTracker.setBudget(key, config);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Budget set for ${key}`,
              budget: {
                key,
                ...config,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * rag.get_budget_status - Get current budget status
 */
export const ragGetBudgetStatus: RAGTool = {
  name: 'rag.get_budget_status',
  description: 'Get current budget status and remaining capacity',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'object',
        description: 'Budget scope to check',
        properties: {
          user_id: { type: 'string' },
          project: { type: 'string' },
        },
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const scope = args.scope as { user_id?: string; project?: string } | undefined;
    const key = [scope?.user_id, scope?.project].filter(Boolean).join(':') || 'default';

    const status = costTracker.getBudgetStatus(key);

    if (!status) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: 'No budget configured',
                key,
                suggestion: 'Use rag.set_budget to configure a budget',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              key,
              status,
              recommendations:
                status.percentage_used > 80
                  ? ['Consider reducing topK', 'Skip reranking for simple queries']
                  : [],
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * rag.optimize_cost - Get cost optimization recommendations
 */
export const ragOptimizeCost: RAGTool = {
  name: 'rag.optimize_cost',
  description: 'Get cost optimization recommendations based on current configuration',
  inputSchema: {
    type: 'object',
    properties: {
      current_config: {
        type: 'object',
        description: 'Current RAG configuration',
        properties: {
          useReranker: { type: 'boolean' },
          rerankerProvider: { type: 'string' },
          topK: { type: 'number' },
          embeddingModel: { type: 'string' },
        },
      },
      target_quality: {
        type: 'number',
        description: 'Target quality score (0-1)',
        default: 0.8,
      },
      budget_constraint: {
        type: 'number',
        description: 'Maximum cost per query in USD',
        default: 0.05,
      },
    },
    required: ['current_config'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const currentConfig = args.current_config as {
      useReranker: boolean;
      rerankerProvider?: string;
      topK: number;
      embeddingModel?: string;
    };

    const targetQuality = (args.target_quality as number) ?? 0.8;
    const budgetConstraint = (args.budget_constraint as number) ?? 0.05;

    const recommendations = costTracker.getOptimizationRecommendations(currentConfig);

    // Filter recommendations based on quality impact and budget
    const filteredRecommendations = recommendations.filter((rec) => {
      if (rec.quality_impact === 'high') {
        return false;
      }
      if (rec.quality_impact === 'medium' && targetQuality > 0.9) {
        return false;
      }
      return rec.estimated_savings > 0;
    });

    const currentEstimatedCost = currentConfig.useReranker
      ? 0.001 + currentConfig.topK * 0.01
      : 0.001;

    const potentialSavings = filteredRecommendations.reduce(
      (sum, rec) => sum + rec.estimated_savings,
      0,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              current_config: currentConfig,
              current_estimated_cost: currentEstimatedCost,
              budget_constraint: budgetConstraint,
              target_quality: targetQuality,
              recommendations: filteredRecommendations,
              total_potential_savings: potentialSavings,
              new_estimated_cost: Math.max(0, currentEstimatedCost - potentialSavings),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

/**
 * rag.get_cost_report - Get detailed cost breakdown
 */
export const ragGetCostReport: RAGTool = {
  name: 'rag.get_cost_report',
  description: 'Get detailed cost breakdown by component',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['day', 'week', 'month'],
        description: 'Time period for the report',
        default: 'day',
      },
      group_by: {
        type: 'array',
        items: { type: 'string', enum: ['component', 'user', 'project'] },
        description: 'How to group the cost data',
      },
      include_trends: {
        type: 'boolean',
        description: 'Include trend analysis',
        default: false,
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Report format',
        default: 'summary',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const period = (args.period as 'day' | 'week' | 'month') ?? 'day';
    const _groupBy = args.group_by as string[] | undefined;
    const includeTrends = (args.include_trends as boolean) ?? false;
    const _format = (args.format as 'summary' | 'detailed') ?? 'summary';

    const breakdown = costTracker.getCostReport(period);

    const report: Record<string, unknown> = {
      period,
      generated_at: new Date().toISOString(),
      breakdown,
      summary: {
        total_cost: breakdown.total,
        largest_component:
          Object.entries(breakdown)
            .filter(([key]) => key !== 'total')
            .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || 'none',
      },
    };

    if (includeTrends) {
      // Simplified trend analysis
      report['trends'] = {
        note: 'Trend analysis requires historical data storage',
        suggestion: 'Implement persistent cost tracking for trend analysis',
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  },
};

/**
 * rag.set_cost_controls - Configure cost controls and alerts
 */
export const ragSetCostControls: RAGTool = {
  name: 'rag.set_cost_controls',
  description: 'Configure cost controls and alert settings',
  inputSchema: {
    type: 'object',
    properties: {
      max_cost_per_query: {
        type: 'number',
        description: 'Maximum cost allowed per query',
      },
      max_cost_per_day: {
        type: 'number',
        description: 'Maximum cost allowed per day',
      },
      alert_thresholds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Alert thresholds as percentages',
      },
      hard_limit: {
        type: 'boolean',
        description: 'Enforce hard limits (stop processing when exceeded)',
        default: false,
      },
      alert_channels: {
        type: 'array',
        items: { type: 'string', enum: ['email', 'slack', 'webhook'] },
        description: 'Channels for sending alerts',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const maxCostPerQuery = args.max_cost_per_query as number | undefined;
    const maxCostPerDay = args.max_cost_per_day as number | undefined;
    const alertThresholds = args.alert_thresholds as number[] | undefined;
    const hardLimit = (args.hard_limit as boolean) ?? false;
    const alertChannels = args.alert_channels as string[] | undefined;

    // Set per-query budget if specified
    if (maxCostPerQuery !== undefined) {
      costTracker.setBudget('per-query', {
        budget_type: 'per-query',
        limit: maxCostPerQuery,
        alert_thresholds: alertThresholds || [0.8, 0.9, 1.0],
        hard_limit: hardLimit,
      });
    }

    // Set daily budget if specified
    if (maxCostPerDay !== undefined) {
      costTracker.setBudget('daily', {
        budget_type: 'daily',
        limit: maxCostPerDay,
        alert_thresholds: alertThresholds || [0.5, 0.75, 0.9],
        hard_limit: hardLimit,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: 'Cost controls configured',
              configuration: {
                max_cost_per_query: maxCostPerQuery,
                max_cost_per_day: maxCostPerDay,
                alert_thresholds: alertThresholds,
                hard_limit: hardLimit,
                alert_channels: alertChannels,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const costManagementTools: RAGTool[] = [
  ragGetCostEstimate,
  ragSetBudget,
  ragGetBudgetStatus,
  ragOptimizeCost,
  ragGetCostReport,
  ragSetCostControls,
];
