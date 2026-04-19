import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'coverage',
      // tiktoken WASM causes OOM in vitest workers; run separately with:
      //   NODE_OPTIONS='--max-old-space-size=4096' npx vitest run tests/unit/chunking.test.ts
      'tests/unit/chunking.test.ts',
      'tests/integration/qdrant.test.ts',
      'tests/integration/rag-pipeline.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'tests/**',
        '*.config.*',
        'src/index.ts',
        'src/cli.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
