import { type VectorStoreConfig, vectorStoreConfigSchema } from '@reaatech/hybrid-rag';
import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import type { RAGTool } from '../types.js';

const SENSITIVE_KEYS = ['apiKey', 'connectionString', 'serviceRoleKey', 'password', 'token'];

function redactSensitiveConfig(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  for (const key of SENSITIVE_KEYS) {
    if (result[key] !== undefined && result[key] !== null) {
      result[key] = '***REDACTED***';
    }
  }
  return result;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function getConfiguredAllowedHosts(args: Record<string, unknown>): Set<string> {
  const fromArgs = Array.isArray(args.allowedHosts)
    ? (args.allowedHosts.filter((v): v is string => typeof v === 'string') as string[])
    : [];
  const fromEnv = (process.env.HYBRID_RAG_MIGRATION_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  return new Set([...fromArgs, ...fromEnv]);
}

function extractHost(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return new URL(value).hostname;
  } catch {
    const hostMatch = value.match(/(?:host|server)=([^;\s]+)/i);
    return hostMatch?.[1] ?? null;
  }
}

function configHosts(config: VectorStoreConfig): string[] {
  const hostFields = ['url', 'endpoint', 'node', 'address', 'connectionString'] as const;
  return hostFields
    .map((field) => extractHost((config as unknown as Record<string, unknown>)[field]))
    .filter((host): host is string => Boolean(host));
}

function validateMigrationTarget(
  label: string,
  config: VectorStoreConfig,
  allowedHosts: Set<string>,
  allowExternalTarget: boolean,
): string | null {
  const hosts = configHosts(config);
  if (hosts.length === 0) {
    return null;
  }

  for (const host of hosts) {
    if (LOCAL_HOSTS.has(host) || allowedHosts.has(host)) {
      continue;
    }
    if (!allowExternalTarget) {
      return `${label} host '${host}' is external. Set allowExternalTarget and add it to allowedHosts or HYBRID_RAG_MIGRATION_ALLOWED_HOSTS.`;
    }
    return `${label} host '${host}' is not in the migration allowlist. Add it to allowedHosts or HYBRID_RAG_MIGRATION_ALLOWED_HOSTS.`;
  }

  return null;
}

export const ragMigrate: RAGTool = {
  name: 'rag.migrate',
  description: 'Export vectors from one database and import to another',
  inputSchema: {
    type: 'object',
    properties: {
      sourceConfig: { type: 'object', description: 'Source vector store configuration' },
      targetConfig: { type: 'object', description: 'Target vector store configuration' },
      batchSize: { type: 'number', description: 'Batch size (default: 100)' },
      collection: { type: 'string', description: 'Collection to migrate' },
      allowExternalTarget: {
        type: 'boolean',
        description: 'Allow migration to external targets',
        default: false,
      },
      allowedHosts: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Explicit host allowlist for non-local migration endpoints. HYBRID_RAG_MIGRATION_ALLOWED_HOSTS is also honored.',
      },
    },
    required: ['sourceConfig', 'targetConfig'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    try {
      const sourceConfig = args.sourceConfig;
      const targetConfig = args.targetConfig;
      const batchSize = (args.batchSize as number) ?? 100;
      const collection = args.collection as string | undefined;
      const allowExternalTarget = (args.allowExternalTarget as boolean) ?? false;
      const allowedHosts = getConfiguredAllowedHosts(args);

      const sourceResult = vectorStoreConfigSchema.safeParse(sourceConfig);
      if (!sourceResult.success) {
        const redacted = redactSensitiveConfig(sourceConfig as Record<string, unknown>);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Invalid source config',
                config: redacted,
                details: sourceResult.error.issues,
              }),
            },
          ],
          isError: true,
        };
      }

      const targetResult = vectorStoreConfigSchema.safeParse(targetConfig);
      if (!targetResult.success) {
        const redacted = redactSensitiveConfig(targetConfig as Record<string, unknown>);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Invalid target config',
                config: redacted,
                details: targetResult.error.issues,
              }),
            },
          ],
          isError: true,
        };
      }

      const sourceValidationError = validateMigrationTarget(
        'source',
        sourceResult.data,
        allowedHosts,
        allowExternalTarget,
      );
      const targetValidationError = validateMigrationTarget(
        'target',
        targetResult.data,
        allowedHosts,
        allowExternalTarget,
      );
      const migrationValidationError = sourceValidationError ?? targetValidationError;
      if (migrationValidationError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: migrationValidationError }) }],
          isError: true,
        };
      }

      const modName = '@reaatech/hybrid-rag-migration';
      const { migrateVectors } = (await import(modName)) as {
        migrateVectors: (
          sourceConfig: VectorStoreConfig,
          targetConfig: VectorStoreConfig,
          options: { batchSize: number; collection: string },
        ) => Promise<{
          sourceProvider: string;
          targetProvider: string;
          pointsMigrated: number;
          errors: unknown[];
          durationMs: number;
        }>;
      };

      const result = await migrateVectors(sourceResult.data, targetResult.data, {
        batchSize,
        collection: collection ?? 'documents',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sourceProvider: result.sourceProvider,
                targetProvider: result.targetProvider,
                pointsMigrated: result.pointsMigrated,
                errors: result.errors,
                durationMs: result.durationMs,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'Migration package not installed. Run: pnpm add @reaatech/hybrid-rag-migration',
              }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  },
};

export const migrationTools: RAGTool[] = [ragMigrate];
