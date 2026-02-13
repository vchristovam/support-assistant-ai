# Agent Chat UI Setup Guide

**Version:** 1.0  
**Last Updated:** 2026-02-12  
**Purpose:** Complete setup guide for integrating the Enterprise Support Autopilot with the LangChain Agent Chat UI

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [The 6 Worker Agents](#the-6-worker-agents)
6. [Human-in-the-Loop (HITL)](#human-in-the-loop-hitl)
7. [Production Deployment](#production-deployment)
8. [Environment Variables](#environment-variables)
9. [Troubleshooting](#troubleshooting)
10. [Screenshots & Evidence](#screenshots--evidence)

---

## Overview

The Enterprise Support Autopilot now supports integration with the [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) - a modern, responsive chat interface built by LangChain. This integration provides:

- **Real-time streaming** via Server-Sent Events (SSE)
- **Thread management** with persistent conversation history
- **Human-in-the-Loop** approval workflows
- **Multi-agent routing** through a visual interface
- **Production-ready** deployment patterns

### Architecture

```
┌─────────────────┐     HTTP/SSE      ┌──────────────────┐
│  Agent Chat UI  │ ◄───────────────► │  Support Server  │
│  (Next.js App)  │                   │  (Fastify/Node)  │
└─────────────────┘                   └────────┬─────────┘
                                               │
                          ┌────────────────────┼────────────────────┐
                          │                    │                    │
                    ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
                    │  Supervisor│      │   Redis     │     │  Workers    │
                    │   Agent    │      │ Checkpointer│     │  (6 types)  │
                    └─────┬─────┘      └─────────────┘     └─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
   │Databricks│      │Dynatrace│      │Knowledge│
   └─────────┘      └─────────┘      └─────────┘
```

---

## Prerequisites

### System Requirements

- **Node.js:** 20+ (LTS recommended)
- **Yarn:** 1.22+ or npm 10+
- **Redis:** 6.0+ (optional, for production persistence)
- **Git:** 2.30+

### Required Accounts & API Keys

| Service         | Purpose        | Required For          |
| --------------- | -------------- | --------------------- |
| Azure OpenAI    | LLM inference  | All operations        |
| Databricks      | Data analytics | Worker 1 (Databricks) |
| Dynatrace       | Observability  | Worker 2 (Dynatrace)  |
| Azure AI Search | Knowledge RAG  | Worker 3 (Knowledge)  |

### Agent Chat UI Installation

```bash
# Clone the Agent Chat UI repository
git clone https://github.com/langchain-ai/agent-chat-ui.git
cd agent-chat-ui

# Install dependencies
yarn install

# Create environment file
cp .env.example .env.local
```

---

## Local Development Setup

### Step 1: Start the Support Server

```bash
# In your Support Autopilot directory
cd /path/to/SupportAssistant

# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env

# Edit .env with your API keys
# (see Environment Variables section below)

# Start the development server
yarn dev
```

The server will start on `http://localhost:3000` by default.

**Expected output:**

```
[LOG] Using MemorySaver for state persistence (no Redis URL configured)
[LOG] Server listening on port 3000
[LOG] Health check: http://localhost:3000/health
```

### Step 2: Verify Server Health

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
{"status":"ok"}
```

### Step 3: Configure Agent Chat UI

Edit `.env.local` in the Agent Chat UI directory:

```bash
# Point to your local Support Server
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ASSISTANT_ID=agent

# Optional: LangSmith for tracing
LANGSMITH_API_KEY=lsv2_...  # Optional
```

### Step 4: Start Agent Chat UI

```bash
# In the agent-chat-ui directory
yarn dev
```

The UI will start on `http://localhost:3000` (or next available port).

### Step 5: Connect and Test

1. Open `http://localhost:3000` in your browser
2. The Agent Chat UI will display a connection form
3. Enter the configuration:
   - **API URL:** `http://localhost:3000`
   - **Assistant ID:** `agent`
4. Click "Connect"

**Screenshot Reference:** See `01-initial-page.png` and `02-config-form-filled.png` in `.sisyphus/evidence/`

### Step 6: Test the Connection

Send a test message:

```
User: Hello, can you help me with a support issue?
```

Expected response:

```
Agent: Hello! I'm your Enterprise Support Autopilot. I can help you with:
- Database queries and analytics (Databricks)
- System monitoring and observability (Dynatrace)
- Documentation and knowledge base lookups
- Health checks and diagnostics
- Operations requiring approval

What would you like assistance with today?
```

**Screenshot Reference:** See `scenario-01-hello.png` in `.sisyphus/evidence/`

---

## API Endpoints Reference

### LangGraph Platform Compatible Endpoints

The Support Server implements the LangGraph Platform API specification for Agent Chat UI compatibility:

#### Thread Management

| Method | Endpoint                           | Description                      |
| ------ | ---------------------------------- | -------------------------------- |
| `POST` | `/api/threads`                     | Create a new conversation thread |
| `GET`  | `/api/threads/{thread_id}`         | Get thread details and state     |
| `GET`  | `/api/threads/{thread_id}/history` | Get message history              |

**Create Thread Example:**

```bash
curl -X POST http://localhost:3000/api/threads \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "user_id": "user-123",
      "source": "agent-chat-ui"
    }
  }'
```

**Response:**

```json
{
  "thread_id": "thread-550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-02-12T19:30:00Z",
  "updated_at": "2026-02-12T19:30:00Z",
  "metadata": {
    "user_id": "user-123",
    "source": "agent-chat-ui"
  },
  "status": "idle",
  "values": {},
  "interrupts": {}
}
```

#### Run Execution

| Method | Endpoint                                        | Description                |
| ------ | ----------------------------------------------- | -------------------------- |
| `POST` | `/api/threads/{thread_id}/runs`                 | Create a new run           |
| `GET`  | `/api/threads/{thread_id}/runs/{run_id}`        | Get run status             |
| `POST` | `/api/threads/{thread_id}/runs/{run_id}/cancel` | Cancel a running execution |

**Create Run Example:**

```bash
curl -X POST http://localhost:3000/api/threads/thread-xxx/runs \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "agent",
    "input": {
      "messages": [
        {
          "type": "human",
          "content": "Check the health of our Databricks connection"
        }
      ]
    }
  }'
```

#### SSE Streaming

| Method | Endpoint                                        | Description                 |
| ------ | ----------------------------------------------- | --------------------------- |
| `GET`  | `/api/threads/{thread_id}/runs/{run_id}/stream` | Stream run execution events |

**Stream Events Example:**

```bash
curl -N http://localhost:3000/api/threads/thread-xxx/runs/run-yyy/stream
```

**SSE Event Format:**

```
event: metadata
data: {"run_id":"run-yyy","thread_id":"thread-xxx"}

event: values
data: {"messages":[{"type":"human","content":"Check Databricks health"}]}

event: messages
data: [{"type":"ai","content":"I'll check"}]

event: messages
data: [{"type":"ai","content":" the Databricks"}]

event: messages
data: [{"type":"ai","content":" connection now..."}]

event: end
data: {}
```

#### Interrupt/HITL

| Method | Endpoint                                           | Description           |
| ------ | -------------------------------------------------- | --------------------- |
| `POST` | `/api/threads/{thread_id}/runs/{run_id}/interrupt` | Resume from interrupt |

**Resume from Interrupt Example:**

```bash
curl -X POST http://localhost:3000/api/threads/thread-xxx/runs/run-yyy/interrupt \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "value": null
  }'
```

### Backward Compatible Endpoints

For existing integrations, these endpoints remain available:

| Method | Endpoint       | Description                     |
| ------ | -------------- | ------------------------------- |
| `POST` | `/chat`        | Original chat endpoint (SSE)    |
| `POST` | `/chat/resume` | Resume HITL (legacy)            |
| `POST` | `/chat/answer` | Answer human interface question |
| `GET`  | `/health`      | Health check                    |

---

## The 6 Worker Agents

The Support Autopilot routes requests to specialized workers based on intent:

### 1. Databricks Agent

**Purpose:** Data analytics and SQL execution

**Capabilities:**

- Execute SQL queries against Databricks Lakehouse
- Natural language data exploration via Genie API
- Schema introspection and table discovery
- Query result formatting and visualization suggestions

**Example Queries:**

```
"Show me yesterday's order volume"
"Run this SQL: SELECT * FROM sales WHERE date > '2026-01-01'"
"What tables are available in the analytics schema?"
```

**Tools:**

- `sqlTool.ts` - Direct SQL execution
- `genieTool.ts` - Natural language to SQL via Genie

**Screenshot Reference:** See `worker-databricks.png` in `.sisyphus/evidence/`

### 2. Dynatrace Agent

**Purpose:** System observability and monitoring

**Capabilities:**

- Query logs using Dynatrace Query Language (DQL)
- Fetch active problems and alerts
- Analyze error patterns and root causes
- Monitor service performance metrics

**Example Queries:**

```
"Show me active alerts"
"Search logs for error 'connection timeout' in the last hour"
"What's the CPU usage trend for service X?"
```

**Tools:**

- `dqlTool.ts` - Log and metric queries
- `problemsTool.ts` - Alert management

**Screenshot Reference:** See `worker-dynatrace.png` in `.sisyphus/evidence/`

### 3. Knowledge Agent

**Purpose:** Documentation and policy lookups

**Capabilities:**

- Semantic search across documentation
- Azure AI Search integration
- Policy question answering
- Context-aware information retrieval

**Example Queries:**

```
"What's our data retention policy?"
"How do I request database access?"
"Search docs for 'API rate limiting'"
```

**Tools:**

- `vectorSearch.ts` - Azure AI Search vector queries

**Screenshot Reference:** See `worker-knowledge.png` in `.sisyphus/evidence/`

### 4. Operations Agent

**Purpose:** Sensitive actions requiring approval

**Capabilities:**

- Schema modifications
- Data deletion requests
- Configuration changes
- User permission updates

**HITL Workflow:**

1. User requests action (e.g., "Delete user account X")
2. Operations agent formulates the change
3. Graph interrupts, waiting for approval
4. Agent Chat UI displays interrupt card
5. Admin approves/rejects/edits the action
6. Graph resumes and executes or cancels

**Example Requests:**

```
"Cancel order #12345"
"Delete test data from last month"
"Grant admin access to user@company.com"
```

**Tools:**

- `apiWriteTool.ts` - API write operations

**Screenshot Reference:** See `worker-operations-hitl-initial.png` in `.sisyphus/evidence/`

### 5. Human Interface Agent

**Purpose:** User clarification and question asking

**Capabilities:**

- Ask follow-up questions
- Request missing information
- Confirm ambiguous requests
- Guide users through multi-step processes

**Example Interactions:**

```
User: "Check the logs"
Agent: "Which service logs would you like me to check? (Options: API, Database, Cache)"

User: "Run a query"
Agent: "What specific data are you looking for? Please provide the SQL or describe what you need."
```

**Tools:**

- `askHumanTool.ts` - Interrupt with question

### 6. Health Check Agent

**Purpose:** System health monitoring and diagnostics

**Capabilities:**

- Check integration health (Databricks, Dynatrace, Azure, Redis)
- Monitor internal service status
- Get system metrics and performance data
- Diagnose connectivity issues

**Example Queries:**

```
"Is the calculator service running?"
"Check system status"
"Why is the API slow?"
"Are all integrations healthy?"
```

**Tools:**

- `checkIntegrationHealth.ts` - External service health
- `checkInternalService.ts` - Internal service status
- `getSystemMetrics.ts` - Performance metrics
- `checkEndpoint.ts` - HTTP endpoint checks

---

## Human-in-the-Loop (HITL)

The HITL system enables human oversight for sensitive operations:

### Interrupt Types

#### 1. Approval Request

Used by the Operations Agent for write operations:

```json
{
  "type": "approval",
  "description": "Approve database schema modification",
  "value": {
    "action": "modify_table",
    "table": "users",
    "changes": ["add column: email_verified"]
  },
  "actions": [
    { "id": "accept", "label": "Approve", "type": "approve" },
    { "id": "reject", "label": "Reject", "type": "reject" },
    { "id": "edit", "label": "Edit", "type": "edit" }
  ]
}
```

#### 2. Input Request

Used by the Human Interface Agent for clarification:

```json
{
  "type": "input",
  "description": "Please provide your API key for authentication",
  "schema": {
    "type": "object",
    "properties": {
      "api_key": {
        "type": "string",
        "description": "Your API key"
      }
    },
    "required": ["api_key"]
  }
}
```

### Resuming from Interrupt

**Via Agent Chat UI:**
The UI automatically detects interrupted threads and displays the interrupt value with action buttons.

**Via API:**

```bash
curl -X POST http://localhost:3000/api/threads/thread-xxx/runs/run-yyy/interrupt \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept"
  }'
```

**Response Actions:**

- `accept` - Approve the action as proposed
- `reject` - Cancel the operation
- `edit` - Modify the action parameters (provide new `value`)

### Thread Status

When interrupted, the thread status changes:

```json
{
  "thread_id": "thread-xxx",
  "status": "interrupted",
  "interrupts": {
    "agent": [
      {
        "value": {
          "type": "approval",
          "description": "Approve action?",
          "value": {...}
        }
      }
    ]
  }
}
```

---

## Production Deployment

### Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   CDN       │      │  Agent Chat │      │   Support   │
│  (Vercel)   │──────►│     UI      │──────►│   Server    │
└─────────────┘      │  (Next.js)  │      │  (Fastify)  │
                     └─────────────┘      └──────┬──────┘
                                                  │
                     ┌─────────────┐      ┌──────▼──────┐
                     │   Redis     │◄─────│  Supervisor │
                     │   Cluster   │      │    Graph    │
                     └─────────────┘      └─────────────┘
```

### Deployment Steps

#### 1. Deploy Support Server

**Option A: Docker Deployment**

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY dist/ ./dist/
COPY .env.example ./.env

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

```bash
# Build and push
docker build -t support-autopilot:latest .
docker tag support-autopilot:latest registry.com/support-autopilot:latest
docker push registry.com/support-autopilot:latest
```

**Option B: Kubernetes Deployment**

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: support-autopilot
spec:
  replicas: 3
  selector:
    matchLabels:
      app: support-autopilot
  template:
    metadata:
      labels:
        app: support-autopilot
    spec:
      containers:
        - name: support-autopilot
          image: registry.com/support-autopilot:latest
          ports:
            - containerPort: 3000
          env:
            - name: REDIS_URL
              value: "redis://redis-cluster:6379"
            - name: AZURE_OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: azure-secrets
                  key: openai-api-key
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: support-autopilot-service
spec:
  selector:
    app: support-autopilot
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

#### 2. Configure Redis for Production

```bash
# Using Redis Cloud or self-hosted
REDIS_URL=redis://username:password@redis-cluster.company.com:6379

# Enable persistence
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

#### 3. Deploy Agent Chat UI

**Vercel Deployment:**

```bash
# In agent-chat-ui directory
vercel --prod
```

**Environment Variables (Vercel):**

```bash
NEXT_PUBLIC_API_URL=https://support-api.company.com
NEXT_PUBLIC_ASSISTANT_ID=agent
LANGSMITH_API_KEY=lsv2_pt_...
```

#### 4. Configure Load Balancer

```nginx
# nginx.conf
upstream support_backend {
    least_conn;
    server support-autopilot-1:3000;
    server support-autopilot-2:3000;
    server support-autopilot-3:3000;
}

server {
    listen 80;
    server_name support-api.company.com;

    location / {
        proxy_pass http://support_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE-specific settings
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

#### 5. SSL/TLS Configuration

```bash
# Using Let's Encrypt
certbot --nginx -d support-api.company.com

# Or with cert-manager in Kubernetes
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: support-autopilot-tls
spec:
  secretName: support-autopilot-tls-secret
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - support-api.company.com
EOF
```

### Monitoring & Observability

**Health Check Endpoint:**

```bash
curl https://support-api.company.com/health
```

**Recommended Monitoring:**

- Application: LangSmith for trace visualization
- Infrastructure: Dynatrace, DataDog, or Prometheus
- Logs: ELK Stack or Splunk
- Uptime: Pingdom or UptimeRobot

---

## Environment Variables

### Required Variables

| Variable                       | Description               | Default    | Required |
| ------------------------------ | ------------------------- | ---------- | -------- |
| `AZURE_OPENAI_API_KEY`         | Azure OpenAI API key      | -          | Yes      |
| `AZURE_OPENAI_API_ENDPOINT`    | Azure OpenAI endpoint URL | -          | Yes      |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Deployment name           | -          | Yes      |
| `AZURE_OPENAI_API_VERSION`     | API version               | 2024-06-01 | Yes      |

### Integration Variables

| Variable                      | Description               | Required For |
| ----------------------------- | ------------------------- | ------------ |
| `DATABRICKS_HOST`             | Databricks workspace URL  | Worker 1     |
| `DATABRICKS_TOKEN`            | Databricks access token   | Worker 1     |
| `DATABRICKS_SQL_WAREHOUSE_ID` | SQL warehouse ID          | Worker 1     |
| `DATABRICKS_GENIE_SPACE_ID`   | Genie space ID            | Worker 1     |
| `DYNATRACE_URL`               | Dynatrace environment URL | Worker 2     |
| `DYNATRACE_API_TOKEN`         | Dynatrace API token       | Worker 2     |
| `AZURE_SEARCH_ENDPOINT`       | Azure AI Search endpoint  | Worker 3     |
| `AZURE_SEARCH_KEY`            | Azure AI Search admin key | Worker 3     |
| `AZURE_SEARCH_INDEX`          | Search index name         | Worker 3     |

### Server Configuration

| Variable    | Description          | Default     |
| ----------- | -------------------- | ----------- |
| `PORT`      | Server port          | 3000        |
| `NODE_ENV`  | Environment mode     | development |
| `REDIS_URL` | Redis connection URL | -           |

### Optional Variables

| Variable            | Description       | Purpose                  |
| ------------------- | ----------------- | ------------------------ |
| `LANGSMITH_API_KEY` | LangSmith API key | Tracing and monitoring   |
| `LANGCHAIN_API_KEY` | LangChain API key | Alternative to LangSmith |

### Complete .env Example

```bash
# Core AI Service (Required)
AZURE_OPENAI_API_KEY=your-azure-openai-key
AZURE_OPENAI_API_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-06-01

# Databricks Integration (Optional - for Worker 1)
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi-your-token
DATABRICKS_SQL_WAREHOUSE_ID=warehouse-id
DATABRICKS_GENIE_SPACE_ID=space-id

# Dynatrace Integration (Optional - for Worker 2)
DYNATRACE_URL=https://your-env.live.dynatrace.com
DYNATRACE_API_TOKEN=dt0c01.your-token

# Azure AI Search (Optional - for Worker 3)
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_KEY=your-admin-key
AZURE_SEARCH_INDEX=docs-index

# Persistence (Recommended for Production)
REDIS_URL=redis://localhost:6379

# Server Configuration
PORT=3000
NODE_ENV=production

# Observability (Optional)
LANGSMITH_API_KEY=lsv2_your-key
```

---

## Troubleshooting

### Common Issues

#### 1. Connection Refused

**Symptom:** Agent Chat UI shows "Connection failed"

**Diagnosis:**

```bash
# Check if server is running
curl http://localhost:3000/health

# Check port availability
lsof -i :3000
```

**Solutions:**

- Verify the server is started: `yarn dev`
- Check firewall rules
- Ensure correct API URL in Agent Chat UI config

#### 2. CORS Errors

**Symptom:** Browser console shows CORS errors

**Solutions:**

```typescript
// In src/server/app.ts, ensure CORS is configured
app.register(cors, {
  origin: true,
  credentials: true,
});
```

#### 3. SSE Streaming Not Working

**Symptom:** Messages appear all at once instead of streaming

**Diagnosis:**

```bash
# Test SSE endpoint directly
curl -N http://localhost:3000/api/threads/thread-xxx/runs/run-yyy/stream
```

**Solutions:**

- Check proxy buffering is disabled (nginx: `proxy_buffering off;`)
- Verify `Cache-Control: no-cache` header is set
- Ensure no middleware is buffering responses

#### 4. Thread Not Found

**Symptom:** `404 NotFound` error

**Solutions:**

- Verify thread_id format (should start with `thread-`)
- Check if using MemorySaver (threads lost on restart) vs Redis
- Ensure thread was created before accessing

#### 5. Run Stuck in "running" State

**Symptom:** Run never completes

**Diagnosis:**

```bash
# Check thread state
curl http://localhost:3000/api/threads/{thread_id}
```

**Solutions:**

- Cancel the run: `POST /api/threads/{id}/runs/{run_id}/cancel`
- Restart the server (if using MemorySaver)
- Check LLM API rate limits

#### 6. Interrupt Not Displaying

**Symptom:** HITL interrupt not shown in Agent Chat UI

**Diagnosis:**

```bash
# Check thread interrupts field
curl http://localhost:3000/api/threads/{thread_id} | jq '.interrupts'
```

**Solutions:**

- Verify interrupt value is JSON-serializable
- Check thread status is "interrupted"
- Ensure interrupt schema matches expected format

#### 7. LLM API Errors

**Symptom:** `500 InternalError` or timeout

**Solutions:**

- Verify Azure OpenAI credentials
- Check deployment name is correct
- Monitor rate limits and quotas
- Review LangSmith traces for details

### Debug Mode

Enable verbose logging:

```bash
DEBUG=langchain,langgraph NODE_ENV=development yarn dev
```

### Health Check Failures

**Check Individual Components:**

```bash
# Azure OpenAI
curl -H "api-key: $AZURE_OPENAI_API_KEY" \
  "$AZURE_OPENAI_API_ENDPOINT/openai/deployments/$AZURE_OPENAI_DEPLOYMENT_NAME/chat/completions?api-version=2024-06-01"

# Redis
redis-cli ping

# Databricks
curl -H "Authorization: Bearer $DATABRICKS_TOKEN" \
  "$DATABRICKS_HOST/api/2.0/sql/warehouses/$DATABRICKS_SQL_WAREHOUSE_ID"
```

### Getting Help

1. Check logs: `yarn dev` output or container logs
2. Review LangSmith traces (if configured)
3. Consult ARCHITECTURE.md for design details
4. Check `.sisyphus/plans/agent-chat-ui-api-specs.md` for API specs

---

## Screenshots & Evidence

Integration testing was performed and documented in `.sisyphus/evidence/`:

### Connection Screenshots

| File                          | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `01-initial-page.png`         | Agent Chat UI initial connection screen          |
| `02-config-form-filled.png`   | Configuration form with API URL and assistant ID |
| `agent-chat-ui-connected.png` | Successful connection confirmation               |

### Scenario Screenshots

| File                    | Description                            |
| ----------------------- | -------------------------------------- |
| `scenario-01-hello.png` | Basic greeting and capability overview |

### Worker Screenshots

| File                                 | Description                                      |
| ------------------------------------ | ------------------------------------------------ |
| `worker-databricks.png`              | Databricks agent handling data query             |
| `worker-dynatrace.png`               | Dynatrace agent showing observability data       |
| `worker-knowledge.png`               | Knowledge agent answering documentation question |
| `worker-operations-hitl-initial.png` | Operations agent showing approval request        |

### Viewing Screenshots

```bash
# List all evidence files
ls -la .sisyphus/evidence/

# Open a specific screenshot
open .sisyphus/evidence/agent-chat-ui-connected.png
```

---

## Additional Resources

### Documentation

- [LangGraph Platform API Reference](https://langchain-ai.github.io/langgraph/cloud/reference/api/api_ref/)
- [Agent Chat UI Repository](https://github.com/langchain-ai/agent-chat-ui)
- [LangGraph.js Documentation](https://langchain-ai.github.io/langgraphjs/)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture details

### API Specification

See `.sisyphus/plans/agent-chat-ui-api-specs.md` for complete API specification including:

- Detailed request/response schemas
- SSE event formats
- Interrupt handling patterns
- Error response formats

### Support

For issues specific to:

- **Support Server:** Check logs and LangSmith traces
- **Agent Chat UI:** Refer to the [official repository](https://github.com/langchain-ai/agent-chat-ui)
- **LangGraph:** Consult [LangGraph documentation](https://langchain-ai.github.io/langgraph/)

---

**End of Setup Guide**
