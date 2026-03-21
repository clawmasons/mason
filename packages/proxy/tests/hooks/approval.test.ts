import { describe, it, expect, vi } from "vitest";
import { matchesApprovalPattern, requestApproval } from "../../src/hooks/approval.js";
import type { HookContext } from "../../src/hooks/audit.js";
import type { RelayServer } from "../../src/relay/server.js";
import type { RelayMessage } from "../../src/relay/messages.js";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<HookContext>): HookContext {
  return {
    agentName: "note-taker",
    roleName: "writer",
    appName: "@clawmasons/app-github",
    toolName: "delete_repo",
    prefixedToolName: "github_delete_repo",
    arguments: { repo: "test" },
    ...overrides,
  };
}

function createMockRelay(
  requestResponse?: Partial<RelayMessage>,
  requestError?: Error,
): RelayServer {
  return {
    send: vi.fn(),
    request: vi.fn().mockImplementation(async () => {
      if (requestError) throw requestError;
      return {
        id: "test-id",
        type: "approval_response",
        status: "approved",
        ...requestResponse,
      };
    }),
    isConnected: vi.fn(() => true),
    handleUpgrade: vi.fn(),
    registerHandler: vi.fn(),
    shutdown: vi.fn(),
  } as unknown as RelayServer;
}

// ── matchesApprovalPattern Tests ────────────────────────────────────────

describe("matchesApprovalPattern", () => {
  it("matches exact tool name", () => {
    expect(matchesApprovalPattern("github_delete_repo", ["github_delete_repo"])).toBe(true);
  });

  it("matches wildcard suffix pattern", () => {
    expect(matchesApprovalPattern("github_delete_repo", ["github_delete_*"])).toBe(true);
  });

  it("matches wildcard prefix pattern", () => {
    expect(matchesApprovalPattern("slack_send_message", ["*_send_message"])).toBe(true);
  });

  it("matches wildcard middle pattern", () => {
    expect(matchesApprovalPattern("slack_send_message", ["*_send_*"])).toBe(true);
  });

  it("returns false for non-matching pattern", () => {
    expect(matchesApprovalPattern("github_list_repos", ["github_delete_*"])).toBe(false);
  });

  it("returns false for empty patterns array", () => {
    expect(matchesApprovalPattern("github_delete_repo", [])).toBe(false);
  });

  it("matches when one of multiple patterns matches", () => {
    expect(
      matchesApprovalPattern("github_delete_repo", ["slack_*", "github_delete_*"]),
    ).toBe(true);
  });

  it("returns false when no pattern in array matches", () => {
    expect(
      matchesApprovalPattern("github_list_repos", ["slack_*", "github_delete_*"]),
    ).toBe(false);
  });

  it("matches catch-all wildcard", () => {
    expect(matchesApprovalPattern("anything_at_all", ["*"])).toBe(true);
  });

  it("escapes regex special characters in patterns", () => {
    expect(matchesApprovalPattern("github.delete.repo", ["github.delete.*"])).toBe(true);
    expect(matchesApprovalPattern("githubXdeleteXrepo", ["github.delete.*"])).toBe(false);
  });
});

// ── requestApproval Tests ───────────────────────────────────────────────

describe("requestApproval", () => {
  it("sends an approval_request message via relay", async () => {
    const relay = createMockRelay({ status: "approved" });
    const ctx = makeContext();

    await requestApproval(ctx, relay, { ttlSeconds: 5 });

    expect(relay.request).toHaveBeenCalledTimes(1);
    const [msg, timeout] = vi.mocked(relay.request).mock.calls[0];
    expect(msg.type).toBe("approval_request");
    expect(timeout).toBe(5000); // 5 seconds in ms
    if (msg.type === "approval_request") {
      expect(msg.agent_name).toBe("note-taker");
      expect(msg.role_name).toBe("writer");
      expect(msg.app_name).toBe("@clawmasons/app-github");
      expect(msg.tool_name).toBe("github_delete_repo");
      expect(msg.ttl_seconds).toBe(5);
    }
  });

  it("returns 'approved' when relay response has status approved", async () => {
    const relay = createMockRelay({ status: "approved" });
    const ctx = makeContext();

    const result = await requestApproval(ctx, relay, { ttlSeconds: 5 });
    expect(result).toBe("approved");
  });

  it("returns 'denied' when relay response has status denied", async () => {
    const relay = createMockRelay({ status: "denied" });
    const ctx = makeContext();

    const result = await requestApproval(ctx, relay, { ttlSeconds: 5 });
    expect(result).toBe("denied");
  });

  it("returns 'timeout' when relay request times out", async () => {
    const relay = createMockRelay(
      undefined,
      new Error("Relay request timed out after 5000ms"),
    );
    const ctx = makeContext();

    const result = await requestApproval(ctx, relay, { ttlSeconds: 5 });
    expect(result).toBe("timeout");
  });

  it("returns 'denied' on relay error (non-timeout)", async () => {
    const relay = createMockRelay(
      undefined,
      new Error("Relay not connected"),
    );
    const ctx = makeContext();

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requestApproval(ctx, relay, { ttlSeconds: 5 });
    expect(result).toBe("denied");

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mason] approval request failed"),
    );

    stderrSpy.mockRestore();
  });

  it("uses default TTL of 300 seconds when not specified", async () => {
    const relay = createMockRelay({ status: "approved" });
    const ctx = makeContext();

    await requestApproval(ctx, relay);

    const [msg, timeout] = vi.mocked(relay.request).mock.calls[0];
    expect(timeout).toBe(300_000);
    if (msg.type === "approval_request") {
      expect(msg.ttl_seconds).toBe(300);
    }
  });
});
