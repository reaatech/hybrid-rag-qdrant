# Skill: Session Management

## Overview

Session management provides multi-turn conversation context for RAG systems. This skill enables coherent multi-query conversations, context persistence, and stateful interactions with the retrieval system.

## Capabilities

### Session Creation

Create and configure conversation sessions:

```typescript
import { SessionManager } from 'hybrid-rag-qdrant';

const sessionManager = new SessionManager({
  storage: 'redis', // or 'memory', 'postgres'
  ttl: 3600, // 1 hour default
  maxContextLength: 10, // max messages to keep
});

const session = await sessionManager.createSession({
  userId: 'user-123',
  metadata: {
    domain: 'technical_support',
    priority: 'high',
    source: 'web_chat',
  },
});

// Returns:
// {
//   sessionId: 'sess-abc-123',
//   createdAt: '2026-04-15T23:00:00Z',
//   expiresAt: '2026-04-15T24:00:00Z',
//   context: []
// }
```

### Context Retrieval

Retrieve conversation context for multi-turn RAG:

```json
{
  "name": "rag.get_context",
  "arguments": {
    "session_id": "sess-abc-123",
    "max_messages": 10,
    "include_retrieved_docs": true
  }
}
```

### Session Management MCP Tool

```json
{
  "name": "rag.session_manage",
  "arguments": {
    "action": "create",
    "user_id": "user-123",
    "metadata": {
      "domain": "technical_support",
      "priority": "high"
    }
  }
}
```

Session actions:
- `create` — Create new session
- `update` — Update session metadata
- `get` — Retrieve session state
- `delete` — End and cleanup session
- `clear_context` — Clear conversation history

### Session History MCP Tool

```json
{
  "name": "rag.session_history",
  "arguments": {
    "session_id": "sess-abc-123",
    "limit": 20,
    "include_results": true
  }
}
```

## Usage Patterns

### Multi-Turn Conversation

```typescript
// Create session
const session = await sessionManager.createSession({
  userId: 'user-456',
});

// First query
const r1 = await pipeline.query('What are the API rate limits?', {
  session_id: session.id,
  use_context: false,
});

// Follow-up query with context
const r2 = await pipeline.query('What about enterprise plans?', {
  session_id: session.id,
  use_context: true, // Uses previous query context
});

// The system understands "enterprise plans" relates to "API rate limits"
```

### Context-Aware Retrieval

```typescript
// Automatically include conversation context in retrieval
const results = await pipeline.query('Tell me more about that', {
  session_id: sessionId,
  use_context: true,
  context_weight: 0.3, // Weight for conversation context
});

// The query is augmented with conversation history:
// "Tell me more about that" + "API rate limits for enterprise plans"
```

### Session State Management

```typescript
// Update session with custom state
await sessionManager.updateSession(sessionId, {
  metadata: {
    last_intent: 'pricing_inquiry',
    confidence_score: 0.9,
    escalated: false,
  },
  tags: ['pricing', 'enterprise'],
});

// Retrieve full session state
const session = await sessionManager.getSession(sessionId);
```

## Context Augmentation Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `concatenate` | Append recent queries to current query | Simple follow-ups |
| `rewrite` | Rewrite current query using context | Pronoun resolution |
| `expand` | Expand query with relevant context terms | Broadening search |
| `filter` | Filter results based on conversation topic | Narrowing results |

## Session Storage Options

| Storage | Persistence | Scalability | Best For |
|---------|-------------|-------------|----------|
| `memory` | Process lifetime | Single instance | Development/testing |
| `redis` | Configurable TTL | High (clustered) | Production |
| `postgres` | Permanent | Medium | Audit requirements |

## Configuration

```yaml
# session-config.yaml
session:
  storage: redis
  redis_url: ${REDIS_URL}
  ttl_seconds: 3600
  max_context_messages: 10
  auto_cleanup: true
  
  context_augmentation:
    strategy: rewrite
    max_age_seconds: 1800  # Only use context from last 30 min
    
  persistence:
    save_queries: true
    save_results: true
    save_metadata: true
    pii_redaction: true
```

## Best Practices

1. **Set appropriate TTL** — Balance context retention with privacy/storage
2. **Limit context length** — Too much history can degrade retrieval quality
3. **Redact PII in session data** — Never store sensitive user information
4. **Implement session cleanup** — Automatically expire inactive sessions
5. **Track session metrics** — Monitor session duration, query count, quality

## Related Skills

- `query-analysis` — Use conversation context in query analysis
- `agent-integration` — Share session context across agents
- `cost-management` — Track costs per session
