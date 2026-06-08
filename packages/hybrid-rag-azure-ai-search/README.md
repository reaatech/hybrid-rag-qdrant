# @reaatech/hybrid-rag-azure-ai-search

Azure AI Search adapter for the hybrid-rag system.

## Installation

```bash
pnpm add @reaatech/hybrid-rag-azure-ai-search @azure/search-documents
```

## Config

```typescript
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const adapter = await createVectorStore({
  provider: 'azure-ai-search',
  endpoint: 'https://my-search.search.windows.net',
  apiKey: process.env.AZURE_SEARCH_API_KEY,
  indexName: 'documents',
  vectorDimension: 1536,
});
```

## Capabilities

| Capability | Supported |
|------------|-----------|
| Hybrid Search | Yes |
| Metadata Filtering | Yes |
| Batch Upsert | Yes |
| Collection Management | Yes |
| Multi-tenancy | No |
| Quantization | Yes |
| Scan (migration source) | Yes |
| Max Batch Size | 1000 |
| Max Vector Dimension | 4096 |

## Local Development

Azure AI Search requires an Azure subscription and Search service. No local emulator is available. Use the `sandbox` provider for local testing.

## Limitations

- Requires Azure subscription with AI Search resource
- API keys are sensitive — use managed identities or Key Vault where possible
- Index schema must be configured to match the expected vector and metadata fields
- Semantic ranker is optional and incurs additional cost

## Links

- [Azure AI Search Documentation](https://learn.microsoft.com/en-us/azure/search/)
- [@azure/search-documents SDK](https://learn.microsoft.com/en-us/javascript/api/overview/azure/search-documents-readme)
