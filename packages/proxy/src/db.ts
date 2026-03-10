import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// ── Types ──────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;
  result?: string;
  status: "success" | "error" | "denied" | "timeout" | "dropped";
  duration_ms?: number;
  timestamp: string;
  session_type?: string;
  acp_client?: string;
}

export interface ApprovalRequest {
  id: string;
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  resolved_at?: string;
  resolved_by?: string;
  ttl_seconds: number;
}

export interface AuditLogFilters {
  agent_name?: string;
  app_name?: string;
  tool_name?: string;
  status?: string;
  session_type?: string;
  limit?: number;
}

// ── Schema ─────────────────────────────────────────────────────────────

const CREATE_AUDIT_LOG = `
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  role_name    TEXT NOT NULL,
  app_name     TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    TEXT,
  result       TEXT,
  status       TEXT NOT NULL,
  duration_ms  INTEGER,
  timestamp    TEXT NOT NULL
)`;

const CREATE_APPROVAL_REQUESTS = `
CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  role_name    TEXT NOT NULL,
  app_name     TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT,
  ttl_seconds  INTEGER NOT NULL DEFAULT 300
)`;

// ── Database ───────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = process.env.CHAPTER_DB_PATH
  ?? join(homedir(), ".chapter", "data", "chapter.db");

export function openDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(CREATE_AUDIT_LOG);
  db.exec(CREATE_APPROVAL_REQUESTS);

  // ── Schema Migrations (idempotent) ──────────────────────────────────
  // Add ACP session columns to audit_log (nullable for backward compat)
  try { db.exec("ALTER TABLE audit_log ADD COLUMN session_type TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE audit_log ADD COLUMN acp_client TEXT"); } catch { /* column already exists */ }

  return db;
}

// ── Audit Log ──────────────────────────────────────────────────────────

export function insertAuditLog(db: Database.Database, entry: AuditLogEntry): void {
  const stmt = db.prepare(`
    INSERT INTO audit_log (id, agent_name, role_name, app_name, tool_name, arguments, result, status, duration_ms, timestamp, session_type, acp_client)
    VALUES (@id, @agent_name, @role_name, @app_name, @tool_name, @arguments, @result, @status, @duration_ms, @timestamp, @session_type, @acp_client)
  `);
  stmt.run({
    id: entry.id,
    agent_name: entry.agent_name,
    role_name: entry.role_name,
    app_name: entry.app_name,
    tool_name: entry.tool_name,
    arguments: entry.arguments ?? null,
    result: entry.result ?? null,
    status: entry.status,
    duration_ms: entry.duration_ms ?? null,
    timestamp: entry.timestamp,
    session_type: entry.session_type ?? null,
    acp_client: entry.acp_client ?? null,
  });
}

export function queryAuditLog(
  db: Database.Database,
  filters?: AuditLogFilters,
): AuditLogEntry[] {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters?.agent_name) {
    conditions.push("agent_name = @agent_name");
    params.agent_name = filters.agent_name;
  }
  if (filters?.app_name) {
    conditions.push("app_name = @app_name");
    params.app_name = filters.app_name;
  }
  if (filters?.tool_name) {
    conditions.push("tool_name = @tool_name");
    params.tool_name = filters.tool_name;
  }
  if (filters?.status) {
    conditions.push("status = @status");
    params.status = filters.status;
  }
  if (filters?.session_type) {
    conditions.push("session_type = @session_type");
    params.session_type = filters.session_type;
  }

  let sql = "SELECT * FROM audit_log";
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY timestamp DESC";

  if (filters?.limit) {
    sql += " LIMIT @limit";
    params.limit = filters.limit;
  }

  return db.prepare(sql).all(params) as AuditLogEntry[];
}

// ── Approval Requests ──────────────────────────────────────────────────

export function createApprovalRequest(db: Database.Database, req: ApprovalRequest): void {
  const stmt = db.prepare(`
    INSERT INTO approval_requests (id, agent_name, role_name, app_name, tool_name, arguments, status, requested_at, resolved_at, resolved_by, ttl_seconds)
    VALUES (@id, @agent_name, @role_name, @app_name, @tool_name, @arguments, @status, @requested_at, @resolved_at, @resolved_by, @ttl_seconds)
  `);
  stmt.run({
    ...req,
    resolved_at: req.resolved_at ?? null,
    resolved_by: req.resolved_by ?? null,
    arguments: req.arguments ?? null,
  });
}

export function getApprovalRequest(
  db: Database.Database,
  id: string,
): ApprovalRequest | undefined {
  const stmt = db.prepare("SELECT * FROM approval_requests WHERE id = ?");
  return stmt.get(id) as ApprovalRequest | undefined;
}

export function updateApprovalStatus(
  db: Database.Database,
  id: string,
  status: "approved" | "denied",
  resolvedBy?: string,
): void {
  const stmt = db.prepare(`
    UPDATE approval_requests
    SET status = @status, resolved_at = @resolved_at, resolved_by = @resolved_by
    WHERE id = @id
  `);
  stmt.run({
    id,
    status,
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy ?? null,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

export function generateId(): string {
  return randomUUID();
}
