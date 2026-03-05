import type Database from "better-sqlite3";
import {
  generateId,
  createApprovalRequest,
  getApprovalRequest,
  updateApprovalStatus,
} from "../db.js";
import type { ApprovalRequest } from "../db.js";
import type { HookContext } from "./audit.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ApprovalOptions {
  ttlSeconds?: number;
  pollIntervalMs?: number;
}

// ── Pattern Matching ────────────────────────────────────────────────────

/**
 * Returns true if prefixedToolName matches any of the glob patterns.
 * Patterns support `*` as a wildcard matching any sequence of characters.
 */
export function matchesApprovalPattern(
  prefixedToolName: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return regex.test(prefixedToolName);
  });
}

// ── Approval Flow ───────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_POLL_INTERVAL_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a pending approval request and polls until resolved or TTL expires.
 * Returns "approved", "denied", or "timeout".
 */
export async function requestApproval(
  context: HookContext,
  db: Database.Database,
  options?: ApprovalOptions,
): Promise<"approved" | "denied" | "timeout"> {
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const id = generateId();
  const req: ApprovalRequest = {
    id,
    agent_name: context.agentName,
    role_name: context.roleName,
    app_name: context.appName,
    tool_name: context.prefixedToolName,
    arguments: context.arguments != null ? JSON.stringify(context.arguments) : undefined,
    status: "pending",
    requested_at: new Date().toISOString(),
    ttl_seconds: ttlSeconds,
  };

  try {
    createApprovalRequest(db, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[forge] approval request creation failed: ${message}`);
    return "denied";
  }

  const deadline = Date.now() + ttlSeconds * 1000;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    try {
      const current = getApprovalRequest(db, id);
      if (!current) {
        console.error(`[forge] approval request ${id} disappeared from database`);
        return "denied";
      }
      if (current.status === "approved") {
        return "approved";
      }
      if (current.status === "denied") {
        return "denied";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[forge] approval request poll failed: ${message}`);
      return "denied";
    }
  }

  // TTL expired — auto-deny
  try {
    // Check one final time to avoid race with external approval
    const final = getApprovalRequest(db, id);
    if (final && final.status !== "pending") {
      return final.status as "approved" | "denied";
    }
    updateApprovalStatus(db, id, "denied", "auto-timeout");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[forge] approval auto-timeout update failed: ${message}`);
  }

  return "timeout";
}
