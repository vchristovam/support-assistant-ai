import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";

interface HITLInterruptValue {
  type: string;
  description: string;
  value?: unknown;
  actions?: Array<{
    id: string;
    label: string;
    type: "approve" | "reject" | "edit" | "custom";
  }>;
  schema?: object;
}

interface HITLResumeResponse {
  action: "accept" | "reject" | "edit";
  value?: {
    orderId: string;
    reason: string;
  };
}

export const apiWriteTool = tool(
  async ({ orderId, reason }): Promise<string> => {
    const interruptValue: HITLInterruptValue = {
      type: "approval",
      description: `Approve cancellation of order ${orderId}`,
      value: {
        action: "request_order_cancellation",
        orderId,
        reason,
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
    };

    const userResponse = await interrupt<
      HITLInterruptValue,
      HITLResumeResponse
    >(interruptValue);

    if (userResponse.action === "reject") {
      return "Order cancellation was rejected.";
    }

    const finalArgs =
      userResponse.action === "edit" && userResponse.value
        ? userResponse.value
        : { orderId, reason };

    return JSON.stringify({
      status: "cancelled",
      orderId: finalArgs.orderId,
      reason: finalArgs.reason,
      message: "Order cancelled successfully",
    });
  },
  {
    name: "request_order_cancellation",
    description:
      "Request cancellation of a customer order. " +
      "Requires human approval before proceeding.",
    schema: z.object({
      orderId: z.string().describe("Order ID to cancel"),
      reason: z.string().describe("Reason for cancellation"),
    }),
  },
);
