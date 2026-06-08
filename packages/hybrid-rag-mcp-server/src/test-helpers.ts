/**
 * Shared test helpers for MCP server tool tests.
 *
 * Kept intentionally branch-free so the file reaches full coverage when
 * imported by tests. Tests build pipeline fakes by passing an explicit object
 * of method overrides; no defaults or conditionals live here.
 */

import type { RAGPipeline } from './types.js';

/**
 * Build a fake RAGPipeline from an object of method overrides.
 */
export function makePipeline(methods: Record<string, unknown>): RAGPipeline {
  return methods as unknown as RAGPipeline;
}

/**
 * Parse the JSON payload from a tool result's first text content block.
 */
export function parseToolResult(result: {
  content: Array<{ type: string; text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}
