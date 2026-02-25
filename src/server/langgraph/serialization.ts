import type { RunBody, StreamMode } from "./types.js";
import { isRecord } from "./utils.js";

const messageTypes = new Set([
  "ai",
  "human",
  "system",
  "tool",
  "function",
  "remove",
]);

export const normalizeMessageType = (type: string): string => {
  const lowered = type.toLowerCase();
  if (lowered === "assistant") {
    return "ai";
  }
  if (lowered === "user") {
    return "human";
  }
  if (lowered.endsWith("messagechunk")) {
    return lowered.slice(0, -"messagechunk".length);
  }
  if (lowered.endsWith("message")) {
    return lowered.slice(0, -"message".length);
  }
  return lowered;
};

const isLangChainMessageDict = (
  value: unknown,
): value is { type: string; data: Record<string, unknown> } => {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.data)) {
    return false;
  }
  return messageTypes.has(normalizeMessageType(value.type));
};

export const toSerializable = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item));
  }
  if (isRecord(value)) {
    const asMaybeMessage = value as {
      toDict?: () => unknown;
      toJSON?: () => unknown;
    };
    if (typeof asMaybeMessage.toDict === "function") {
      const asDict = asMaybeMessage.toDict();
      if (isLangChainMessageDict(asDict)) {
        return {
          type: normalizeMessageType(asDict.type),
          ...(toSerializable(asDict.data) as Record<string, unknown>),
        };
      }
      return toSerializable(asDict);
    }
    if (typeof asMaybeMessage.toJSON === "function") {
      return toSerializable(asMaybeMessage.toJSON());
    }

    if (isLangChainMessageDict(value)) {
      return {
        type: normalizeMessageType(value.type),
        ...(toSerializable(value.data) as Record<string, unknown>),
      };
    }

    const serialized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      serialized[key] = toSerializable(nested);
    }
    return serialized;
  }
  return value;
};

export const toMessageLike = (
  value: unknown,
  fallbackType: "ai" | "human" | "system" | "tool" = "ai",
): Record<string, unknown> => {
  const serialized = toSerializable(value);
  if (isRecord(serialized)) {
    const asMessageType = serialized.type;
    if (typeof asMessageType === "string") {
      const normalizedType = normalizeMessageType(asMessageType);
      if (messageTypes.has(normalizedType)) {
        return {
          ...serialized,
          type: normalizedType,
        };
      }
    }
    if (Object.prototype.hasOwnProperty.call(serialized, "content")) {
      return {
        type: fallbackType,
        ...serialized,
      };
    }
  }
  if (typeof serialized === "string") {
    return { type: fallbackType, content: serialized };
  }
  return { type: fallbackType, content: "" };
};

export const getStreamNamespace = (
  event: Record<string, unknown>,
): string | undefined => {
  const metadata = event.metadata;
  if (isRecord(metadata)) {
    const rawNamespace =
      metadata.langgraph_checkpoint_ns ??
      metadata.checkpoint_ns ??
      metadata.namespace;
    if (typeof rawNamespace === "string" && rawNamespace.length > 0) {
      return rawNamespace;
    }
  }

  const namespace = event.namespace;
  if (typeof namespace === "string" && namespace.length > 0) {
    return namespace;
  }
  if (Array.isArray(namespace)) {
    const parts = namespace.filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) {
      return parts.join("|");
    }
  }
  return undefined;
};

export const withNamespace = (eventName: string, namespace?: string): string => {
  if (!namespace) {
    return eventName;
  }
  return `${eventName}|${namespace}`;
};

export const normalizeStreamModes = (
  mode: RunBody["stream_mode"],
): Set<StreamMode> => {
  if (Array.isArray(mode)) {
    return new Set(mode);
  }
  if (typeof mode === "string") {
    return new Set([mode]);
  }
  return new Set<StreamMode>(["values", "messages", "updates", "events"]);
};

export const hasStreamMode = (modes: Set<StreamMode>, mode: StreamMode): boolean =>
  modes.has(mode);

export const parseInterruptsFromValues = (
  values: Record<string, unknown>,
): Record<string, unknown[]> => {
  const rawInterrupts = values.__interrupt__;
  if (Array.isArray(rawInterrupts)) {
    return { default: rawInterrupts };
  }
  return {};
};
