import { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

// Default: embedded LanceDB (zero-config, no server required)
const _pipeline = new RAGPipeline({});

// Or switch to a different provider:
const _pipelineQdrant = new RAGPipeline({
  vectorStore: {
    provider: 'qdrant',
    url: 'http://localhost:6333',
    collectionName: 'docs',
    vectorSize: 1536,
  },
});
