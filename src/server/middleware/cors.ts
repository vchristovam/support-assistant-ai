import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface CorsConfig {
  allowAllOrigins: boolean;
  allowedOrigins: Set<string>;
  allowCredentials: boolean;
  allowMethods: string[];
  allowHeaders: string[];
  exposeHeaders: string[];
  maxAgeSeconds: number;
}

const splitCsv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const appendVary = (reply: FastifyReply, headerName: string): void => {
  const current = reply.getHeader("Vary");
  if (typeof current === "string" && current.length > 0) {
    const values = current
      .split(",")
      .map((entry) => entry.trim().toLowerCase());
    if (!values.includes(headerName.toLowerCase())) {
      reply.header("Vary", `${current}, ${headerName}`);
    }
    return;
  }
  reply.header("Vary", headerName);
};

const getCorsConfig = (): CorsConfig => {
  const origins = splitCsv(process.env.CORS_ALLOWED_ORIGINS);
  const allowAllOrigins = origins.length === 0 || origins.includes("*");

  return {
    allowAllOrigins,
    allowedOrigins: new Set(origins.filter((origin) => origin !== "*")),
    allowCredentials: process.env.CORS_ALLOW_CREDENTIALS === "true",
    allowMethods:
      splitCsv(process.env.CORS_ALLOWED_METHODS).length > 0
        ? splitCsv(process.env.CORS_ALLOWED_METHODS)
        : ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders:
      splitCsv(process.env.CORS_ALLOWED_HEADERS).length > 0
        ? splitCsv(process.env.CORS_ALLOWED_HEADERS)
        : [
            "Content-Type",
            "Authorization",
            "X-User-Id",
            "Last-Event-ID",
          ],
    exposeHeaders:
      splitCsv(process.env.CORS_EXPOSE_HEADERS).length > 0
        ? splitCsv(process.env.CORS_EXPOSE_HEADERS)
        : ["Content-Location", "Location", "X-Request-Id"],
    maxAgeSeconds: Number.parseInt(process.env.CORS_MAX_AGE ?? "86400", 10),
  };
};

const getRequestOrigin = (request: FastifyRequest): string | undefined => {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) {
    return undefined;
  }
  return origin;
};

const resolveAllowOrigin = (
  requestOrigin: string | undefined,
  config: CorsConfig,
): string | undefined => {
  if (!requestOrigin) {
    return undefined;
  }

  if (config.allowAllOrigins) {
    // Credentialed CORS cannot use wildcard, reflect the request origin instead.
    return config.allowCredentials ? requestOrigin : "*";
  }

  if (config.allowedOrigins.has(requestOrigin)) {
    return requestOrigin;
  }

  return undefined;
};

const applyCorsHeaders = (
  request: FastifyRequest,
  reply: FastifyReply,
  config: CorsConfig,
  isPreflight: boolean,
): { allowed: boolean } => {
  const requestOrigin = getRequestOrigin(request);
  const allowedOrigin = resolveAllowOrigin(requestOrigin, config);

  if (requestOrigin && !allowedOrigin) {
    return { allowed: false };
  }

  if (allowedOrigin) {
    reply.header("Access-Control-Allow-Origin", allowedOrigin);
    if (allowedOrigin !== "*") {
      appendVary(reply, "Origin");
    }

    if (config.allowCredentials) {
      reply.header("Access-Control-Allow-Credentials", "true");
    }
  }

  reply.header("Access-Control-Expose-Headers", config.exposeHeaders.join(", "));

  if (isPreflight) {
    const requestedHeaders = request.headers["access-control-request-headers"];
    const allowHeaders =
      typeof requestedHeaders === "string" && requestedHeaders.length > 0
        ? requestedHeaders
        : config.allowHeaders.join(", ");

    reply.header("Access-Control-Allow-Methods", config.allowMethods.join(", "));
    reply.header("Access-Control-Allow-Headers", allowHeaders);
    reply.header(
      "Access-Control-Max-Age",
      Number.isFinite(config.maxAgeSeconds) && config.maxAgeSeconds >= 0
        ? String(config.maxAgeSeconds)
        : "86400",
    );

    appendVary(reply, "Access-Control-Request-Method");
    appendVary(reply, "Access-Control-Request-Headers");
  }

  return { allowed: true };
};

/**
 * Registers permissive CORS handling for SPA + SSE consumption.
 */
export const registerCorsHook = (app: FastifyInstance): void => {
  const config = getCorsConfig();

  app.addHook("onRequest", async (request, reply) => {
    const isPreflight = request.method === "OPTIONS";
    const { allowed } = applyCorsHeaders(request, reply, config, isPreflight);

    if (isPreflight) {
      if (!allowed) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "CORS origin is not allowed",
        });
      }
      return reply.status(204).send();
    }

    if (!allowed) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "CORS origin is not allowed",
      });
    }
  });
};
