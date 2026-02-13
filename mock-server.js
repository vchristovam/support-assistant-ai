// Mock LangGraph Platform Server for Agent Chat UI Testing
// This server simulates the LangGraph Platform API endpoints required by Agent Chat UI

import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 2024;

// In-memory storage for threads and runs
const threads = new Map();
const runs = new Map();

// Helper to create a thread
function createThread(metadata = {}) {
  const threadId = `thread-${uuidv4()}`;
  const now = new Date().toISOString();
  const thread = {
    thread_id: threadId,
    created_at: now,
    updated_at: now,
    metadata: {
      assistant_id: "agent",
      ...metadata,
    },
    status: "idle",
    values: {
      messages: [],
    },
    interrupts: {},
  };
  threads.set(threadId, thread);
  return thread;
}

// Helper to create a run
function createRun(threadId, assistantId, input = {}, metadata = {}) {
  const runId = `run-${uuidv4()}`;
  const now = new Date().toISOString();
  const run = {
    run_id: runId,
    thread_id: threadId,
    assistant_id: assistantId,
    created_at: now,
    updated_at: now,
    status: "pending",
    metadata,
    multitask_strategy: "reject",
  };
  runs.set(runId, run);
  return run;
}

// Helper to simulate AI response based on user message
function generateResponse(message, thread) {
  const content = message.toLowerCase();
  const messages = thread.values.messages;

  // Detect which worker agent should handle this
  if (
    content.includes("databricks") ||
    content.includes("database") ||
    content.includes("query") ||
    content.includes("sql") ||
    content.includes("orders")
  ) {
    return {
      toolCall: {
        name: "transfer_to_databricks",
        arguments: JSON.stringify({ request: message }),
      },
      response:
        "I'll query the database for you. Let me retrieve that information from Databricks.",
      toolResult: {
        status: "success",
        data: {
          recent_orders: [
            {
              order_id: "ORD-001",
              customer: "John Doe",
              amount: 150.0,
              status: "completed",
            },
            {
              order_id: "ORD-002",
              customer: "Jane Smith",
              amount: 275.5,
              status: "pending",
            },
            {
              order_id: "ORD-003",
              customer: "Bob Johnson",
              amount: 89.99,
              status: "completed",
            },
          ],
        },
      },
    };
  }

  if (
    content.includes("dynatrace") ||
    content.includes("logs") ||
    content.includes("error") ||
    content.includes("monitoring") ||
    content.includes("system")
  ) {
    return {
      toolCall: {
        name: "transfer_to_dynatrace",
        arguments: JSON.stringify({ request: message }),
      },
      response:
        "I'll check the system logs for errors using Dynatrace monitoring.",
      toolResult: {
        status: "success",
        data: {
          errors_found: 3,
          recent_errors: [
            {
              timestamp: "2026-02-12T10:30:00Z",
              service: "api-gateway",
              level: "ERROR",
              message: "Connection timeout",
            },
            {
              timestamp: "2026-02-12T10:25:00Z",
              service: "database",
              level: "WARN",
              message: "Slow query detected",
            },
          ],
        },
      },
    };
  }

  if (
    content.includes("knowledge") ||
    content.includes("reset password") ||
    content.includes("how to") ||
    content.includes("documentation") ||
    content.includes("help")
  ) {
    return {
      toolCall: {
        name: "transfer_to_knowledge",
        arguments: JSON.stringify({ request: message }),
      },
      response:
        "I'll search our knowledge base for you. Here's how to reset your password:\n\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email address\n4. Check your inbox for reset instructions\n5. Follow the link to create a new password",
      toolResult: null,
    };
  }

  if (
    content.includes("operations") ||
    content.includes("cancel") ||
    content.includes("modify")
  ) {
    // Extract order ID if present
    const orderIdMatch = message.match(/\d+/);
    const orderId = orderIdMatch ? orderIdMatch[0] : "12345";

    return {
      toolCall: {
        name: "transfer_to_operations",
        arguments: JSON.stringify({ request: message }),
      },
      response: null, // Will be handled by interrupt
      toolResult: null,
      interrupt: {
        type: "approval",
        description: `Approve cancellation of order ${orderId}`,
        value: {
          action: "request_order_cancellation",
          orderId: orderId,
          reason: "Customer request",
        },
        actions: [
          { id: "approve", label: "Approve", type: "approve" },
          { id: "reject", label: "Reject", type: "reject" },
          { id: "edit", label: "Edit", type: "edit" },
        ],
        schema: {
          type: "object",
          properties: {
            orderId: { type: "string" },
            reason: { type: "string" },
          },
          required: ["orderId", "reason"],
        },
      },
    };
  }

  if (
    content.includes("human interface") ||
    content.includes("what information") ||
    content.includes("clarify")
  ) {
    return {
      toolCall: {
        name: "transfer_to_human_interface",
        arguments: JSON.stringify({ request: message }),
      },
      response:
        "To help you better, I need some additional information:\n\n1. What specific issue are you experiencing?\n2. When did this problem start?\n3. Have you tried any troubleshooting steps already?\n\nPlease provide these details so I can assist you more effectively.",
      toolResult: null,
    };
  }

  if (
    content.includes("health") ||
    content.includes("check") ||
    content.includes("calculator") ||
    content.includes("b3")
  ) {
    return {
      toolCall: {
        name: "transfer_to_health_check",
        arguments: JSON.stringify({ request: message }),
      },
      response:
        "I'll check the health of the B3 calculator and related services.",
      toolResult: {
        status: "success",
        data: {
          services: {
            "b3-calculator": {
              status: "healthy",
              uptime: "99.9%",
              response_time: "120ms",
            },
            "api-gateway": {
              status: "healthy",
              uptime: "99.95%",
              response_time: "45ms",
            },
            database: {
              status: "healthy",
              uptime: "99.99%",
              response_time: "15ms",
            },
          },
          overall: "healthy",
        },
      },
    };
  }

  // Thread persistence test
  if (
    content.includes("what did i ask") ||
    content.includes("earlier") ||
    content.includes("previous") ||
    content.includes("before")
  ) {
    const previousMessages = messages
      .filter((m) => m.type === "human")
      .slice(0, -1)
      .map((m) => m.content);

    if (previousMessages.length > 0) {
      return {
        response: `Earlier in our conversation, you asked: "${previousMessages[previousMessages.length - 1]}"\n\nI remember our conversation history and can reference previous messages.`,
        toolResult: null,
      };
    } else {
      return {
        response:
          "This appears to be the start of our conversation. I don't see any previous messages yet.",
        toolResult: null,
      };
    }
  }

  // Default greeting response
  return {
    response:
      "Hello! I'm the Enterprise Support Autopilot. I can help you with:\n\n- Database queries via Databricks\n- System monitoring via Dynatrace\n- Knowledge base lookups\n- Operations (order cancellation with approval)\n- General questions\n\nWhat can I assist you with today?",
    toolResult: null,
  };
}

// ========== API ENDPOINTS ==========

// 1. POST /threads - Create a new thread
app.post("/threads", (req, res) => {
  const { metadata } = req.body;
  const thread = createThread(metadata);
  res.json(thread);
});

// 2. GET /threads/:thread_id - Get thread by ID
app.get("/threads/:thread_id", (req, res) => {
  const { thread_id } = req.params;
  const thread = threads.get(thread_id);
  if (!thread) {
    return res
      .status(404)
      .json({ error: "NotFound", message: `Thread '${thread_id}' not found` });
  }
  res.json(thread);
});

// 3. POST /threads/search - Search threads
app.post("/threads/search", (req, res) => {
  const { status, metadata, limit = 10 } = req.body;
  let results = Array.from(threads.values());

  if (status) {
    results = results.filter((t) => t.status === status);
  }

  if (metadata && metadata.assistant_id) {
    results = results.filter(
      (t) => t.metadata.assistant_id === metadata.assistant_id,
    );
  }

  res.json(results.slice(0, limit));
});

// 4. POST /threads/:thread_id/runs - Create a run
app.post("/threads/:thread_id/runs", (req, res) => {
  const { thread_id } = req.params;
  const { assistant_id, input, metadata, command } = req.body;

  const thread = threads.get(thread_id);
  if (!thread) {
    return res
      .status(404)
      .json({ error: "NotFound", message: `Thread '${thread_id}' not found` });
  }

  const run = createRun(thread_id, assistant_id, input, metadata);

  // Handle command (resume from interrupt)
  if (command && command.resume) {
    thread.status = "idle";
    thread.interrupts = {};

    const resumeResponse = command.resume;
    let responseMessage;

    if (resumeResponse.action === "reject") {
      responseMessage = "Order cancellation was rejected by the user.";
    } else if (resumeResponse.action === "edit" && resumeResponse.value) {
      responseMessage = `Order ${resumeResponse.value.orderId} has been cancelled successfully with updated details.`;
    } else {
      responseMessage = "Order has been cancelled successfully.";
    }

    thread.values.messages.push({
      type: "ai",
      content: responseMessage,
    });

    run.status = "success";
    res.json(run);
    return;
  }

  // Process input message
  if (input && input.messages && input.messages.length > 0) {
    const lastMessage = input.messages[input.messages.length - 1];
    if (lastMessage.type === "human") {
      thread.values.messages.push(lastMessage);

      const result = generateResponse(lastMessage.content, thread);

      if (result.toolCall) {
        // Add tool call message
        thread.values.messages.push({
          type: "ai",
          content: result.response || "",
          tool_calls: [
            {
              id: `call-${uuidv4()}`,
              type: "function",
              function: {
                name: result.toolCall.name,
                arguments: result.toolCall.arguments,
              },
            },
          ],
        });

        // Add tool result if available
        if (result.toolResult) {
          thread.values.messages.push({
            type: "tool",
            tool_call_id:
              thread.values.messages[thread.values.messages.length - 1]
                .tool_calls[0].id,
            content: JSON.stringify(result.toolResult),
          });
        }

        // Handle interrupt
        if (result.interrupt) {
          thread.status = "interrupted";
          thread.interrupts.agent = [
            {
              id: `interrupt-${uuidv4()}`,
              value: result.interrupt,
            },
          ];
        } else {
          thread.values.messages.push({
            type: "ai",
            content: `Tool result: ${JSON.stringify(result.toolResult, null, 2)}`,
          });
        }
      } else {
        thread.values.messages.push({
          type: "ai",
          content: result.response,
        });
      }
    }
  }

  thread.updated_at = new Date().toISOString();
  run.status = thread.status === "interrupted" ? "interrupted" : "success";

  res.json(run);
});

// 5. POST /runs/stream - Stateless streaming
app.post("/runs/stream", (req, res) => {
  const { assistant_id, input, streamMode = ["values"] } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const thread = createThread();
  const run = createRun(thread.thread_id, assistant_id);

  // Send metadata
  res.write(`event: metadata\n`);
  res.write(
    `data: ${JSON.stringify({ run_id: run.run_id, thread_id: thread.thread_id })}\n\n`,
  );

  // Process input
  if (input && input.messages && input.messages.length > 0) {
    const lastMessage = input.messages[input.messages.length - 1];
    thread.values.messages = [...input.messages];

    res.write(`event: values\n`);
    res.write(
      `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
    );

    if (lastMessage.type === "human") {
      const result = generateResponse(lastMessage.content, thread);

      if (result.toolCall) {
        // Simulate streaming chunks
        const chunks = result.response
          ? result.response.split(" ")
          : ["Processing"];
        chunks.forEach((chunk, i) => {
          res.write(`event: messages\n`);
          res.write(
            `data: ${JSON.stringify([{ type: "ai", content: chunk + " " }])}\n\n`,
          );
        });

        // Add tool call
        const toolCallId = `call-${uuidv4()}`;
        thread.values.messages.push({
          type: "ai",
          content: result.response || "",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: result.toolCall.name,
                arguments: result.toolCall.arguments,
              },
            },
          ],
        });

        res.write(`event: values\n`);
        res.write(
          `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
        );

        // Handle interrupt
        if (result.interrupt) {
          thread.status = "interrupted";
          thread.interrupts.agent = [
            {
              id: `interrupt-${uuidv4()}`,
              value: result.interrupt,
            },
          ];
        } else if (result.toolResult) {
          // Add tool result
          thread.values.messages.push({
            type: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify(result.toolResult),
          });

          res.write(`event: values\n`);
          res.write(
            `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
          );

          // Final response
          thread.values.messages.push({
            type: "ai",
            content: `Tool execution completed: ${result.toolCall.name}`,
          });

          res.write(`event: values\n`);
          res.write(
            `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
          );
        }
      } else {
        // Stream the response
        const response = result.response || "I understand.";
        const chunks = response.split(" ");

        chunks.forEach((chunk) => {
          res.write(`event: messages\n`);
          res.write(
            `data: ${JSON.stringify([{ type: "ai", content: chunk + " " }])}\n\n`,
          );
        });

        thread.values.messages.push({
          type: "ai",
          content: response,
        });

        res.write(`event: values\n`);
        res.write(
          `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
        );
      }
    }
  }

  res.write(`event: end\n`);
  res.write(`data: {}\n\n`);
  res.end();
});

// 6. POST /threads/:thread_id/runs/stream - Stateful streaming
app.post("/threads/:thread_id/runs/stream", (req, res) => {
  const { thread_id } = req.params;
  const { assistant_id, input, command, streamMode = ["values"] } = req.body;

  let thread = threads.get(thread_id);
  if (!thread) {
    return res
      .status(404)
      .json({ error: "NotFound", message: `Thread '${thread_id}' not found` });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const run = createRun(thread_id, assistant_id);

  // Send metadata
  res.write(`event: metadata\n`);
  res.write(`data: ${JSON.stringify({ run_id: run.run_id, thread_id })}\n\n`);

  // Send current values
  res.write(`event: values\n`);
  res.write(
    `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
  );

  // Handle command (resume from interrupt)
  if (command && command.resume) {
    thread.status = "idle";
    thread.interrupts = {};

    const resumeResponse = command.resume;
    let responseMessage;

    if (resumeResponse.action === "reject") {
      responseMessage = "Order cancellation was rejected by the user.";
    } else if (resumeResponse.action === "edit" && resumeResponse.value) {
      responseMessage = `Order ${resumeResponse.value.orderId} has been cancelled successfully with the updated details.`;
    } else {
      responseMessage = "Order has been cancelled successfully.";
    }

    res.write(`event: messages\n`);
    res.write(
      `data: ${JSON.stringify([{ type: "ai", content: responseMessage }])}\n\n`,
    );

    thread.values.messages.push({
      type: "ai",
      content: responseMessage,
    });

    res.write(`event: values\n`);
    res.write(
      `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
    );

    res.write(`event: end\n`);
    res.write(`data: {}\n\n`);
    res.end();
    return;
  }

  // Process input
  if (input && input.messages && input.messages.length > 0) {
    const lastMessage = input.messages[input.messages.length - 1];
    if (lastMessage.type === "human") {
      thread.values.messages.push(lastMessage);

      res.write(`event: values\n`);
      res.write(
        `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
      );

      const result = generateResponse(lastMessage.content, thread);

      if (result.toolCall) {
        // Stream response
        const chunks = result.response
          ? result.response.split(" ")
          : ["Processing"];
        chunks.forEach((chunk) => {
          res.write(`event: messages\n`);
          res.write(
            `data: ${JSON.stringify([{ type: "ai", content: chunk + " " }])}\n\n`,
          );
        });

        // Add tool call
        const toolCallId = `call-${uuidv4()}`;
        const toolCallMessage = {
          type: "ai",
          content: result.response || "",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: result.toolCall.name,
                arguments: result.toolCall.arguments,
              },
            },
          ],
        };
        thread.values.messages.push(toolCallMessage);

        res.write(`event: values\n`);
        res.write(
          `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
        );

        // Handle interrupt
        if (result.interrupt) {
          thread.status = "interrupted";
          thread.interrupts.agent = [
            {
              id: `interrupt-${uuidv4()}`,
              value: result.interrupt,
            },
          ];

          // Stream interrupt event
          res.write(`event: values\n`);
          res.write(
            `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
          );
        } else if (result.toolResult) {
          // Add tool result
          thread.values.messages.push({
            type: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify(result.toolResult),
          });

          res.write(`event: values\n`);
          res.write(
            `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
          );

          // Final response
          const finalResponse = `Tool execution completed: ${result.toolCall.name}`;
          thread.values.messages.push({
            type: "ai",
            content: finalResponse,
          });

          res.write(`event: messages\n`);
          res.write(
            `data: ${JSON.stringify([{ type: "ai", content: finalResponse }])}\n\n`,
          );

          res.write(`event: values\n`);
          res.write(
            `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
          );
        }
      } else {
        // Stream the response
        const response = result.response || "I understand.";
        const chunks = response.split(" ");

        chunks.forEach((chunk) => {
          res.write(`event: messages\n`);
          res.write(
            `data: ${JSON.stringify([{ type: "ai", content: chunk + " " }])}\n\n`,
          );
        });

        thread.values.messages.push({
          type: "ai",
          content: response,
        });

        res.write(`event: values\n`);
        res.write(
          `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
        );
      }
    }
  }

  thread.updated_at = new Date().toISOString();
  res.write(`event: end\n`);
  res.write(`data: {}\n\n`);
  res.end();
});

// 7. GET /threads/:thread_id/runs/:run_id/stream - Join stream
app.get("/threads/:thread_id/runs/:run_id/stream", (req, res) => {
  const { thread_id, run_id } = req.params;
  const thread = threads.get(thread_id);
  const run = runs.get(run_id);

  if (!thread || !run) {
    return res
      .status(404)
      .json({ error: "NotFound", message: "Thread or run not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`event: metadata\n`);
  res.write(`data: ${JSON.stringify({ run_id, thread_id })}\n\n`);

  res.write(`event: values\n`);
  res.write(
    `data: ${JSON.stringify({ messages: thread.values.messages })}\n\n`,
  );

  res.write(`event: end\n`);
  res.write(`data: {}\n\n`);
  res.end();
});

// 8. GET /threads/:thread_id/state - Get thread state
app.get("/threads/:thread_id/state", (req, res) => {
  const { thread_id } = req.params;
  const thread = threads.get(thread_id);

  if (!thread) {
    return res
      .status(404)
      .json({ error: "NotFound", message: `Thread '${thread_id}' not found` });
  }

  res.json({
    values: thread.values,
    next: thread.status === "interrupted" ? ["agent"] : [],
    checkpoint: {
      thread_id,
      checkpoint_ns: "",
      checkpoint_id: `checkpoint-${uuidv4()}`,
    },
    metadata: thread.metadata,
    tasks: thread.interrupts.agent
      ? [
          {
            id: `task-${uuidv4()}`,
            name: "agent",
            interrupts: thread.interrupts.agent || [],
          },
        ]
      : [],
  });
});

// 9. POST /threads/:thread_id/state - Update thread state
app.post("/threads/:thread_id/state", (req, res) => {
  const { thread_id } = req.params;
  const { values } = req.body;
  const thread = threads.get(thread_id);

  if (!thread) {
    return res
      .status(404)
      .json({ error: "NotFound", message: `Thread '${thread_id}' not found` });
  }

  if (values) {
    thread.values = { ...thread.values, ...values };
  }

  res.json({
    configurable: {
      thread_id,
      checkpoint_id: `checkpoint-${uuidv4()}`,
    },
  });
});

// Info endpoint for LangGraph Platform compatibility
app.get("/info", (req, res) => {
  res.json({
    version: "1.0.0",
    graphs: {
      agent: {
        graph_id: "agent",
        name: "Enterprise Support Autopilot",
        description: "Multi-agent support system with 6 worker agents",
      },
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "mock-langgraph-server" });
});

// List assistants/graphs
app.get("/assistants", (req, res) => {
  res.json([
    {
      assistant_id: "agent",
      graph_id: "agent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      config: {},
      metadata: { name: "Enterprise Support Autopilot" },
    },
  ]);
});

app.listen(PORT, () => {
  console.log(
    `🚀 Mock LangGraph Platform Server running on http://localhost:${PORT}`,
  );
  console.log(`📋 Supported endpoints:`);
  console.log(`   POST /threads - Create thread`);
  console.log(`   GET  /threads/:id - Get thread`);
  console.log(`   POST /threads/search - Search threads`);
  console.log(`   POST /runs/stream - Stateless streaming`);
  console.log(`   POST /threads/:id/runs/stream - Stateful streaming`);
  console.log(`   GET  /threads/:id/state - Get thread state`);
  console.log(`   POST /threads/:id/state - Update thread state`);
  console.log(`   GET  /assistants - List assistants`);
  console.log(`   GET  /health - Health check`);
  console.log(
    `\n✅ All 6 worker agents simulated: databricks, dynatrace, knowledge, operations, human_interface, health_check`,
  );
  console.log(`✅ HITL interrupts supported for operations agent`);
  console.log(`✅ Thread persistence enabled`);
});
