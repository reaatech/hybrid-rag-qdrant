/**
 * MCP tool input validation utilities using Zod
 */

import type { ZodError, ZodSchema } from 'zod';

export interface ValidationError {
  error: string;
  details?: string[];
}

export function validateInput<T>(
  schema: ZodSchema<T>,
  args: Record<string, unknown>,
):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ValidationError;
    } {
  const result = schema.safeParse(args);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: {
      error: 'Invalid input',
      details: formatZodErrors(result.error),
    },
  };
}

function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export function makeErrorResponse(error: ValidationError) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(error) }],
    isError: true as const,
  };
}
