import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createRelayMessage } from "../relay/messages.js";
import type { RelayServer } from "../relay/server.js";

// ── Local Audit Log ──────────────────────────────────────────────────

let localAuditPath: string | undefined;

/**
 * Set the path for local audit log file.
 * When set, audit events are written to this file regardless of relay status.
 */
export function setLocalAuditPath(path: string): void {
  localAuditPath = path;
}

function writeLocalAudit(msg: unknown): void {
  if (!localAuditPath) return;
  try {
    appendFileSync(localAuditPath, JSON.stringify(msg) + "\n");
  } catch { /* best-effort */ }
}

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
    id: randomUUID(),
    startTime: Date.now(),
  };
}

// ── Post-Hook ──────────────────────────────────────────────────────────

export type AuditStatus = "success" | "error" | "denied" | "timeout" | "dropped";

export function auditPostHook(
  context: HookContext,
  preResult: AuditPreHookResult,
  callResult: unknown,
  status: AuditStatus,
  relay: RelayServer | null,
): void {
  const durationMs = Date.now() - preResult.startTime;

  const msg = createRelayMessage("audit_event", {
    agent_name: context.agentName,
    role_name: context.roleName,
    app_name: context.appName,
    tool_name: context.toolName,
    arguments: context.arguments != null ? JSON.stringify(context.arguments) : undefined,
    result: callResult != null ? JSON.stringify(callResult) : undefined,
    status,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  });

  writeLocalAudit(msg);

  if (!relay) return;

  try {
    relay.send(msg);
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
  relay: RelayServer | null,
  unmatched: DroppedServer[],
  agentName: string,
  roleName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _acpClient?: string,
): void {
  for (const server of unmatched) {
    const msg = createRelayMessage("audit_event", {
      agent_name: agentName,
      role_name: roleName,
      app_name: server.name,
      tool_name: server.name,
      arguments: undefined,
      result: JSON.stringify(server.reason),
      status: "dropped",
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    });

    writeLocalAudit(msg);

    if (!relay) continue;

    try {
      relay.send(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mason] audit log write failed (dropped server "${server.name}"): ${message}`);
    }
  }
}
