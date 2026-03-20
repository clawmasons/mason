import type Database from "better-sqlite3";
import { generateId, insertAuditLog } from "../db.js";
import type { AuditLogEntry } from "../db.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface HookContext {
  agentName: string;
  roleName: string;
  appName: string;
  toolName: string;
  prefixedToolName: string;
  arguments: unknown;
  sessionType?: string;
  acpClient?: string;
}

export interface AuditPreHookResult {
  id: string;
  startTime: number;
}

// ── Pre-Hook ───────────────────────────────────────────────────────────

export function auditPreHook(context: HookContext): AuditPreHookResult {
  void context;
  return {
    id: generateId(),
    startTime: Date.now(),
  };
}

// ── Post-Hook ──────────────────────────────────────────────────────────

export function auditPostHook(
  context: HookContext,
  preResult: AuditPreHookResult,
  callResult: unknown,
  status: AuditLogEntry["status"],
  db: Database.Database,
): void {
  const durationMs = Date.now() - preResult.startTime;

  const entry: AuditLogEntry = {
    id: preResult.id,
    agent_name: context.agentName,
    role_name: context.roleName,
    app_name: context.appName,
    tool_name: context.toolName,
    arguments: context.arguments != null ? JSON.stringify(context.arguments) : undefined,
    result: callResult != null ? JSON.stringify(callResult) : undefined,
    status,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
    session_type: context.sessionType,
    acp_client: context.acpClient,
  };

  try {
    insertAuditLog(db, entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mason] audit log write failed: ${message}`);
  }
}

// ── Dropped Server Logging ─────────────────────────────────────────────

export interface DroppedServer {
  name: string;
  reason: string;
}

/**
 * Log each dropped (unmatched) MCP server as an audit entry with status "dropped".
 *
 * Called during ACP session setup when MCP servers from the ACP client
 * don't match any App.
 */
export function logDroppedServers(
  db: Database.Database,
  unmatched: DroppedServer[],
  agentName: string,
  roleName: string,
  acpClient?: string,
): void {
  for (const server of unmatched) {
    const entry: AuditLogEntry = {
      id: generateId(),
      agent_name: agentName,
      role_name: roleName,
      app_name: server.name,
      tool_name: server.name,
      arguments: undefined,
      result: JSON.stringify(server.reason),
      status: "dropped",
      duration_ms: 0,
      timestamp: new Date().toISOString(),
      session_type: "acp",
      acp_client: acpClient,
    };

    try {
      insertAuditLog(db, entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mason] audit log write failed (dropped server "${server.name}"): ${message}`);
    }
  }
}
