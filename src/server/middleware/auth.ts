import type { FastifyInstance } from "fastify";

export const registerAuthHook = (app: FastifyInstance) => {
  app.addHook("preHandler", async (request, _reply) => {
    // Skip auth for health check
    if (request.url === "/health") {
      return;
    }

    // Extract user_id from JWT token or custom header
    const authHeader = request.headers.authorization;
    const userIdHeader = request.headers["x-user-id"] as string | undefined;

    if (userIdHeader) {
      // Use provided user ID from header (for testing or internal use)
      (request as unknown as Record<string, unknown>).user = {
        user_id: userIdHeader,
      };
      return;
    }

    if (authHeader?.startsWith("Bearer ")) {
      // In a real implementation, verify JWT here
      // For now, extract a mock user_id from the token for development
      const token = authHeader.substring(7);
      try {
        // Simple mock: use token as user_id if it looks like a UUID
        // In production, use a proper JWT library like jsonwebtoken
        if (token.length > 10) {
          (request as unknown as Record<string, unknown>).user = {
            user_id: `user-${token.substring(0, 8)}`,
          };
          return;
        }
      } catch {
        // Invalid token, fall through to default
      }
    }

    // Default: assign anonymous user for backward compatibility
    // In production, you may want to reject the request instead
    (request as unknown as Record<string, unknown>).user = {
      user_id: "anonymous",
    };
  });
};
