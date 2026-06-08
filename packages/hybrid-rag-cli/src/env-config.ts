/**
 * Environment-variable configuration helpers for the CLI.
 *
 * Configuration precedence (highest wins):
 *   1. explicit CLI argument
 *   2. config file
 *   3. environment variable (HYBRID_RAG_* prefixed, then legacy unprefixed)
 *   4. built-in default
 *
 * The HYBRID_RAG_* prefix is the canonical convention. Legacy unprefixed names
 * (e.g. QDRANT_URL) are honored for backward compatibility, but the prefixed
 * name always takes precedence when both are set.
 */

/**
 * Read an environment variable, preferring the HYBRID_RAG_* prefixed name and
 * falling back to a legacy unprefixed name. Empty strings are treated as unset.
 */
export function readEnv(prefixedName: string, legacyName?: string): string | undefined {
  const prefixed = process.env[prefixedName];
  if (prefixed !== undefined && prefixed !== '') {
    return prefixed;
  }
  if (legacyName) {
    const legacy = process.env[legacyName];
    if (legacy !== undefined && legacy !== '') {
      return legacy;
    }
  }
  return undefined;
}

/**
 * Resolve a value using the documented precedence order. The first defined,
 * non-empty source wins: explicit CLI arg, then config-file value, then
 * environment variable, then the built-in default.
 */
export function resolveWithPrecedence(args: {
  cliValue?: string;
  configValue?: string;
  prefixedEnv: string;
  legacyEnv?: string;
  defaultValue?: string;
}): string | undefined {
  if (args.cliValue !== undefined && args.cliValue !== '') {
    return args.cliValue;
  }
  if (args.configValue !== undefined && args.configValue !== '') {
    return args.configValue;
  }
  const fromEnv = readEnv(args.prefixedEnv, args.legacyEnv);
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return args.defaultValue;
}
