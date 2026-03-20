import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  openDatabase,
  insertAuditLog,
  queryAuditLog,
  createApprovalRequest,
  getApprovalRequest,
  updateApprovalStatus,
  type AuditLogEntry,
  type ApprovalRequest,
} from "../src/db.js";

describe("proxy/db", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // ── openDatabase ───────────────────────────────────────────────────

  describe("openDatabase", () => {
    it("creates both tables", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("audit_log");
      expect(names).toContain("approval_requests");
    });

    it("creates the database in a subdirectory when given a path", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "mason-db-subdir-"));
      const subPath = join(tmpDir, "data", "mason.db");
      const subDb = openDatabase(subPath);
      try {
        expect(existsSync(subPath)).toBe(true);
      } finally {
        subDb.close();
        rmSync(tmpDir, { recursive: true });
      }
    });

    it("enables WAL mode", () => {
      // In-memory databases can't use WAL; test with a temp file
      const tmpDir = mkdtempSync(join(tmpdir(), "mason-db-test-"));
      const filePath = join(tmpDir, "test.db");
      const fileDb = openDatabase(filePath);
      try {
        const result = fileDb.pragma("journal_mode") as { journal_mode: string }[];
        expect(result[0].journal_mode).toBe("wal");
      } finally {
        fileDb.close();
        rmSync(tmpDir, { recursive: true });
      }
    });
  });

  // ── Audit Log ──────────────────────────────────────────────────────

  describe("insertAuditLog / queryAuditLog", () => {
    const entry: AuditLogEntry = {
      id: "audit-1",
      agent_name: "note-taker",
      role_name: "writer",
      app_name: "filesystem",
      tool_name: "read_file",
      arguments: '{"path":"/tmp/test.md"}',
      result: '{"content":"hello"}',
      status: "success",
      duration_ms: 42,
      timestamp: "2026-03-04T00:00:00.000Z",
    };

    it("inserts and retrieves an audit log entry", () => {
      insertAuditLog(db, entry);
      const rows = queryAuditLog(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "audit-1",
        agent_name: "note-taker",
        app_name: "filesystem",
        tool_name: "read_file",
        status: "success",
        duration_ms: 42,
      });
    });

    it("inserts a denied entry with null result and duration", () => {
      const denied: AuditLogEntry = {
        ...entry,
        id: "audit-denied",
        status: "denied",
        result: undefined,
        duration_ms: undefined,
      };
      insertAuditLog(db, denied);
      const rows = queryAuditLog(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("denied");
      expect(rows[0].result).toBeNull();
      expect(rows[0].duration_ms).toBeNull();
    });

    it("filters by agent_name", () => {
      insertAuditLog(db, entry);
      insertAuditLog(db, { ...entry, id: "audit-2", agent_name: "other" });

      const rows = queryAuditLog(db, { agent_name: "note-taker" });
      expect(rows).toHaveLength(1);
      expect(rows[0].agent_name).toBe("note-taker");
    });

    it("filters by app_name", () => {
      insertAuditLog(db, entry);
      insertAuditLog(db, { ...entry, id: "audit-2", app_name: "github" });

      const rows = queryAuditLog(db, { app_name: "github" });
      expect(rows).toHaveLength(1);
      expect(rows[0].app_name).toBe("github");
    });

    it("filters by tool_name", () => {
      insertAuditLog(db, entry);
      insertAuditLog(db, { ...entry, id: "audit-2", tool_name: "write_file" });

      const rows = queryAuditLog(db, { tool_name: "write_file" });
      expect(rows).toHaveLength(1);
      expect(rows[0].tool_name).toBe("write_file");
    });

    it("filters by status", () => {
      insertAuditLog(db, entry);
      insertAuditLog(db, { ...entry, id: "audit-2", status: "error" });

      const rows = queryAuditLog(db, { status: "error" });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("error");
    });

    it("respects limit", () => {
      for (let i = 0; i < 20; i++) {
        insertAuditLog(db, {
          ...entry,
          id: `audit-${i}`,
          timestamp: `2026-03-04T00:00:${String(i).padStart(2, "0")}.000Z`,
        });
      }
      const rows = queryAuditLog(db, { limit: 5 });
      expect(rows).toHaveLength(5);
    });

    it("returns results ordered by timestamp descending", () => {
      insertAuditLog(db, { ...entry, id: "old", timestamp: "2026-03-01T00:00:00Z" });
      insertAuditLog(db, { ...entry, id: "new", timestamp: "2026-03-04T00:00:00Z" });

      const rows = queryAuditLog(db);
      expect(rows[0].id).toBe("new");
      expect(rows[1].id).toBe("old");
    });

    it("combines multiple filters", () => {
      insertAuditLog(db, entry);
      insertAuditLog(db, { ...entry, id: "audit-2", app_name: "github", status: "error" });
      insertAuditLog(db, { ...entry, id: "audit-3", app_name: "github", status: "success" });

      const rows = queryAuditLog(db, { app_name: "github", status: "error" });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("audit-2");
    });
  });

  // ── Approval Requests ──────────────────────────────────────────────

  describe("createApprovalRequest / getApprovalRequest", () => {
    const req: ApprovalRequest = {
      id: "req-1",
      agent_name: "note-taker",
      role_name: "writer",
      app_name: "github",
      tool_name: "delete_repo",
      arguments: '{"repo":"test"}',
      status: "pending",
      requested_at: "2026-03-04T00:00:00.000Z",
      ttl_seconds: 300,
    };

    it("creates a pending approval request", () => {
      createApprovalRequest(db, req);
      const result = getApprovalRequest(db, "req-1");
      expect(result).toBeDefined();
      expect(result!.status).toBe("pending");
      expect(result!.agent_name).toBe("note-taker");
      expect(result!.tool_name).toBe("delete_repo");
      expect(result!.ttl_seconds).toBe(300);
      expect(result!.resolved_at).toBeNull();
      expect(result!.resolved_by).toBeNull();
    });

    it("returns undefined for non-existent request", () => {
      const result = getApprovalRequest(db, "nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("updateApprovalStatus", () => {
    const req: ApprovalRequest = {
      id: "req-1",
      agent_name: "note-taker",
      role_name: "writer",
      app_name: "github",
      tool_name: "delete_repo",
      arguments: '{"repo":"test"}',
      status: "pending",
      requested_at: "2026-03-04T00:00:00.000Z",
      ttl_seconds: 300,
    };

    it("approves a request with resolved_by", () => {
      createApprovalRequest(db, req);
      updateApprovalStatus(db, "req-1", "approved", "operator@example.com");

      const result = getApprovalRequest(db, "req-1");
      expect(result!.status).toBe("approved");
      expect(result!.resolved_by).toBe("operator@example.com");
      expect(result!.resolved_at).toBeDefined();
      expect(result!.resolved_at).not.toBeNull();
    });

    it("denies a request with auto-timeout", () => {
      createApprovalRequest(db, req);
      updateApprovalStatus(db, "req-1", "denied", "auto-timeout");

      const result = getApprovalRequest(db, "req-1");
      expect(result!.status).toBe("denied");
      expect(result!.resolved_by).toBe("auto-timeout");
      expect(result!.resolved_at).not.toBeNull();
    });

    it("updates without resolved_by", () => {
      createApprovalRequest(db, req);
      updateApprovalStatus(db, "req-1", "denied");

      const result = getApprovalRequest(db, "req-1");
      expect(result!.status).toBe("denied");
      expect(result!.resolved_by).toBeNull();
      expect(result!.resolved_at).not.toBeNull();
    });
  });
});
