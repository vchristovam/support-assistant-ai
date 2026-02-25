export const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
  required: ["error", "message"],
} as const;

export const threadSchema = {
  type: "object",
  properties: {
    thread_id: { type: "string" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    state_updated_at: { type: "string", format: "date-time" },
    metadata: {
      type: "object",
      additionalProperties: true,
    },
    status: { type: "string" },
    values: {
      type: "object",
      additionalProperties: true,
    },
    interrupts: {
      type: "object",
      additionalProperties: true,
    },
  },
  required: [
    "thread_id",
    "created_at",
    "updated_at",
    "state_updated_at",
    "metadata",
    "status",
    "values",
    "interrupts",
  ],
} as const;

export const runSchema = {
  type: "object",
  properties: {
    run_id: { type: "string" },
    thread_id: { type: "string" },
    assistant_id: { type: "string" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    status: { type: "string" },
    metadata: {
      type: "object",
      additionalProperties: true,
    },
    kwargs: {
      type: "object",
      additionalProperties: true,
    },
    multitask_strategy: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    error: { type: "string" },
  },
  required: [
    "run_id",
    "thread_id",
    "assistant_id",
    "created_at",
    "updated_at",
    "status",
    "metadata",
    "kwargs",
  ],
} as const;

export const threadStateSchema = {
  type: "object",
  properties: {
    values: {
      type: "object",
      additionalProperties: true,
    },
    next: {
      type: "array",
      items: { type: "string" },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
    metadata: {
      type: "object",
      additionalProperties: true,
    },
    created_at: {
      anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
    },
    parent_checkpoint: {
      anyOf: [
        { type: "object", additionalProperties: true },
        { type: "null" },
      ],
    },
    config: {
      type: "object",
      additionalProperties: true,
    },
    checkpoint: {
      type: "object",
      additionalProperties: true,
    },
  },
  required: [
    "values",
    "next",
    "tasks",
    "metadata",
    "config",
    "checkpoint",
  ],
} as const;

export const runBodySchema = {
  type: "object",
  properties: {
    assistant_id: { type: "string" },
    input: { type: "object", additionalProperties: true },
    command: { type: "object", additionalProperties: true },
    stream_mode: {
      anyOf: [
        { type: "string" },
        {
          type: "array",
          items: { type: "string" },
        },
      ],
    },
    stream_subgraphs: { type: "boolean" },
    stream_resumable: { type: "boolean" },
    metadata: { type: "object", additionalProperties: true },
    config: { type: "object", additionalProperties: true },
    context: { type: "object", additionalProperties: true },
    multitask_strategy: {
      type: "string",
      enum: ["reject", "interrupt", "rollback", "enqueue"],
    },
    on_disconnect: {
      type: "string",
      enum: ["cancel", "continue"],
    },
    checkpoint: { type: "object", additionalProperties: true },
    checkpoint_id: { type: "string" },
    durability: {
      type: "string",
      enum: ["sync", "async", "exit"],
    },
  },
  required: ["assistant_id"],
} as const;
