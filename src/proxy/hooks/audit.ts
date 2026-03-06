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
  };

  try {
    insertAuditLog(db, entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chapter] audit log write failed: ${message}`);
  }
}
