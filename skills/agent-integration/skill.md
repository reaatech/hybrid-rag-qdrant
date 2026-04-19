# Skill: Agent Integration

## Overview

Agent integration enables seamless interoperability between hybrid-rag-qdrant and multi-agent systems like agent-mesh. This skill provides tools for agent discovery, cross-agent communication, intent-based routing, and collaborative workflows.

## Capabilities

### Agent Discovery

Discover and query available agents in the agent-mesh network:

```json
{
  "name": "rag.discover_agents",
  "arguments": {
    "filter": {
      "capabilities": ["calculation", "data_analysis", "code_generation"]
    },
    "status": "active"
  }
}
```

### Agent-to-Agent Routing

Route queries to specialized agents based on detected intent:

```json
{
  "name": "rag.route_to_agent",
  "arguments": {
    "query": "Calculate the total cost for 1000 API calls",
    "target_agent": "calculator",
    "context": {
      "cost_per_call": 0.002,
      "source": "rag_cost_analysis"
    },
    "return_to_rag": true
  }
}
```

### Agent Capabilities Query

Query the capabilities of registered agents:

```json
{
  "name": "rag.get_agent_capabilities",
  "arguments": {
    "agent_id": "calculator",
    "include_examples": true
  }
}
```

### Agent Registration

Register callbacks for async agent responses:

```json
{
  "name": "rag.register_callback",
  "arguments": {
    "callback_url": "https://my-app.com/rag/callback",
    "events": ["agent_response", "agent_error", "timeout"],
    "auth_token": "Bearer ${AUTH_TOKEN}"
  }
}
```

## Usage Patterns

### Integration with agent-mesh

Register hybrid-rag-qdrant as an agent in agent-mesh:

```yaml
# agents/hybrid-rag.yaml
agent_id: hybrid-rag-qdrant
display_name: Hybrid RAG System
description: >-
  Enterprise-grade RAG system with hybrid retrieval (vector + BM25),
  reranking, evaluation frameworks, and cost management.
endpoint: "${HYBRID_RAG_ENDPOINT:-http://localhost:8080}"
type: mcp
is_default: true
confidence_threshold: 0.85
capabilities:
  - document_search
  - knowledge_retrieval
  - semantic_search
  - multi_turn_qa
routing_rules:
  - intent: technical_question
    weight: 1.0
  - intent: general_chat
    weight: 0.3
```

### Collaborative Workflow: RAG + Calculator

```typescript
// Step 1: RAG retrieves pricing information
const pricingDocs = await rag.retrieve('API pricing details', { topK: 5 });

// Step 2: Extract pricing data
const pricingData = extractPricingData(pricingDocs);

// Step 3: Route to calculator agent
const calculation = await agent.routeToAgent({
  target_agent: 'calculator',
  query: `Calculate monthly cost for ${usage} API calls`,
  context: pricingData,
  return_to_rag: true,
});

// Step 4: RAG formats final response with calculation results
const response = await rag.formatResponse({
  sources: pricingDocs,
  calculation: calculation.result,
});
```

### Intent-Based Multi-Agent Orchestration

```typescript
// Analyze query to determine which agents should be involved
const analysis = await rag.analyzeQuery(complexQuery);

if (analysis.requiresCalculation) {
  // Involve calculator agent
  const calcResult = await agent.routeToAgent({
    target_agent: 'calculator',
    query: analysis.mathExpression,
  });
}

if (analysis.requiresCodeGeneration) {
  // Involve code agent
  const codeResult = await agent.routeToAgent({
    target_agent: 'code-generator',
    query: analysis.codeRequest,
  });
}

// Aggregate results from all agents
const finalResponse = await rag.aggregateAgentResults([
  { agent: 'rag', result: ragResults },
  { agent: 'calculator', result: calcResult },
  { agent: 'code-generator', result: codeResult },
]);
```

## Agent Communication Protocol

### Synchronous Communication

```typescript
// Direct request-response
const response = await agent.call({
  target_agent: 'specialist',
  action: 'process',
  payload: { query: '...', context: {} },
  timeout_ms: 30000,
});
```

### Asynchronous Communication

```typescript
// Register callback and continue
await agent.registerCallback({
  request_id: 'req-123',
  callback_url: 'https://my-app.com/callback',
  events: ['complete', 'error'],
});

// Agent will POST results to callback URL when ready
```

## Cross-Agent Context Sharing

Share context between agents for coherent multi-agent workflows:

```typescript
const sharedContext = {
  session_id: 'session-abc',
  user_id: 'user-456',
  conversation_history: [...],
  retrieved_documents: [...],
  intermediate_results: {...},
};

// Pass context to next agent
await agent.routeToAgent({
  target_agent: 'analyzer',
  query: 'Analyze these results',
  context: sharedContext,
});
```

## Best Practices

1. **Define clear agent boundaries** — Each agent should have well-defined responsibilities
2. **Use structured context passing** — Ensure context is properly serialized and validated
3. **Implement timeout handling** — Handle agent failures gracefully
4. **Log cross-agent interactions** — Track agent-to-agent communication for debugging
5. **Use confidence thresholds** — Only route when confidence in agent selection is high

## Related Skills

- `query-analysis` — Determine which agents to involve based on query analysis
- `session-management` — Maintain context across multi-agent interactions
- `cost-management` — Track costs across agent interactions
