import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredentialRelayHandler } from "../../src/credentials/relay-handler.js";
import type { RelayClient } from "../../src/relay/client.js";
import type { CredentialService } from "../../src/credentials/service.js";
import type { RelayMessage, CredentialRequestMessage } from "../../src/relay/messages.js";

// ── Mock factories ──────────────────────────────────────────────────

function createMockRelayClient() {
  const handlers = new Map<string, (msg: RelayMessage) => void>();
  return {
    registerHandler: vi.fn((type: string, handler: (msg: RelayMessage) => void) => {
      handlers.set(type, handler);
    }),
    send: vi.fn(),
    _handlers: handlers,
    _trigger(type: string, msg: RelayMessage) {
      const handler = handlers.get(type);
      if (handler) handler(msg);
    },
  };
}

function createMockCredentialService(response?: Record<string, unknown>) {
  return {
    handleRequest: vi.fn(async () => response ?? {
      id: "test-id",
      key: "API_KEY",
      value: "resolved-value",
      source: "env",
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("CredentialRelayHandler", () => {
  let mockClient: ReturnType<typeof createMockRelayClient>;
  let mockService: ReturnType<typeof createMockCredentialService>;
  let handler: CredentialRelayHandler;

  beforeEach(() => {
    mockClient = createMockRelayClient();
    mockService = createMockCredentialService();
    handler = new CredentialRelayHandler(
      mockClient as unknown as RelayClient,
      mockService as unknown as CredentialService,
    );
  });

  it("registers a credential_request handler on the relay client", () => {
    handler.register();
    expect(mockClient.registerHandler).toHaveBeenCalledWith(
      "credential_request",
      expect.any(Function),
    );
  });

  it("resolves credential and sends credential_response with same id", async () => {
    const requestMsg: CredentialRequestMessage = {
      id: "req-123",
      type: "credential_request",
      key: "OPENAI_API_KEY",
      agentId: "test-agent",
      role: "test-role",
      sessionId: "session-1",
      declaredCredentials: ["OPENAI_API_KEY"],
    };

    mockService = createMockCredentialService({
      id: "req-123",
      key: "OPENAI_API_KEY",
      value: "sk-abc123",
      source: "env",
    });
    handler = new CredentialRelayHandler(
      mockClient as unknown as RelayClient,
      mockService as unknown as CredentialService,
    );
    handler.register();

    // Trigger the handler
    mockClient._trigger("credential_request", requestMsg);

    // Wait for async handler to complete
    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    // Verify CredentialService was called with correct params
    expect(mockService.handleRequest).toHaveBeenCalledWith({
      id: "req-123",
      key: "OPENAI_API_KEY",
      agentId: "test-agent",
      role: "test-role",
      sessionId: "session-1",
      declaredCredentials: ["OPENAI_API_KEY"],
    });

    // Verify response sent back with same id
    const sentMsg = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sentMsg.id).toBe("req-123");
    expect(sentMsg.type).toBe("credential_response");
    expect(sentMsg.key).toBe("OPENAI_API_KEY");
    expect(sentMsg.value).toBe("sk-abc123");
    expect(sentMsg.source).toBe("env");
  });

  it("sends error response when credential is access denied", async () => {
    const requestMsg: CredentialRequestMessage = {
      id: "req-456",
      type: "credential_request",
      key: "SECRET_KEY",
      agentId: "test-agent",
      role: "test-role",
      sessionId: "session-1",
      declaredCredentials: [],
    };

    mockService = createMockCredentialService({
      id: "req-456",
      key: "SECRET_KEY",
      error: 'Agent "test-agent" has not declared credential "SECRET_KEY"',
      code: "ACCESS_DENIED",
    });
    handler = new CredentialRelayHandler(
      mockClient as unknown as RelayClient,
      mockService as unknown as CredentialService,
    );
    handler.register();

    mockClient._trigger("credential_request", requestMsg);

    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    const sentMsg = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sentMsg.id).toBe("req-456");
    expect(sentMsg.type).toBe("credential_response");
    expect(sentMsg.key).toBe("SECRET_KEY");
    expect(sentMsg.error).toBe('Agent "test-agent" has not declared credential "SECRET_KEY"');
    expect(sentMsg.value).toBeUndefined();
  });

  it("sends error response when credential is not found", async () => {
    const requestMsg: CredentialRequestMessage = {
      id: "req-789",
      type: "credential_request",
      key: "MISSING_KEY",
      agentId: "test-agent",
      role: "test-role",
      sessionId: "session-1",
      declaredCredentials: ["MISSING_KEY"],
    };

    mockService = createMockCredentialService({
      id: "req-789",
      key: "MISSING_KEY",
      error: "Credential not found",
      code: "NOT_FOUND",
    });
    handler = new CredentialRelayHandler(
      mockClient as unknown as RelayClient,
      mockService as unknown as CredentialService,
    );
    handler.register();

    mockClient._trigger("credential_request", requestMsg);

    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    const sentMsg = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sentMsg.id).toBe("req-789");
    expect(sentMsg.type).toBe("credential_response");
    expect(sentMsg.error).toBe("Credential not found");
  });

  it("sends error response when service throws", async () => {
    const requestMsg: CredentialRequestMessage = {
      id: "req-err",
      type: "credential_request",
      key: "BROKEN_KEY",
      agentId: "test-agent",
      role: "test-role",
      sessionId: "session-1",
      declaredCredentials: ["BROKEN_KEY"],
    };

    const throwingService = {
      handleRequest: vi.fn(async () => {
        throw new Error("Database connection failed");
      }),
    };
    handler = new CredentialRelayHandler(
      mockClient as unknown as RelayClient,
      throwingService as unknown as CredentialService,
    );
    handler.register();

    mockClient._trigger("credential_request", requestMsg);

    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    const sentMsg = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sentMsg.id).toBe("req-err");
    expect(sentMsg.type).toBe("credential_response");
    expect(sentMsg.key).toBe("BROKEN_KEY");
    expect(sentMsg.error).toBe("Database connection failed");
  });
});
