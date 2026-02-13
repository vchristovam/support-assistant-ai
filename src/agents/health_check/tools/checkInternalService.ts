import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const checkInternalService = tool(
  async ({ service }) => {
    // Mock implementation - in production would actually check services
    const services: Record<string, object> = {
      "B3 calculator": {
        status: "healthy",
        responseTime: "120ms",
        uptime: "99.9%",
        lastError: null,
        recommendations: [],
      },
      order_processing: {
        status: "degraded",
        responseTime: "850ms",
        uptime: "98.5%",
        lastError: "Timeout on order #12345",
        recommendations: ["Check database connection pool"],
      },
      user_service: {
        status: "healthy",
        responseTime: "45ms",
        uptime: "99.95%",
        lastError: null,
        recommendations: [],
      },
      payment_gateway: {
        status: "healthy",
        responseTime: "180ms",
        uptime: "99.8%",
        lastError: null,
        recommendations: [],
      },
      notification_service: {
        status: "healthy",
        responseTime: "65ms",
        uptime: "99.9%",
        lastError: null,
        recommendations: [],
      },
    };

    return JSON.stringify(
      services[service] || {
        status: "unknown",
        error: `Service '${service}' not found in registry`,
        availableServices: Object.keys(services),
      },
    );
  },
  {
    name: "check_internal_service",
    description:
      "Check the health of internal services like B3 calculator, order processing, user service, etc.",
    schema: z.object({
      service: z
        .string()
        .describe(
          "The name of the internal service to check (e.g., 'B3 calculator', 'order_processing', 'user_service')",
        ),
    }),
  },
);
