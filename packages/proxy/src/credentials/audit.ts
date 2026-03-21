import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { CLI_NAME_LOWERCASE } from "@clawmasons/shared";

// ── Types ──────────────────────────────────────────────────────────────

export interface CredentialAuditEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  role: string;
  session_id: string;
  credential_key: string;
  outcome: "granted" | "denied" | "error";
  deny_reason: string | null;
  source: string | null;
}

export interface CredentialAuditFilters {
  agent_id?: string;
  credential_key?: string;
  outcome?: string;
  session_id?: string;
  limit?: number;
}

/**
 * Callback interface for emitting audit entries.
 *
 * The default implementation writes to SQLite (backward compat).
 * CHANGE 6 will replace this with a relay-based emitter.
 */
export type AuditEmitter = (entry: CredentialAuditEntry) => void;

// ── Schema ─────────────────────────────────────────────────────────────

const CREATE_CREDENTIAL_AUDIT = `
CREATE TABLE IF NOT EXISTS credential_audit (
  id              TEXT PRIMARY KEY,
  timestamp       TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  role            TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  credential_key  TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  deny_reason     TEXT,
  source          TEXT
)`;

// ── Database ───────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = process.env.CREDENTIAL_DB_PATH
  ?? join(homedir(), `.${CLI_NAME_LOWERCASE}`, "data", `${CLI_NAME_LOWERCASE}.db`);

/**
 * Open the credential audit database and ensure the table exists.
 *
 * @deprecated Will be removed in CHANGE 6 when SQLite is replaced by relay audit events.
 */
export function openCredentialDatabase(
  dbPath: string = DEFAULT_DB_PATH,
): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(CREATE_CREDENTIAL_AUDIT);
  return db;
}

// ── Operations ─────────────────────────────────────────────────────────

/**
 * Insert a credential audit entry.
 *
 * @deprecated Will be removed in CHANGE 6 when SQLite is replaced by relay audit events.
 */
export function insertCredentialAudit(
  db: Database.Database,
  entry: CredentialAuditEntry,
): void {
  const stmt = db.prepare(`
    INSERT INTO credential_audit (id, timestamp, agent_id, role, session_id, credential_key, outcome, deny_reason, source)
    VALUES (@id, @timestamp, @agent_id, @role, @session_id, @credential_key, @outcome, @deny_reason, @source)
  `);
  stmt.run({
    ...entry,
    deny_reason: entry.deny_reason ?? null,
    source: entry.source ?? null,
  });
}

/**
 * Query credential audit entries with optional filters.
 *
 * @deprecated Will be removed in CHANGE 6 when SQLite is replaced by relay audit events.
 */
export function queryCredentialAudit(
  db: Database.Database,
  filters?: CredentialAuditFilters,
): CredentialAuditEntry[] {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters?.agent_id) {
    conditions.push("agent_id = @agent_id");
    params.agent_id = filters.agent_id;
  }
  if (filters?.credential_key) {
    conditions.push("credential_key = @credential_key");
    params.credential_key = filters.credential_key;
  }
  if (filters?.outcome) {
    conditions.push("outcome = @outcome");
    params.outcome = filters.outcome;
  }
  if (filters?.session_id) {
    conditions.push("session_id = @session_id");
    params.session_id = filters.session_id;
  }

  let sql = "SELECT * FROM credential_audit";
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY timestamp DESC";

  if (filters?.limit) {
    sql += " LIMIT @limit";
    params.limit = filters.limit;
  }

  return db.prepare(sql).all(params) as CredentialAuditEntry[];
}

/**
 * Generate a unique ID for audit entries.
 */
export function generateAuditId(): string {
  return randomUUID();
}

/**
 * Create an AuditEmitter that writes to a SQLite database.
 *
 * @deprecated Will be removed in CHANGE 6 when SQLite is replaced by relay audit events.
 */
export function createSqliteAuditEmitter(db: Database.Database): AuditEmitter {
  return (entry: CredentialAuditEntry) => {
    insertCredentialAudit(db, entry);
  };
}
