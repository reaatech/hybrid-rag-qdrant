# @reaatech/hybrid-rag-observability

## 0.1.1

### Patch Changes

- [`55e0f72`](https://github.com/reaatech/hybrid-rag-qdrant/commit/55e0f7262f7641d700c04457fe6752c1ba9b4070) Thanks [@reaatech](https://github.com/reaatech)! - - **@reaatech/hybrid-rag-mcp-server** (patch): Migrated to zod 4.4.3, which required updating schema definitions in src/tools/ingestion.ts (e.g. metadata record signature). Compatibility fix affecting the public MCP tool input shapes.
  - **@reaatech/hybrid-rag-observability** (patch): Upgraded OpenTelemetry SDKs from 1.30.x to 2.7.1, which required source changes in src/tracing.ts to align with the new SDK initialization API and updated exporter packages.
