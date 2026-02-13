# Enterprise Support Autopilot

[![CI](https://github.com/langchain-ai/new-langgraphjs-project/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/langchain-ai/new-langgraphjs-project/actions/workflows/unit-tests.yml)
[![Integration Tests](https://github.com/langchain-ai/new-langgraphjs-project/actions/workflows/integration-tests.yml/badge.svg)](https://github.com/langchain-ai/new-langgraphjs-project/actions/workflows/integration-tests.yml)

A **multi-agent AI system** for automating Tier-2 technical support tasks. Built with [LangGraph.js](https://github.com/langchain-ai/langgraphjs), this system uses a Supervisor pattern to route requests to specialized worker agents for data queries, system monitoring, documentation retrieval, and secure operations.

<p align="center">
  <img src="./static/studio.png" alt="Graph view in LangGraph studio UI" width="75%">
</p>

## Features

### Core Architecture

- **Supervisor Pattern**: Intelligent routing to specialized agents
- **Multi-Agent System**: 7 specialized worker agents
- **Human-in-the-Loop (HITL)**: Secure approval workflows for sensitive operations
- **State Persistence**: Redis or SQL Server checkpointing
- **Real-time Streaming**: Server-Sent Events (SSE) for live responses

### Specialized Agents

| Agent               | Purpose            | Capabilities                                                 |
| ------------------- | ------------------ | ------------------------------------------------------------ |
| **Databricks**      | Data Analytics     | SQL queries, Genie natural language exploration              |
| **Dynatrace**       | Observability      | System monitoring, log analysis (DQL), problem detection     |
| **Knowledge**       | Documentation      | Vector search, dynamic knowledge saving with Azure AI Search |
| **Operations**      | Sensitive Actions  | Data modifications with human approval                       |
| **Human Interface** | User Clarification | Ask questions when information is missing                    |
| **Health Check**    | System Monitoring  | Service health, integration status, endpoint checks          |
| **Filesystem**      | File Operations    | Read/write files via MCP (Model Context Protocol)            |

### Advanced Capabilities

- **Chain-of-Thought Reasoning**: `attempt_reasoning` tool for complex decision-making
- **MCP Integration**: Model Context Protocol for safe filesystem operations
- **Dynamic Knowledge Learning**: Save verified information to Azure AI Search
- **Agent Chat UI Compatible**: LangGraph Platform API specification support
- **Modular Design**: Remove any agent by deleting its folder

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Azure OpenAI account
- (Optional) Redis for persistence
- (Optional) Databricks, Dynatrace accounts for integrations

### Installation

1. **Clone and install dependencies**

```bash
git clone <repository-url>
cd enterprise-support-autopilot
npm install
```

2. **Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required: Azure OpenAI
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_API_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME=your-embedding-deployment
AZURE_OPENAI_API_VERSION=2024-06-01

# Required: Azure AI Search (for Knowledge agent)
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_KEY=your-key
AZURE_SEARCH_INDEX=your-index

# Optional: Redis (for state persistence)
REDIS_URL=redis://localhost:6379

# Optional: Databricks
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your-token
DATABRICKS_SQL_WAREHOUSE_ID=your-warehouse-id
DATABRICKS_GENIE_SPACE_ID=your-genie-space-id

# Optional: Dynatrace
DYNATRACE_URL=https://your-env.live.dynatrace.com
DYNATRACE_API_TOKEN=your-token

# Optional: SQL Server (alternative persistence)
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_DATABASE=support_autopilot
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=your-password

# Optional: LangSmith tracing
LANGSMITH_API_KEY=lsv2...
LANGSMITH_PROJECT=support-autopilot
```

3. **Start the LangGraph Server**

```bash
npx @langchain/langgraph-cli dev
```

Or start the custom API server:

```bash
npm build
node dist/src/server/index.js
```

4. **Access the application**

- LangGraph Studio: http://localhost:2024
- API Server: http://localhost:3000
- Health Check: http://localhost:3000/health

## Usage Examples

### Data Query

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me yesterday order totals",
    "thread_id": "thread-123"
  }'
```

Routed to: **Databricks Agent** → SQL execution

### System Health Check

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Is the calculator service healthy?",
    "thread_id": "thread-123"
  }'
```

Routed to: **Health Check Agent** → Service diagnostics

### File Operations (MCP)

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Write a summary to /workspace/summary.txt",
    "thread_id": "thread-123"
  }'
```

Routed to: **Supervisor** → **Filesystem Agent** → MCP server (sandboxed to `./workspace`)

### Knowledge Retrieval

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do I reset 2FA?",
    "thread_id": "thread-123"
  }'
```

Routed to: **Knowledge Agent** → Azure AI Search vector search

### Human-in-the-Loop Approval

When the Operations Agent needs to modify data:

1. Agent calls `interrupt()` with approval request
2. Client receives HITL event via SSE
3. Admin reviews and approves/rejects
4. Graph resumes execution

```typescript
// Response includes interrupt
{
  "type": "approval",
  "description": "Cancel order #12345?",
  "actions": [
    { "id": "accept", "label": "Approve", "type": "approve" },
    { "id": "reject", "label": "Reject", "type": "reject" }
  ]
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (UI)                          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/SSE
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Server (Fastify)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ /chat       │  │ /threads    │  │ /runs               │  │
│  │ (streaming) │  │ (CRUD)      │  │ (execution)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supervisor Agent                         │
│              (Routing & Orchestration)                      │
│  • attempt_reasoning (Chain-of-Thought)                     │
│  • Route to specialized workers                             │
└──────┬──────┬──────┬──────┬──────┬──────┬───────────────────┘
       │      │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼      ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Data-   │ │Dynatrace│ │Knowledge│ │Opera- │ │Human   │ │Health  │
│bricks  │ │        │ │        │ │tions  │ │Interface│ │Check   │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
       │      │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼      ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│SQL/    │ │DQL/    │ │Azure   │ │HITL    │ │Ask     │ │Service │
│Genie   │ │Problems│ │Search  │ │Approval│ │Question│ │Checks  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

### State Persistence

The system supports multiple persistence backends:

- **Redis** (Production): Low-latency checkpointing
- **SQL Server** (Enterprise): ACID-compliant persistence
- **Memory** (Development): In-memory state (ephemeral)

## API Reference

### LangGraph Platform Compatible Endpoints

```typescript
// Thread Management
POST   /api/threads                    // Create thread
GET    /api/threads/:thread_id         // Get thread
GET    /api/threads/:thread_id/history // Get messages

// Run Execution
POST   /api/threads/:thread_id/runs              // Create run
GET    /api/threads/:thread_id/runs/:run_id      // Get run
POST   /api/threads/:thread_id/runs/:run_id/cancel // Cancel run

// SSE Streaming
GET    /api/threads/:thread_id/runs/:run_id/stream // Stream events

// HITL Interrupts
POST   /api/threads/:thread_id/runs/:run_id/interrupt // Resume from interrupt
```

### Legacy Endpoints

```typescript
POST / chat; // Original chat endpoint
POST / chat / resume; // Legacy HITL resume
POST / chat / answer; // Human interface answers
GET / health; // Health check
```

## Development

### Project Structure

```
src/
├── agents/               # Worker agents
│   ├── supervisor/       # Routing brain
│   ├── databricks/       # Data analytics
│   ├── dynatrace/        # Observability
│   ├── knowledge/        # Azure RAG
│   ├── operations/       # HITL operations
│   ├── human_interface/  # User questions
│   ├── health_check/     # System monitoring
│   └── filesystem/       # MCP file ops
├── services/             # Shared services
│   ├── mcpClient.ts      # MCP singleton
│   ├── embedding.ts      # Azure OpenAI embeddings
│   └── azureSearch.ts    # Azure AI Search
├── graph/                # LangGraph assembly
│   ├── index.ts          # Main graph
│   └── state.ts          # State annotations
├── server/               # API layer
│   ├── app.ts            # Fastify app
│   ├── routes/           # HTTP routes
│   └── stream.ts         # SSE logic
├── config/               # Configuration
│   ├── index.ts          # Config getters
│   └── env.ts            # Environment validation
└── checkpointer/         # Persistence
    ├── redis.ts
    └── sqlserver.ts

tests/
├── unit/                 # Unit tests
├── agents/              # Agent tests
├── services/            # Service tests
├── server/              # API tests
└── integration/         # Integration tests
```

### Available Scripts

```bash
# Development
npm dev                    # Start LangGraph CLI dev server
npm build                  # Compile TypeScript
npm clean                  # Remove dist/

# Testing
npm test                   # Run unit tests
npm test:int               # Run integration tests
npm test:all               # Run all tests + lint

# Code Quality
npm lint                   # ESLint check
npm lint:all               # ESLint + Prettier + LangGraph JSON
npm format                 # Auto-format code
npm format:check           # Check formatting
```

### Running Tests

```bash
# Unit tests only
npm test

# Specific test file
npm test tests/agents/databricks.test.ts

# Integration tests (requires services)
npm test:int

# All tests with coverage
npm test:all
```

### Adding a New Agent

1. Create agent directory:

```bash
mkdir src/agents/my_agent
touch src/agents/my_agent/index.ts
touch src/agents/my_agent/tools/myTool.ts
```

2. Implement agent factory:

```typescript
// src/agents/my_agent/index.ts
export const createMyAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [myTool],
    name: "my_agent",
    systemPrompt: "You are a specialized agent...",
  });
};
```

3. Register in Supervisor:

```typescript
// src/agents/supervisor/index.ts
import { createMyAgent } from "../my_agent/index.js";
// Add to tools list
```

4. Update Supervisor prompts:

```typescript
// src/agents/supervisor/prompts.ts
// Add routing instruction
```

## Configuration

### Environment Variables

| Variable                                 | Required | Description                |
| ---------------------------------------- | -------- | -------------------------- |
| `AZURE_OPENAI_API_KEY`                   | ✅       | Azure OpenAI API key       |
| `AZURE_OPENAI_API_ENDPOINT`              | ✅       | Azure OpenAI endpoint URL  |
| `AZURE_OPENAI_DEPLOYMENT_NAME`           | ✅       | Chat model deployment name |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME` | ✅       | Embedding model deployment |
| `AZURE_SEARCH_ENDPOINT`                  | ✅       | Azure AI Search endpoint   |
| `AZURE_SEARCH_KEY`                       | ✅       | Azure AI Search admin key  |
| `AZURE_SEARCH_INDEX`                     | ✅       | Search index name          |
| `REDIS_URL`                              | ❌       | Redis connection string    |
| `DATABRICKS_HOST`                        | ❌       | Databricks workspace URL   |
| `DATABRICKS_TOKEN`                       | ❌       | Databricks access token    |
| `DYNATRACE_URL`                          | ❌       | Dynatrace environment URL  |
| `DYNATRACE_API_TOKEN`                    | ❌       | Dynatrace API token        |

See `.env.example` for complete list.

## Security

### Sandboxed File Operations

The Filesystem Agent uses MCP (Model Context Protocol) with strict sandboxing:

- **Allowed Directory**: Only `./workspace` directory
- **Path Validation**: Absolute paths required, relative paths blocked
- **No Escaping**: Cannot access parent directories (`../`)
- **Process Isolation**: MCP server runs as separate subprocess

### HITL Workflows

Sensitive operations require explicit human approval:

- **Operations Agent**: All data modifications
- **Knowledge Agent**: Saving new information (configurable)
- **Interrupt Pattern**: Graph pauses, client polls/waits for approval

### API Security

- CORS configured for development
- (Production) Implement JWT authentication
- (Production) Use HTTPS/TLS termination
- (Production) Rate limiting recommended

## Troubleshooting

### Common Issues

**MCP Server not found**

```bash
# Ensure MCP dependencies are installed
npm list @modelcontextprotocol/server-filesystem

# Check binary exists
ls node_modules/.bin/mcp-server-filesystem
```

**Redis connection failed**

```bash
# Check Redis is running
redis-cli ping

# Or use MemorySaver for development
# (Remove REDIS_URL from .env)
```

**Azure OpenAI errors**

```bash
# Verify credentials
curl -H "api-key: $AZURE_OPENAI_API_KEY" \
  "$AZURE_OPENAI_API_ENDPOINT/openai/deployments/$AZURE_OPENAI_DEPLOYMENT_NAME/chat/completions?api-version=2024-06-01"
```

**TypeScript compilation errors**

```bash
# Clean and rebuild
npm clean
npm build
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- **ESM Modules**: Use `.js` extensions in imports
- **Named Exports**: No default exports
- **TypeScript Strict**: All code must pass strict mode
- **Prettier**: Auto-format on save
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, etc.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [LangChain](https://langchain.com/) - LLM orchestration framework
- [LangGraph](https://langchain-ai.github.io/langgraphjs/) - Agent workflow engine
- [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service/) - LLM provider
- [Model Context Protocol](https://modelcontextprotocol.io/) - Tool standard

---

**Built with LangGraph.js** | **Enterprise Support Automation**
