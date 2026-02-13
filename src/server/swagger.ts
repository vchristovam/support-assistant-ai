import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";
import type { FastifySwaggerUiOptions } from "@fastify/swagger-ui";

export const swaggerConfig = {
  openapi: {
    info: {
      title: "Enterprise Support Autopilot API",
      description: `A multi-agent AI system for automating Tier-2 technical support tasks.

## Features

- **Multi-Agent System**: 7 specialized worker agents
- **Supervisor Pattern**: Intelligent routing to specialized agents
- **Human-in-the-Loop**: Secure approval workflows
- **Real-time Streaming**: Server-Sent Events (SSE)

## Agents

| Agent | Purpose |
|-------|---------|
| **Databricks** | Data analytics, SQL queries, Genie exploration |
| **Dynatrace** | System monitoring, observability, DQL queries |
| **Knowledge** | Documentation retrieval, vector search |
| **Operations** | Sensitive actions with HITL approval |
| **Human Interface** | User clarification questions |
| **Health Check** | System health monitoring |
| **Filesystem** | File operations via MCP |

## Authentication

API requests can be authenticated using:
- **JWT Bearer Token**: Authorization: Bearer [token]
- **User ID Header**: X-User-Id: [user_id] (for testing/internal use)

## SSE Streaming

Several endpoints return Server-Sent Events (SSE) for real-time updates:
- Stream format: event: [event_type] followed by data: [json]
- Events: metadata, values, messages, events, end`,
      version: "1.0.0",
      contact: {
        name: "Support Team",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],
    tags: [
      { name: "Health", description: "Health check endpoints" },
      {
        name: "Legacy Chat",
        description: "Legacy chat endpoints (deprecated)",
      },
      { name: "Threads", description: "Thread management" },
      { name: "Runs", description: "Run execution and streaming" },
      { name: "Interrupts", description: "HITL interrupt handling" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http" as const,
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT Bearer token for authentication",
        },
        userIdHeader: {
          type: "apiKey" as const,
          in: "header" as const,
          name: "X-User-Id",
          description: "User ID for testing/internal use",
        },
      },
      schemas: {
        Error: {
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        Thread: {
          type: "object" as const,
          properties: {
            thread_id: { type: "string" as const },
            created_at: { type: "string" as const, format: "date-time" },
            updated_at: { type: "string" as const, format: "date-time" },
            metadata: { type: "object" as const },
            values: { type: "object" as const },
            status: {
              type: "string" as const,
              enum: ["idle", "busy", "interrupted"],
            },
          },
        },
        Run: {
          type: "object" as const,
          properties: {
            run_id: { type: "string" as const },
            thread_id: { type: "string" as const },
            assistant_id: { type: "string" as const },
            status: {
              type: "string" as const,
              enum: ["pending", "running", "interrupted", "complete", "error"],
            },
            created_at: { type: "string" as const, format: "date-time" },
            updated_at: { type: "string" as const, format: "date-time" },
            metadata: { type: "object" as const },
          },
        },
        Message: {
          type: "object" as const,
          properties: {
            type: { type: "string" as const, enum: ["human", "ai", "tool"] },
            content: { type: "string" as const },
            tool_call_id: { type: "string" as const },
            name: { type: "string" as const },
          },
        },
        HITLInterrupt: {
          type: "object" as const,
          properties: {
            type: {
              type: "string" as const,
              enum: ["approval", "input", "selection"],
            },
            description: { type: "string" as const },
            value: { type: "object" as const },
            actions: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  id: { type: "string" as const },
                  label: { type: "string" as const },
                  type: {
                    type: "string" as const,
                    enum: ["approve", "reject", "edit"],
                  },
                },
              },
            },
          },
        },
        SSEEvent: {
          type: "object" as const,
          properties: {
            event: { type: "string" as const },
            data: { type: "object" as const },
          },
          description: "Server-Sent Event format",
        },
      },
    },
  },
} satisfies FastifyDynamicSwaggerOptions;

export const swaggerUiConfig = {
  routePrefix: "/documentation",
  uiConfig: {
    docExpansion: "list" as const,
    deepLinking: true,
    persistAuthorization: true,
  },
  staticCSP: true,
  transformStaticCSP: (header: string) => header,
} satisfies FastifySwaggerUiOptions;

export const routeSchemas = {
  health: {
    schema: {
      tags: ["Health"],
      summary: "Health check",
      description: "Returns the health status of the API",
      response: {
        200: {
          description: "Service is healthy",
          type: "object" as const,
          properties: {
            status: { type: "string" as const, example: "ok" },
          },
        },
      },
    },
  },

  chat: {
    schema: {
      tags: ["Legacy Chat"],
      summary: "Send a chat message (SSE)",
      description:
        "Send a message to the support system. Returns a Server-Sent Events stream with real-time updates.",
      body: {
        type: "object" as const,
        required: ["message"],
        properties: {
          message: { type: "string" as const, description: "User message" },
          thread_id: {
            type: "string" as const,
            description: "Optional thread ID",
          },
        },
      },
      response: {
        200: {
          description: "SSE stream of chat events",
          content: {
            "text/event-stream": {
              schema: {
                type: "string" as const,
                description: "Server-Sent Events stream",
              },
            },
          },
        },
        400: {
          description: "Bad request - message is required",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  chatResume: {
    schema: {
      tags: ["Legacy Chat"],
      summary: "Resume from HITL (SSE)",
      description: "Resume a conversation after a human-in-the-loop interrupt",
      body: {
        type: "object" as const,
        required: ["thread_id", "decision"],
        properties: {
          thread_id: { type: "string" as const },
          decision: {
            type: "string" as const,
            enum: ["approve", "reject", "edit"],
          },
          edited_action: { type: "object" as const },
        },
      },
      response: {
        200: {
          description: "SSE stream of resume events",
          content: {
            "text/event-stream": {
              schema: { type: "string" as const },
            },
          },
        },
        400: {
          description: "Invalid request",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  chatAnswer: {
    schema: {
      tags: ["Legacy Chat"],
      summary: "Answer a human interface question (SSE)",
      description:
        "Provide an answer to a question asked by the human interface agent",
      body: {
        type: "object" as const,
        required: ["thread_id", "answer"],
        properties: {
          thread_id: { type: "string" as const },
          answer: { type: "string" as const, description: "User's answer" },
        },
      },
      response: {
        200: {
          description: "SSE stream of response events",
          content: {
            "text/event-stream": {
              schema: { type: "string" as const },
            },
          },
        },
        400: {
          description: "Invalid request",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  createThread: {
    schema: {
      tags: ["Threads"],
      summary: "Create a new thread",
      description: "Create a new conversation thread",
      body: {
        type: "object" as const,
        properties: {
          thread_id: {
            type: "string" as const,
            description: "Optional custom thread ID",
          },
          metadata: {
            type: "object" as const,
            description: "Thread metadata",
          },
        },
      },
      response: {
        200: {
          description: "Thread created successfully",
          type: "object" as const,
          properties: {
            thread_id: { type: "string" as const },
            created_at: { type: "string" as const },
            updated_at: { type: "string" as const },
            metadata: { type: "object" as const },
            values: { type: "object" as const },
            status: { type: "string" as const },
          },
        },
        400: {
          description: "Bad request",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        503: {
          description: "Thread repository unavailable",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  getThread: {
    schema: {
      tags: ["Threads"],
      summary: "Get thread details",
      description: "Retrieve details of a specific thread",
      params: {
        type: "object" as const,
        required: ["thread_id"],
        properties: {
          thread_id: { type: "string" as const },
        },
      },
      response: {
        200: {
          description: "Thread details",
          type: "object" as const,
          properties: {
            thread_id: { type: "string" as const },
            created_at: { type: "string" as const },
            updated_at: { type: "string" as const },
            metadata: { type: "object" as const },
            values: { type: "object" as const },
            status: { type: "string" as const },
          },
        },
        404: {
          description: "Thread not found",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        500: {
          description: "Internal server error",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        503: {
          description: "Thread repository unavailable",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  getThreadHistory: {
    schema: {
      tags: ["Threads"],
      summary: "Get thread message history",
      description: "Retrieve the message history of a thread",
      params: {
        type: "object" as const,
        required: ["thread_id"],
        properties: {
          thread_id: { type: "string" as const },
        },
      },
      response: {
        200: {
          description: "Thread messages",
          type: "object" as const,
          properties: {
            messages: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  type: {
                    type: "string" as const,
                    enum: ["human", "ai", "tool"],
                  },
                  content: { type: "string" as const },
                  tool_call_id: { type: "string" as const },
                  name: { type: "string" as const },
                },
              },
            },
          },
        },
        404: {
          description: "Thread not found",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        500: {
          description: "Internal server error",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        503: {
          description: "Repository unavailable",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  createRun: {
    schema: {
      tags: ["Runs"],
      summary: "Create a new run",
      description: "Start a new execution run for a thread",
      params: {
        type: "object" as const,
        required: ["thread_id"],
        properties: {
          thread_id: { type: "string" as const },
        },
      },
      body: {
        type: "object" as const,
        required: ["assistant_id"],
        properties: {
          assistant_id: {
            type: "string" as const,
            description: "Assistant/agent ID",
          },
          input: {
            type: "object" as const,
            properties: {
              messages: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  properties: {
                    type: {
                      type: "string" as const,
                      enum: ["human", "ai", "tool"],
                    },
                    content: { type: "string" as const },
                    tool_call_id: { type: "string" as const },
                    name: { type: "string" as const },
                  },
                },
              },
            },
          },
          metadata: { type: "object" as const },
          config: {
            type: "object" as const,
            properties: {
              tags: {
                type: "array" as const,
                items: { type: "string" as const },
              },
              recursion_limit: { type: "number" as const },
              configurable: { type: "object" as const },
            },
          },
          streamMode: {
            type: "array" as const,
            items: {
              type: "string" as const,
              enum: [
                "values",
                "messages",
                "events",
                "updates",
                "debug",
                "custom",
              ],
            },
          },
          interruptBefore: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          interruptAfter: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          command: {
            type: "object" as const,
            properties: {
              resume: {},
              update: {},
              goto: {
                oneOf: [
                  { type: "string" as const },
                  {
                    type: "array" as const,
                    items: { type: "string" as const },
                  },
                ],
              },
            },
          },
        },
      },
      response: {
        200: {
          description: "Run created successfully",
          type: "object" as const,
          properties: {
            run_id: { type: "string" as const },
            thread_id: { type: "string" as const },
            assistant_id: { type: "string" as const },
            status: { type: "string" as const },
            created_at: { type: "string" as const },
            updated_at: { type: "string" as const },
            metadata: { type: "object" as const },
          },
        },
        400: {
          description: "Bad request",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        404: {
          description: "Thread not found",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        500: {
          description: "Internal error",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  getRun: {
    schema: {
      tags: ["Runs"],
      summary: "Get run details",
      description: "Retrieve details of a specific run",
      params: {
        type: "object" as const,
        required: ["thread_id", "run_id"],
        properties: {
          thread_id: { type: "string" as const },
          run_id: { type: "string" as const },
        },
      },
      response: {
        200: {
          description: "Run details",
          type: "object" as const,
          properties: {
            run_id: { type: "string" as const },
            thread_id: { type: "string" as const },
            assistant_id: { type: "string" as const },
            status: { type: "string" as const },
            created_at: { type: "string" as const },
            updated_at: { type: "string" as const },
            metadata: { type: "object" as const },
          },
        },
        404: {
          description: "Run not found",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        500: {
          description: "Internal error",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  cancelRun: {
    schema: {
      tags: ["Runs"],
      summary: "Cancel a run",
      description: "Cancel an active run",
      params: {
        type: "object" as const,
        required: ["thread_id", "run_id"],
        properties: {
          thread_id: { type: "string" as const },
          run_id: { type: "string" as const },
        },
      },
      response: {
        200: {
          description: "Run cancelled successfully",
          type: "object" as const,
          properties: {
            success: { type: "boolean" as const },
          },
        },
        404: {
          description: "Run not found or already complete",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        500: {
          description: "Internal error",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  streamRun: {
    schema: {
      tags: ["Runs"],
      summary: "Stream run events (SSE)",
      description:
        "Stream events from a run in real-time using Server-Sent Events. Supports Last-Event-ID header for resuming streams.",
      params: {
        type: "object" as const,
        required: ["thread_id", "run_id"],
        properties: {
          thread_id: { type: "string" as const },
          run_id: { type: "string" as const },
        },
      },
      headers: {
        type: "object" as const,
        properties: {
          "Last-Event-ID": {
            type: "string" as const,
            description: "Event ID to resume from",
          },
        },
      },
      response: {
        200: {
          description: "SSE stream of run events",
          content: {
            "text/event-stream": {
              schema: { type: "string" as const },
            },
          },
        },
        404: {
          description: "Run not found",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },

  interruptResume: {
    schema: {
      tags: ["Interrupts"],
      summary: "Resume from interrupt (SSE)",
      description: "Resume a run from a human-in-the-loop interrupt",
      params: {
        type: "object" as const,
        required: ["thread_id", "run_id"],
        properties: {
          thread_id: { type: "string" as const },
          run_id: { type: "string" as const },
        },
      },
      body: {
        type: "object" as const,
        required: ["action"],
        properties: {
          action: {
            type: "string" as const,
            enum: ["accept", "reject", "edit"],
            description: "User's decision",
          },
          value: {
            type: "object" as const,
            description: "Edited values (required if action is 'edit')",
          },
        },
      },
      response: {
        200: {
          description: "SSE stream of resumed execution",
          content: {
            "text/event-stream": {
              schema: { type: "string" as const },
            },
          },
        },
        400: {
          description: "Invalid action",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        404: {
          description: "Run not found",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
        409: {
          description: "Run not in interrupted state",
          type: "object" as const,
          properties: {
            error: { type: "string" as const },
            message: { type: "string" as const },
          },
        },
      },
    },
  },
};
