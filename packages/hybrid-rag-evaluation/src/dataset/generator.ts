/**
 * Synthetic evaluation dataset generator
 */

import { writeFile } from 'node:fs/promises';
import { getLogger } from '@reaatech/hybrid-rag-observability';

const logger = getLogger();

/**
 * Configuration for dataset generation
 */
export interface DatasetGeneratorConfig {
  /** Number of queries to generate */
  numQueries: number;
  /** Number of documents in the corpus */
  numDocuments: number;
  /** Number of relevant documents per query */
  relevantDocsPerQuery: number;
  /** Output file path */
  outputPath: string;
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Generated query with relevance judgments
 */
export interface GeneratedQuery {
  query: string;
  query_id: string;
  relevant_docs: string[];
  category?: string;
}

/**
 * Simple seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = Math.random() * 10000) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)]!;
  }
}

/**
 * Sample document templates for generation
 */
const DOCUMENT_TEMPLATES = [
  'The {topic} is an important aspect of {field}. Research has shown that {concept} plays a crucial role in understanding {topic}.',
  'In recent years, {topic} has gained significant attention in the field of {field}. Studies indicate that {concept} is a key factor.',
  'Understanding {topic} requires knowledge of {concept}. Experts in {field} have developed various approaches to address this.',
  'The relationship between {topic} and {concept} has been extensively studied in {field}. Key findings suggest important implications.',
  '{topic} represents a fundamental concept in {field}. The role of {concept} cannot be overstated in this context.',
];

const TOPICS = [
  'machine learning',
  'natural language processing',
  'vector databases',
  'information retrieval',
  'semantic search',
  'neural networks',
  'deep learning',
  'knowledge graphs',
  'data mining',
  'text analytics',
  'question answering',
  'document understanding',
  'embedding models',
  'similarity search',
  'hybrid search',
  'ranking algorithms',
];

const FIELDS = [
  'computer science',
  'artificial intelligence',
  'data science',
  'software engineering',
  'computational linguistics',
  'information science',
];

const CONCEPTS = [
  'transformer architecture',
  'attention mechanism',
  'gradient descent',
  'backpropagation',
  'feature extraction',
  'dimensionality reduction',
  'clustering',
  'classification',
  'regression',
  'optimization',
  'tokenization',
  'semantic similarity',
  'contextual embedding',
];

const QUERY_TEMPLATES = [
  'What is {topic} and how does it relate to {concept}?',
  'Explain the role of {concept} in {topic}.',
  'How is {topic} used in {field}?',
  'What are the key differences between {topic} and {concept}?',
  'Describe the importance of {concept} for {topic}.',
  'What are the main challenges in {topic}?',
  'How does {concept} improve {topic}?',
  'What is the relationship between {topic} and {field}?',
];

/**
 * Generate a synthetic document
 */
function generateDocument(docId: string, rng: SeededRandom): { id: string; content: string } {
  const template = rng.pick(DOCUMENT_TEMPLATES);
  const topic = rng.pick(TOPICS);
  const field = rng.pick(FIELDS);
  const concept = rng.pick(CONCEPTS);

  const content = template
    .replace(/{topic}/g, topic)
    .replace(/{field}/g, field)
    .replace(/{concept}/g, concept);

  return {
    id: docId,
    content,
  };
}

/**
 * Generate a synthetic query with relevance judgments
 */
function generateQuery(
  queryId: string,
  documents: Array<{ id: string; content: string }>,
  rng: SeededRandom,
  relevantCount: number,
): GeneratedQuery {
  const template = rng.pick(QUERY_TEMPLATES);
  const topic = rng.pick(TOPICS);
  const field = rng.pick(FIELDS);
  const concept = rng.pick(CONCEPTS);

  const query = template
    .replace(/{topic}/g, topic)
    .replace(/{field}/g, field)
    .replace(/{concept}/g, concept);

  // Select relevant documents (those that share keywords with the query)
  const queryKeywords = [topic.toLowerCase(), concept.toLowerCase(), field.toLowerCase()];
  const scoredDocs = documents.map((doc) => {
    const contentLower = doc.content.toLowerCase();
    const score = queryKeywords.filter((kw) => contentLower.includes(kw)).length;
    return { id: doc.id, score };
  });

  // Sort by score and pick top relevant docs
  const sortedDocs = scoredDocs.sort((a, b) => b.score - a.score);
  const relevantDocs = sortedDocs.slice(0, relevantCount).map((d) => d.id);

  // If not enough relevant docs, add some random ones
  const targetCount = Math.min(relevantCount, documents.length);
  while (relevantDocs.length < targetCount) {
    const randomDoc = rng.pick(documents);
    if (!relevantDocs.includes(randomDoc.id)) {
      relevantDocs.push(randomDoc.id);
    }
  }

  return {
    query,
    query_id: queryId,
    relevant_docs: relevantDocs,
    category: topic,
  };
}

/**
 * Generate a synthetic evaluation dataset
 */
export async function generateDataset(config: DatasetGeneratorConfig): Promise<{
  queries: GeneratedQuery[];
  documents: Array<{ id: string; content: string }>;
}> {
  const rng = new SeededRandom(config.seed);

  // Generate documents
  const documents = Array.from({ length: config.numDocuments }, (_, i) =>
    generateDocument(`doc-${i + 1}`, rng),
  );

  // Generate queries
  const queries = Array.from({ length: config.numQueries }, (_, i) =>
    generateQuery(`query-${i + 1}`, documents, rng, config.relevantDocsPerQuery),
  );

  // Write to file
  const content = queries.map((q) => JSON.stringify(q)).join('\n');
  await writeFile(config.outputPath, content);

  return { queries, documents };
}

/**
 * Generate and save a dataset
 */
export async function generateAndSaveDataset(
  outputPath: string,
  options: Partial<Omit<DatasetGeneratorConfig, 'outputPath'>> = {},
): Promise<void> {
  const config: DatasetGeneratorConfig = {
    numQueries: options.numQueries || 50,
    numDocuments: options.numDocuments || 100,
    relevantDocsPerQuery: options.relevantDocsPerQuery || 5,
    outputPath,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
  };

  const result = await generateDataset(config);

  logger.info('Generated dataset:');
  logger.info(`  Queries: ${result.queries.length}`);
  logger.info(`  Documents: ${result.documents.length}`);
  logger.info(`  Output: ${outputPath}`);
}
