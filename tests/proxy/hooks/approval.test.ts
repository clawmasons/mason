import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { matchesApprovalPattern, requestApproval } from "../../../src/proxy/hooks/approval.js";
import type { HookContext } from "../../../src/proxy/hooks/audit.js";
import { openDatabase, updateApprovalStatus } from "../../../src/proxy/db.js";
import type Database from "better-sqlite3";

// ── Fixtures ────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<HookContext>): HookContext {
  return {
    agentName: "note-taker",
    roleName: "writer",
    appName: "@clawforge/app-github",
    toolName: "delete_repo",
    prefixedToolName: "github_delete_repo",
    arguments: { repo: "test" },
    ...overrides,
  };
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
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates a pending approval request in the database", async () => {
    const ctx = makeContext();

    // Use very short TTL and poll interval so the test doesn't hang
    const promise = requestApproval(ctx, db, { ttlSeconds: 1, pollIntervalMs: 50 });

    // Check the request was created
    const rows = db.prepare("SELECT * FROM approval_requests WHERE status = 'pending'").all() as Array<{ id: string }>;
    expect(rows).toHaveLength(1);

    // Let it time out
    await promise;
  });

  it("stores correct context fields in the approval request", async () => {
    const ctx = makeContext();
    const promise = requestApproval(ctx, db, { ttlSeconds: 1, pollIntervalMs: 50 });

    const rows = db.prepare("SELECT * FROM approval_requests").all() as Array<{
      agent_name: string;
      role_name: string;
      app_name: string;
      tool_name: string;
      arguments: string;
      status: string;
      ttl_seconds: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].agent_name).toBe("note-taker");
    expect(rows[0].role_name).toBe("writer");
    expect(rows[0].app_name).toBe("@clawforge/app-github");
    expect(rows[0].tool_name).toBe("github_delete_repo");
    expect(JSON.parse(rows[0].arguments)).toEqual({ repo: "test" });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].ttl_seconds).toBe(1);

    await promise;
  });

  it("returns 'approved' when status is updated externally", async () => {
    const ctx = makeContext();
    const promise = requestApproval(ctx, db, { ttlSeconds: 5, pollIntervalMs: 50 });

    // Approve after a short delay
    const rows = db.prepare("SELECT id FROM approval_requests").all() as Array<{ id: string }>;
    setTimeout(() => {
      updateApprovalStatus(db, rows[0].id, "approved", "operator@example.com");
    }, 100);

    const result = await promise;
    expect(result).toBe("approved");
  });

  it("returns 'denied' when status is updated to denied externally", async () => {
    const ctx = makeContext();
    const promise = requestApproval(ctx, db, { ttlSeconds: 5, pollIntervalMs: 50 });

    const rows = db.prepare("SELECT id FROM approval_requests").all() as Array<{ id: string }>;
    setTimeout(() => {
      updateApprovalStatus(db, rows[0].id, "denied", "operator@example.com");
    }, 100);

    const result = await promise;
    expect(result).toBe("denied");
  });

  it("returns 'timeout' and auto-denies when TTL expires", async () => {
    const ctx = makeContext();
    const result = await requestApproval(ctx, db, { ttlSeconds: 0.1, pollIntervalMs: 30 });

    expect(result).toBe("timeout");

    // Verify auto-deny was written
    const rows = db.prepare("SELECT * FROM approval_requests").all() as Array<{
      status: string;
      resolved_by: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("denied");
    expect(rows[0].resolved_by).toBe("auto-timeout");
  });

  it("returns 'denied' on database creation failure", async () => {
    const ctx = makeContext();
    const closedDb = openDatabase(":memory:");
    closedDb.close();

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requestApproval(ctx, closedDb, { ttlSeconds: 1, pollIntervalMs: 50 });

    expect(result).toBe("denied");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[forge] approval request creation failed"),
    );

    stderrSpy.mockRestore();
  });

  it("returns 'denied' when database fails during polling", async () => {
    const ctx = makeContext();
    const pollDb = openDatabase(":memory:");
    const promise = requestApproval(ctx, pollDb, { ttlSeconds: 5, pollIntervalMs: 50 });

    // Close the DB after the request is created but before polling reads it
    setTimeout(() => {
      pollDb.close();
    }, 80);

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await promise;

    expect(result).toBe("denied");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("[forge] approval request poll failed"),
    );

    stderrSpy.mockRestore();
  });

  it("handles race between TTL expiry and external approval", async () => {
    const ctx = makeContext();

    // Create the request with very short TTL
    const promise = requestApproval(ctx, db, { ttlSeconds: 0.15, pollIntervalMs: 30 });

    // Approve just before TTL expires — the final check should catch it
    const rows = db.prepare("SELECT id FROM approval_requests").all() as Array<{ id: string }>;
    setTimeout(() => {
      updateApprovalStatus(db, rows[0].id, "approved", "operator@example.com");
    }, 120);

    const result = await promise;
    // Either approved (caught in final check) or timeout (race) — both are valid
    expect(["approved", "timeout"]).toContain(result);
  });
});
