import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditPreHook, auditPostHook } from "../../../src/proxy/hooks/audit.js";
import type { HookContext } from "../../../src/proxy/hooks/audit.js";
import { openDatabase, queryAuditLog } from "../../../src/proxy/db.js";
import type Database from "better-sqlite3";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<HookContext>): HookContext {
  return {
    agentName: "note-taker",
    roleName: "writer",
    appName: "@clawforge/app-github",
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
    expect(entry.app_name).toBe("@clawforge/app-github");
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
      expect.stringContaining("[forge] audit log write failed"),
    );

    stderrSpy.mockRestore();

    // Reopen db for afterEach cleanup
    db = openDatabase(":memory:");
  });
});
