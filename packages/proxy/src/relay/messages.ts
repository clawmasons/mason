import { z } from "zod";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Docker → Host messages
// ---------------------------------------------------------------------------

export const CredentialRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("credential_request"),
  key: z.string(),
  agentId: z.string(),
  role: z.string(),
  sessionId: z.string(),
  declaredCredentials: z.array(z.string()),
});

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("approval_request"),
  agent_name: z.string(),
  role_name: z.string(),
  app_name: z.string(),
  tool_name: z.string(),
  arguments: z.string().optional(),
  ttl_seconds: z.number(),
});

export const McpToolCallSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("mcp_tool_call"),
  app_name: z.string(),
  tool_name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("audit_event"),
  agent_name: z.string(),
  role_name: z.string(),
  app_name: z.string(),
  tool_name: z.string(),
  arguments: z.string().optional(),
  result: z.string().optional(),
  status: z.enum(["success", "error", "denied", "timeout", "dropped"]),
  duration_ms: z.number().optional(),
  timestamp: z.string(),
});

// ---------------------------------------------------------------------------
// Host → Docker messages
// ---------------------------------------------------------------------------

export const CredentialResponseSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("credential_response"),
  key: z.string(),
  value: z.string().optional(),
  source: z.string().optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});

export const ApprovalResponseSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("approval_response"),
  status: z.enum(["approved", "denied"]),
});

export const McpToolResultSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("mcp_tool_result"),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

export const McpToolsRegisterSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("mcp_tools_register"),
  app_name: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.record(z.unknown()),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Docker → Host (acknowledgment)
// ---------------------------------------------------------------------------

export const McpToolsRegisteredSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("mcp_tools_registered"),
  app_name: z.string(),
});

// ---------------------------------------------------------------------------
// Discriminated union of all relay message types
// ---------------------------------------------------------------------------

export const RelayMessageSchema = z.discriminatedUnion("type", [
  CredentialRequestSchema,
  CredentialResponseSchema,
  ApprovalRequestSchema,
  ApprovalResponseSchema,
  McpToolCallSchema,
  McpToolResultSchema,
  McpToolsRegisterSchema,
  McpToolsRegisteredSchema,
  AuditEventSchema,
]);

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type CredentialRequestMessage = z.infer<typeof CredentialRequestSchema>;
export type CredentialResponseMessage = z.infer<typeof CredentialResponseSchema>;
export type ApprovalRequestMessage = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalResponseMessage = z.infer<typeof ApprovalResponseSchema>;
export type McpToolCallMessage = z.infer<typeof McpToolCallSchema>;
export type McpToolResultMessage = z.infer<typeof McpToolResultSchema>;
export type McpToolsRegisterMessage = z.infer<typeof McpToolsRegisterSchema>;
export type McpToolsRegisteredMessage = z.infer<typeof McpToolsRegisteredSchema>;
export type AuditEventMessage = z.infer<typeof AuditEventSchema>;
export type RelayMessage = z.infer<typeof RelayMessageSchema>;

// ---------------------------------------------------------------------------
// Relay message type string literals
// ---------------------------------------------------------------------------

export const RELAY_MESSAGE_TYPES = [
  "credential_request",
  "credential_response",
  "approval_request",
  "approval_response",
  "mcp_tool_call",
  "mcp_tool_result",
  "mcp_tools_register",
  "mcp_tools_registered",
  "audit_event",
] as const;

export type RelayMessageType = (typeof RELAY_MESSAGE_TYPES)[number];

// ---------------------------------------------------------------------------
// Parse result type
// ---------------------------------------------------------------------------

export type ParseRelayMessageResult =
  | { success: true; data: RelayMessage }
  | { success: false; error: z.ZodError };

// ---------------------------------------------------------------------------
// parseRelayMessage — validate and type-narrow incoming JSON
// ---------------------------------------------------------------------------

export function parseRelayMessage(data: unknown): ParseRelayMessageResult {
  const result = RelayMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ---------------------------------------------------------------------------
// createRelayMessage — construct a message with a generated UUIDv4 id
// ---------------------------------------------------------------------------

type MessageFieldsFor<T extends RelayMessageType> = Omit<
  Extract<RelayMessage, { type: T }>,
  "id"
>;

export function createRelayMessage<T extends RelayMessageType>(
  type: T,
  fields: Omit<MessageFieldsFor<T>, "type">,
): Extract<RelayMessage, { type: T }> {
  return {
    id: randomUUID(),
    type,
    ...fields,
  } as Extract<RelayMessage, { type: T }>;
}
