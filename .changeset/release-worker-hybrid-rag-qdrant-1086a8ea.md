---
"@reaatech/hybrid-rag-mcp-server": patch
"@reaatech/hybrid-rag-observability": patch
---

- **@reaatech/hybrid-rag-mcp-server** (patch): Migrated to zod 4.4.3, which required updating schema definitions in src/tools/ingestion.ts (e.g. metadata record signature). Compatibility fix affecting the public MCP tool input shapes.
- **@reaatech/hybrid-rag-observability** (patch): Upgraded OpenTelemetry SDKs from 1.30.x to 2.7.1, which required source changes in src/tracing.ts to align with the new SDK initialization API and updated exporter packages.
