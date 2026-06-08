import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The optional first-party packages below are not installed in this workspace.
// The source loads them through guarded dynamic imports; aliasing the module
// ids to local test stubs lets vitest resolve them so tests can mock the
// engine/guardrail code paths deterministically without any network or install.
const stub = (name: string) => fileURLToPath(new URL(`./test/stubs/${name}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@reaatech/agent-budget-pricing': stub('agent-budget-pricing'),
      '@reaatech/guardrail-chain': stub('guardrail-chain'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: ['test/**', '**/*.test.ts', '*.config.ts', 'dist/**'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
