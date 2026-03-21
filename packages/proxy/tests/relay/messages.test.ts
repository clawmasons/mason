import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  parseRelayMessage,
  createRelayMessage,
  CredentialRequestSchema,
  CredentialResponseSchema,
  ApprovalRequestSchema,
  ApprovalResponseSchema,
  McpToolCallSchema,
  McpToolResultSchema,
  McpToolsRegisterSchema,
  McpToolsRegisteredSchema,
  AuditEventSchema,
} from "../../src/relay/messages.js";

// ---------------------------------------------------------------------------
// Helpers — valid message fixtures
// ---------------------------------------------------------------------------

const validId = randomUUID();

const fixtures = {
  credential_request: {
    id: validId,
    type: "credential_request" as const,
    key: "GITHUB_TOKEN",
    agentId: "agent-1",
    role: "developer",
    sessionId: "session-abc",
    declaredCredentials: ["GITHUB_TOKEN", "NPM_TOKEN"],
  },
  credential_response: {
    id: validId,
    type: "credential_response" as const,
    key: "GITHUB_TOKEN",
    value: "ghp_abc123",
    source: "env",
  },
  approval_request: {
    id: validId,
    type: "approval_request" as const,
    agent_name: "researcher",
    role_name: "developer",
    app_name: "github",
    tool_name: "github_delete_repo",
    arguments: '{"owner":"acme","repo":"test"}',
    ttl_seconds: 300,
  },
  approval_response: {
    id: validId,
    type: "approval_response" as const,
    status: "approved" as const,
  },
  mcp_tool_call: {
    id: validId,
    type: "mcp_tool_call" as const,
    app_name: "xcode-sim",
    tool_name: "run_simulator",
    arguments: { device: "iPhone 15" },
  },
  mcp_tool_result: {
    id: validId,
    type: "mcp_tool_result" as const,
    result: { content: [{ type: "text", text: "OK" }] },
  },
  mcp_tools_register: {
    id: validId,
    type: "mcp_tools_register" as const,
    app_name: "xcode-sim",
    tools: [
      {
        name: "run_simulator",
        description: "Run the iOS simulator",
        inputSchema: { type: "object", properties: { device: { type: "string" } } },
      },
    ],
  },
  mcp_tools_registered: {
    id: validId,
    type: "mcp_tools_registered" as const,
    app_name: "xcode-sim",
  },
  audit_event: {
    id: validId,
    type: "audit_event" as const,
    agent_name: "researcher",
    role_name: "developer",
    app_name: "github",
    tool_name: "github_list_repos",
    status: "success" as const,
    duration_ms: 42,
    timestamp: "2026-03-21T10:00:00.000Z",
  },
};

// ---------------------------------------------------------------------------
// parseRelayMessage — valid messages
// ---------------------------------------------------------------------------

describe("parseRelayMessage", () => {
  describe("valid messages", () => {
    for (const [type, message] of Object.entries(fixtures)) {
      it(`parses valid ${type}`, () => {
        const result = parseRelayMessage(message);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe(type);
          expect(result.data.id).toBe(validId);
        }
      });
    }
  });

  describe("invalid messages", () => {
    it("rejects unknown type", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "unknown_type",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = parseRelayMessage({});
      expect(result.success).toBe(false);
    });

    it("rejects null", () => {
      const result = parseRelayMessage(null);
      expect(result.success).toBe(false);
    });

    it("rejects undefined", () => {
      const result = parseRelayMessage(undefined);
      expect(result.success).toBe(false);
    });

    it("rejects invalid id (not UUID)", () => {
      const result = parseRelayMessage({
        ...fixtures.credential_request,
        id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields for credential_request", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "credential_request",
        // missing key, agentId, role, sessionId, declaredCredentials
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields for approval_request", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "approval_request",
        // missing agent_name, role_name, app_name, tool_name, ttl_seconds
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid status in approval_response", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "approval_response",
        status: "maybe",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid status in audit_event", () => {
      const result = parseRelayMessage({
        ...fixtures.audit_event,
        status: "unknown_status",
      });
      expect(result.success).toBe(false);
    });

    it("rejects ttl_seconds as string", () => {
      const result = parseRelayMessage({
        ...fixtures.approval_request,
        ttl_seconds: "300",
      });
      expect(result.success).toBe(false);
    });

    it("rejects declaredCredentials as string instead of array", () => {
      const result = parseRelayMessage({
        ...fixtures.credential_request,
        declaredCredentials: "GITHUB_TOKEN",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("accepts credential_response without value (error case)", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "credential_response",
        key: "GITHUB_TOKEN",
        error: "not found",
        code: "NOT_FOUND",
      });
      expect(result.success).toBe(true);
    });

    it("accepts approval_request without arguments", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "approval_request",
        agent_name: "researcher",
        role_name: "dev",
        app_name: "github",
        tool_name: "delete_repo",
        ttl_seconds: 300,
      });
      expect(result.success).toBe(true);
    });

    it("accepts mcp_tool_call without arguments", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "mcp_tool_call",
        app_name: "xcode-sim",
        tool_name: "list_devices",
      });
      expect(result.success).toBe(true);
    });

    it("accepts mcp_tool_result with error instead of result", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "mcp_tool_result",
        error: "server crashed",
      });
      expect(result.success).toBe(true);
    });

    it("accepts audit_event without optional fields", () => {
      const result = parseRelayMessage({
        id: validId,
        type: "audit_event",
        agent_name: "researcher",
        role_name: "dev",
        app_name: "github",
        tool_name: "list_repos",
        status: "success",
        timestamp: "2026-03-21T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// createRelayMessage
// ---------------------------------------------------------------------------

describe("createRelayMessage", () => {
  it("generates a valid UUIDv4 id", () => {
    const msg = createRelayMessage("credential_request", {
      key: "GITHUB_TOKEN",
      agentId: "agent-1",
      role: "developer",
      sessionId: "session-abc",
      declaredCredentials: ["GITHUB_TOKEN"],
    });
    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("sets the type correctly", () => {
    const msg = createRelayMessage("approval_response", {
      status: "denied",
    });
    expect(msg.type).toBe("approval_response");
  });

  it("includes provided fields", () => {
    const msg = createRelayMessage("mcp_tools_register", {
      app_name: "xcode-sim",
      tools: [
        {
          name: "run_sim",
          description: "Run simulator",
          inputSchema: { type: "object" },
        },
      ],
    });
    expect(msg.app_name).toBe("xcode-sim");
    expect(msg.tools).toHaveLength(1);
    expect(msg.tools[0].name).toBe("run_sim");
  });

  it("creates messages that pass parseRelayMessage", () => {
    const msg = createRelayMessage("audit_event", {
      agent_name: "researcher",
      role_name: "dev",
      app_name: "github",
      tool_name: "list_repos",
      status: "success",
      timestamp: new Date().toISOString(),
    });
    const result = parseRelayMessage(msg);
    expect(result.success).toBe(true);
  });

  it("generates unique ids for each call", () => {
    const msg1 = createRelayMessage("credential_response", {
      key: "TOKEN",
    });
    const msg2 = createRelayMessage("credential_response", {
      key: "TOKEN",
    });
    expect(msg1.id).not.toBe(msg2.id);
  });
});

// ---------------------------------------------------------------------------
// Individual schema validation
// ---------------------------------------------------------------------------

describe("individual schemas", () => {
  it("CredentialRequestSchema rejects wrong type", () => {
    const result = CredentialRequestSchema.safeParse({
      ...fixtures.credential_request,
      type: "credential_response",
    });
    expect(result.success).toBe(false);
  });

  it("CredentialResponseSchema rejects wrong type", () => {
    const result = CredentialResponseSchema.safeParse({
      ...fixtures.credential_response,
      type: "credential_request",
    });
    expect(result.success).toBe(false);
  });

  it("ApprovalRequestSchema rejects wrong type", () => {
    const result = ApprovalRequestSchema.safeParse({
      ...fixtures.approval_request,
      type: "approval_response",
    });
    expect(result.success).toBe(false);
  });

  it("ApprovalResponseSchema rejects wrong type", () => {
    const result = ApprovalResponseSchema.safeParse({
      ...fixtures.approval_response,
      type: "approval_request",
    });
    expect(result.success).toBe(false);
  });

  it("McpToolCallSchema rejects wrong type", () => {
    const result = McpToolCallSchema.safeParse({
      ...fixtures.mcp_tool_call,
      type: "mcp_tool_result",
    });
    expect(result.success).toBe(false);
  });

  it("McpToolResultSchema rejects wrong type", () => {
    const result = McpToolResultSchema.safeParse({
      ...fixtures.mcp_tool_result,
      type: "mcp_tool_call",
    });
    expect(result.success).toBe(false);
  });

  it("McpToolsRegisterSchema rejects wrong type", () => {
    const result = McpToolsRegisterSchema.safeParse({
      ...fixtures.mcp_tools_register,
      type: "mcp_tools_registered",
    });
    expect(result.success).toBe(false);
  });

  it("McpToolsRegisteredSchema rejects wrong type", () => {
    const result = McpToolsRegisteredSchema.safeParse({
      ...fixtures.mcp_tools_registered,
      type: "mcp_tools_register",
    });
    expect(result.success).toBe(false);
  });

  it("AuditEventSchema rejects wrong type", () => {
    const result = AuditEventSchema.safeParse({
      ...fixtures.audit_event,
      type: "credential_request",
    });
    expect(result.success).toBe(false);
  });

  it("AuditEventSchema validates status enum values", () => {
    for (const status of ["success", "error", "denied", "timeout", "dropped"]) {
      const result = AuditEventSchema.safeParse({
        ...fixtures.audit_event,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("McpToolsRegisterSchema validates tools array structure", () => {
    const result = McpToolsRegisterSchema.safeParse({
      id: validId,
      type: "mcp_tools_register",
      app_name: "test",
      tools: [{ name: "tool1" }], // missing inputSchema
    });
    expect(result.success).toBe(false);
  });
});
