import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditPreHook, auditPostHook, logDroppedServers } from "../../src/hooks/audit.js";
import type { HookContext } from "../../src/hooks/audit.js";
import { openDatabase, queryAuditLog } from "../../src/db.js";
import type Database from "better-sqlite3";

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
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("writes a success audit entry with all fields", () => {
    const ctx = makeContext();
    const pre = { id: "test-id-1", startTime: Date.now() - 50 };
    const result = { content: [{ type: "text", text: "PR #42 created" }] };

    auditPostHook(ctx, pre, result, "success", db);

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.id).toBe("test-id-1");
    expect(entry.agent_name).toBe("note-taker");
    expect(entry.role_name).toBe("writer");
    expect(entry.app_name).toBe("@clawmasons/app-github");
    expect(entry.tool_name).toBe("create_pr");
    expect(entry.arguments).toBe(JSON.stringify({ title: "Fix bug" }));
    expect(entry.result).toBe(JSON.stringify(result));
    expect(entry.status).toBe("success");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("writes an error audit entry", () => {
    const ctx = makeContext();
    const pre = { id: "test-id-2", startTime: Date.now() - 10 };

    auditPostHook(ctx, pre, "Connection refused", "error", db);

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("error");
    expect(entries[0].result).toBe(JSON.stringify("Connection refused"));
  });

  it("writes a denied audit entry", () => {
    const ctx = makeContext({
      appName: "unknown",
      toolName: "github_delete_repo",
      prefixedToolName: "github_delete_repo",
    });
    const pre = { id: "test-id-3", startTime: Date.now() };

    auditPostHook(ctx, pre, "Unknown tool: github_delete_repo", "denied", db);

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("denied");
    expect(entries[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("computes duration_ms from startTime", () => {
    const ctx = makeContext();
    const pre = { id: "test-id-4", startTime: Date.now() - 100 };

    auditPostHook(ctx, pre, null, "success", db);

    const entries = queryAuditLog(db);
    expect(entries[0].duration_ms).toBeGreaterThanOrEqual(100);
  });

  it("JSON-stringifies arguments and result", () => {
    const ctx = makeContext({ arguments: { path: "/tmp", recursive: true } });
    const pre = { id: "test-id-5", startTime: Date.now() };
    const result = { content: [{ type: "text", text: "done" }] };

    auditPostHook(ctx, pre, result, "success", db);

    const entries = queryAuditLog(db);
    expect(JSON.parse(entries[0].arguments!)).toEqual({
      path: "/tmp",
      recursive: true,
    });
    expect(JSON.parse(entries[0].result!)).toEqual(result);
  });

  it("handles undefined arguments gracefully", () => {
    const ctx = makeContext({ arguments: undefined });
    const pre = { id: "test-id-6", startTime: Date.now() };

    auditPostHook(ctx, pre, null, "success", db);

    const entries = queryAuditLog(db);
    expect(entries[0].arguments).toBeNull();
    expect(entries[0].result).toBeNull();
  });

  it("swallows database write errors without throwing", () => {
    const ctx = makeContext();
    const pre = { id: "test-id-7", startTime: Date.now() };

    // Close db to force an error
    db.close();

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw
    expect(() => {
      auditPostHook(ctx, pre, null, "success", db);
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mason] audit log write failed"),
    );

    stderrSpy.mockRestore();

    // Reopen db for afterEach cleanup
    db = openDatabase(":memory:");
  });

  // ── ACP Session Metadata ────────────────────────────────────────────

  it("writes session_type and acp_client when provided in context", () => {
    const ctx = makeContext({ sessionType: "acp", acpClient: "zed" });
    const pre = { id: "test-acp-1", startTime: Date.now() - 10 };

    auditPostHook(ctx, pre, null, "success", db);

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].session_type).toBe("acp");
    expect(entries[0].acp_client).toBe("zed");
  });

  it("writes null session_type and acp_client when not provided (backward compat)", () => {
    const ctx = makeContext();
    const pre = { id: "test-acp-2", startTime: Date.now() };

    auditPostHook(ctx, pre, null, "success", db);

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].session_type).toBeNull();
    expect(entries[0].acp_client).toBeNull();
  });

  it("writes session_type without acp_client", () => {
    const ctx = makeContext({ sessionType: "acp" });
    const pre = { id: "test-acp-3", startTime: Date.now() };

    auditPostHook(ctx, pre, null, "success", db);

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].session_type).toBe("acp");
    expect(entries[0].acp_client).toBeNull();
  });
});

// ── logDroppedServers ──────────────────────────────────────────────────

describe("logDroppedServers", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("logs each dropped server as an audit entry with status 'dropped'", () => {
    const unmatched = [
      { name: "personal-notes", reason: "No matching App found for server name" },
      { name: "my-custom-tool", reason: "No matching App found for server name" },
    ];

    logDroppedServers(db, unmatched, "note-taker", "writer", "zed");

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(2);

    // Entries are in DESC order by timestamp; both have same timestamp so order may vary
    const names = entries.map((e) => e.app_name).sort();
    expect(names).toEqual(["my-custom-tool", "personal-notes"]);

    for (const entry of entries) {
      expect(entry.status).toBe("dropped");
      expect(entry.session_type).toBe("acp");
      expect(entry.acp_client).toBe("zed");
      expect(entry.agent_name).toBe("note-taker");
      expect(entry.role_name).toBe("writer");
      expect(entry.duration_ms).toBe(0);
      expect(entry.tool_name).toBe(entry.app_name);
    }
  });

  it("includes the drop reason in the result field", () => {
    const unmatched = [
      { name: "personal-notes", reason: "No matching App found for server name" },
    ];

    logDroppedServers(db, unmatched, "note-taker", "writer");

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].result!)).toBe("No matching App found for server name");
  });

  it("handles empty unmatched list (no-op)", () => {
    logDroppedServers(db, [], "note-taker", "writer");

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(0);
  });

  it("writes acp_client as null when not provided", () => {
    const unmatched = [
      { name: "personal-notes", reason: "No match" },
    ];

    logDroppedServers(db, unmatched, "note-taker", "writer");

    const entries = queryAuditLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].acp_client).toBeNull();
    expect(entries[0].session_type).toBe("acp");
  });

  it("can be filtered by session_type", () => {
    // Log a dropped server (acp session)
    logDroppedServers(db, [{ name: "notes", reason: "no match" }], "agent", "role");

    // Log a regular tool call (no session type)
    const ctx = makeContext();
    const pre = { id: "regular-1", startTime: Date.now() };
    auditPostHook(ctx, pre, null, "success", db);

    const acpEntries = queryAuditLog(db, { session_type: "acp" });
    expect(acpEntries).toHaveLength(1);
    expect(acpEntries[0].status).toBe("dropped");

    const allEntries = queryAuditLog(db);
    expect(allEntries).toHaveLength(2);
  });

  it("swallows database errors without throwing", () => {
    db.close();

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      logDroppedServers(
        db,
        [{ name: "notes", reason: "no match" }],
        "agent",
        "role",
      );
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mason] audit log write failed"),
    );

    stderrSpy.mockRestore();

    // Reopen for afterEach cleanup
    db = openDatabase(":memory:");
  });
});
