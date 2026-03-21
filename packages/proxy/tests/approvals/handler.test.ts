import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApprovalHandler } from "../../src/approvals/handler.js";
import type { RelayClient } from "../../src/relay/client.js";
import type { RelayMessage, ApprovalRequestMessage } from "../../src/relay/messages.js";

// ── Mock the dialog module ──────────────────────────────────────────

vi.mock("../../src/approvals/dialog.js", () => ({
  showApprovalDialog: vi.fn(),
}));

import { showApprovalDialog } from "../../src/approvals/dialog.js";

const mockDialog = vi.mocked(showApprovalDialog);

// ── Mock relay client factory ────────────────────────────────────────

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

function makeApprovalRequest(overrides?: Partial<ApprovalRequestMessage>): ApprovalRequestMessage {
  return {
    id: "req-001",
    type: "approval_request",
    agent_name: "researcher",
    role_name: "dev",
    app_name: "@acme/app-github",
    tool_name: "github_delete_repo",
    arguments: '{"owner":"acme","repo":"test"}',
    ttl_seconds: 300,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("ApprovalHandler", () => {
  let mockClient: ReturnType<typeof createMockRelayClient>;
  let handler: ApprovalHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = createMockRelayClient();
    handler = new ApprovalHandler(mockClient as unknown as RelayClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers an approval_request handler on the relay client", () => {
    handler.register();
    expect(mockClient.registerHandler).toHaveBeenCalledWith(
      "approval_request",
      expect.any(Function),
    );
  });

  it("sends approved response when dialog approves", async () => {
    mockDialog.mockResolvedValue(true);
    handler.register();

    const msg = makeApprovalRequest();
    mockClient._trigger("approval_request", msg);

    // Wait for async handler
    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    expect(mockDialog).toHaveBeenCalledWith(
      "github_delete_repo",
      '{"owner":"acme","repo":"test"}',
      "researcher",
    );

    const sent = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.id).toBe("req-001");
    expect(sent.type).toBe("approval_response");
    expect(sent.status).toBe("approved");
  });

  it("sends denied response when dialog denies", async () => {
    mockDialog.mockResolvedValue(false);
    handler.register();

    const msg = makeApprovalRequest();
    mockClient._trigger("approval_request", msg);

    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    const sent = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.id).toBe("req-001");
    expect(sent.type).toBe("approval_response");
    expect(sent.status).toBe("denied");
  });

  it("sends denied response when dialog throws", async () => {
    mockDialog.mockRejectedValue(new Error("osascript failed"));
    handler.register();

    const msg = makeApprovalRequest();
    mockClient._trigger("approval_request", msg);

    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    const sent = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.status).toBe("denied");
  });

  it("auto-denies on TTL timeout before dialog responds", async () => {
    // Dialog that never resolves
    mockDialog.mockReturnValue(new Promise(() => {}));
    handler.register();

    const msg = makeApprovalRequest({ ttl_seconds: 10 });
    mockClient._trigger("approval_request", msg);

    // Advance past TTL
    vi.advanceTimersByTime(10_000);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const sent = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.id).toBe("req-001");
    expect(sent.type).toBe("approval_response");
    expect(sent.status).toBe("denied");
  });

  it("does not send duplicate response after TTL if dialog resolves late", async () => {
    let resolveDialog!: (value: boolean) => void;
    mockDialog.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveDialog = resolve;
      }),
    );
    handler.register();

    const msg = makeApprovalRequest({ ttl_seconds: 5 });
    mockClient._trigger("approval_request", msg);

    // TTL fires first
    vi.advanceTimersByTime(5_000);
    expect(mockClient.send).toHaveBeenCalledTimes(1);

    // Dialog resolves late
    resolveDialog(true);
    await vi.advanceTimersByTimeAsync(0);

    // Should still only have one response sent
    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const sent = mockClient.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.status).toBe("denied");
  });

  it("passes undefined arguments when not present in the request", async () => {
    mockDialog.mockResolvedValue(true);
    handler.register();

    const msg = makeApprovalRequest({ arguments: undefined });
    mockClient._trigger("approval_request", msg);

    await vi.waitFor(() => {
      expect(mockClient.send).toHaveBeenCalled();
    });

    expect(mockDialog).toHaveBeenCalledWith(
      "github_delete_repo",
      undefined,
      "researcher",
    );
  });
});
