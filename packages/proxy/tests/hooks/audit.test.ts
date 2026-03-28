import { describe, it, expect, vi } from "vitest";
import { auditPreHook, auditPostHook, logDroppedServers, setLocalAuditPath } from "../../src/hooks/audit.js";
import type { HookContext } from "../../src/hooks/audit.js";
import type { RelayServer } from "../../src/relay/server.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<HookContext>): HookContext {
  return {
    agentName: "note-taker",
    roleName: "writer",
    appName: "@clawmasons/app-github",
    toolName: "create_pr",
    prefixedToolName: "github_create_pr",
    arguments: { title: "Fix bug" },
    ...overrides,
  };
}

function createMockRelay(connected = true): RelayServer {
  return {
    send: vi.fn(),
    request: vi.fn(),
    isConnected: vi.fn(() => connected),
    handleUpgrade: vi.fn(),
    registerHandler: vi.fn(),
    shutdown: vi.fn(),
  } as unknown as RelayServer;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("auditPreHook", () => {
  it("returns a UUID id and startTime", () => {
    const ctx = makeContext();
    const result = auditPreHook(ctx);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(typeof result.startTime).toBe("number");
    expect(result.startTime).toBeGreaterThan(0);
  });

  it("generates unique ids on successive calls", () => {
    const ctx = makeContext();
    const a = auditPreHook(ctx);
    const b = auditPreHook(ctx);
    expect(a.id).not.toBe(b.id);
  });
});

describe("auditPostHook", () => {
  it("sends an audit_event message via relay", () => {
    const relay = createMockRelay();
    const ctx = makeContext();
    const pre = { id: "test-id-1", startTime: Date.now() - 50 };
    const result = { content: [{ type: "text", text: "PR #42 created" }] };

    auditPostHook(ctx, pre, result, "success", relay);

    expect(relay.send).toHaveBeenCalledTimes(1);
    const msg = vi.mocked(relay.send).mock.calls[0][0];
    expect(msg.type).toBe("audit_event");
    if (msg.type === "audit_event") {
      expect(msg.agent_name).toBe("note-taker");
      expect(msg.role_name).toBe("writer");
      expect(msg.app_name).toBe("@clawmasons/app-github");
      expect(msg.tool_name).toBe("create_pr");
      expect(msg.arguments).toBe(JSON.stringify({ title: "Fix bug" }));
      expect(msg.result).toBe(JSON.stringify(result));
      expect(msg.status).toBe("success");
      expect(msg.duration_ms).toBeGreaterThanOrEqual(0);
      expect(msg.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("sends an error audit event", () => {
    const relay = createMockRelay();
    const ctx = makeContext();
    const pre = { id: "test-id-2", startTime: Date.now() - 10 };

    auditPostHook(ctx, pre, "Connection refused", "error", relay);

    const msg = vi.mocked(relay.send).mock.calls[0][0];
    expect(msg.type).toBe("audit_event");
    if (msg.type === "audit_event") {
      expect(msg.status).toBe("error");
      expect(msg.result).toBe(JSON.stringify("Connection refused"));
    }
  });

  it("sends a denied audit event", () => {
    const relay = createMockRelay();
    const ctx = makeContext({
      appName: "unknown",
      toolName: "github_delete_repo",
      prefixedToolName: "github_delete_repo",
    });
    const pre = { id: "test-id-3", startTime: Date.now() };

    auditPostHook(ctx, pre, "Unknown tool: github_delete_repo", "denied", relay);

    const msg = vi.mocked(relay.send).mock.calls[0][0];
    expect(msg.type).toBe("audit_event");
    if (msg.type === "audit_event") {
      expect(msg.status).toBe("denied");
    }
  });

  it("computes duration_ms from startTime", () => {
    const relay = createMockRelay();
    const ctx = makeContext();
    const pre = { id: "test-id-4", startTime: Date.now() - 100 };

    auditPostHook(ctx, pre, null, "success", relay);

    const msg = vi.mocked(relay.send).mock.calls[0][0];
    if (msg.type === "audit_event") {
      expect(msg.duration_ms).toBeGreaterThanOrEqual(100);
    }
  });

  it("handles undefined arguments gracefully", () => {
    const relay = createMockRelay();
    const ctx = makeContext({ arguments: undefined });
    const pre = { id: "test-id-6", startTime: Date.now() };

    auditPostHook(ctx, pre, null, "success", relay);

    const msg = vi.mocked(relay.send).mock.calls[0][0];
    if (msg.type === "audit_event") {
      expect(msg.arguments).toBeUndefined();
      expect(msg.result).toBeUndefined();
    }
  });

  it("swallows relay send errors without throwing", () => {
    const relay = createMockRelay();
    vi.mocked(relay.send).mockImplementation(() => {
      throw new Error("Relay not connected");
    });

    const ctx = makeContext();
    const pre = { id: "test-id-7", startTime: Date.now() };

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      auditPostHook(ctx, pre, null, "success", relay);
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mason] audit log write failed"),
    );

    stderrSpy.mockRestore();
  });

  it("does nothing when relay is null (no local path)", () => {
    const ctx = makeContext();
    const pre = { id: "test-id-8", startTime: Date.now() };

    // Should not throw
    expect(() => {
      auditPostHook(ctx, pre, null, "success", null);
    }).not.toThrow();
  });

  it("writes audit event to local file when setLocalAuditPath is configured", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    const auditFile = path.join(tmpDir, "audit.log");
    setLocalAuditPath(auditFile);

    const ctx = makeContext();
    const pre = { id: "test-id-local-1", startTime: Date.now() - 10 };

    auditPostHook(ctx, pre, { content: [{ type: "text", text: "ok" }] }, "success", null);

    const content = fs.readFileSync(auditFile, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.type).toBe("audit_event");
    expect(parsed.tool_name).toBe("create_pr");
    expect(parsed.status).toBe("success");

    // Cleanup
    setLocalAuditPath(undefined as unknown as string);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("writes to local file AND sends via relay when both available", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    const auditFile = path.join(tmpDir, "audit.log");
    setLocalAuditPath(auditFile);

    const relay = createMockRelay();
    const ctx = makeContext();
    const pre = { id: "test-id-local-2", startTime: Date.now() };

    auditPostHook(ctx, pre, null, "success", relay);

    // Both local file and relay should have the event
    expect(fs.existsSync(auditFile)).toBe(true);
    expect(relay.send).toHaveBeenCalledTimes(1);

    // Cleanup
    setLocalAuditPath(undefined as unknown as string);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── logDroppedServers ──────────────────────────────────────────────────

describe("logDroppedServers", () => {
  it("logs each dropped server as an audit_event with status 'dropped'", () => {
    const relay = createMockRelay();
    const unmatched = [
      { name: "personal-notes", reason: "No matching App found for server name" },
      { name: "my-custom-tool", reason: "No matching App found for server name" },
    ];

    logDroppedServers(relay, unmatched, "note-taker", "writer", "zed");

    expect(relay.send).toHaveBeenCalledTimes(2);

    const messages = vi.mocked(relay.send).mock.calls.map((c) => c[0]);
    for (const msg of messages) {
      expect(msg.type).toBe("audit_event");
      if (msg.type === "audit_event") {
        expect(msg.status).toBe("dropped");
        expect(msg.agent_name).toBe("note-taker");
        expect(msg.role_name).toBe("writer");
        expect(msg.duration_ms).toBe(0);
      }
    }

    const names = messages.map((m) => m.type === "audit_event" ? m.app_name : "").sort();
    expect(names).toEqual(["my-custom-tool", "personal-notes"]);
  });

  it("includes the drop reason in the result field", () => {
    const relay = createMockRelay();
    const unmatched = [
      { name: "personal-notes", reason: "No matching App found for server name" },
    ];

    logDroppedServers(relay, unmatched, "note-taker", "writer");

    const msg = vi.mocked(relay.send).mock.calls[0][0];
    if (msg.type === "audit_event") {
      expect(JSON.parse(msg.result!)).toBe("No matching App found for server name");
    }
  });

  it("handles empty unmatched list (no-op)", () => {
    const relay = createMockRelay();
    logDroppedServers(relay, [], "note-taker", "writer");

    expect(relay.send).not.toHaveBeenCalled();
  });

  it("does nothing when relay is null and no local path", () => {
    // Should not throw
    expect(() => {
      logDroppedServers(null, [{ name: "notes", reason: "no match" }], "agent", "role");
    }).not.toThrow();
  });

  it("writes dropped servers to local file when configured", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    const auditFile = path.join(tmpDir, "audit.log");
    setLocalAuditPath(auditFile);

    logDroppedServers(null, [
      { name: "notes", reason: "no match" },
      { name: "calendar", reason: "no match" },
    ], "agent", "role");

    const lines = fs.readFileSync(auditFile, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).app_name).toBe("notes");
    expect(JSON.parse(lines[1]).app_name).toBe("calendar");

    // Cleanup
    setLocalAuditPath(undefined as unknown as string);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("swallows relay errors without throwing", () => {
    const relay = createMockRelay();
    vi.mocked(relay.send).mockImplementation(() => {
      throw new Error("Relay not connected");
    });

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      logDroppedServers(
        relay,
        [{ name: "notes", reason: "no match" }],
        "agent",
        "role",
      );
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mason] audit log write failed"),
    );

    stderrSpy.mockRestore();
  });
});
