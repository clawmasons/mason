import { createRelayMessage } from "../relay/messages.js";
import type { RelayServer } from "../relay/server.js";
import type { ApprovalResponseMessage } from "../relay/messages.js";
import type { HookContext } from "./audit.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ApprovalOptions {
  ttlSeconds?: number;
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

/**
 * Sends an approval_request over the relay and awaits an approval_response.
 * Returns "approved", "denied", or "timeout".
 */
export async function requestApproval(
  context: HookContext,
  relay: RelayServer,
  options?: ApprovalOptions,
): Promise<"approved" | "denied" | "timeout"> {
  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const msg = createRelayMessage("approval_request", {
    agent_name: context.agentName,
    role_name: context.roleName,
    app_name: context.appName,
    tool_name: context.prefixedToolName,
    arguments: context.arguments != null ? JSON.stringify(context.arguments) : undefined,
    ttl_seconds: ttlSeconds,
  });

  try {
    const response = await relay.request(msg, ttlSeconds * 1000) as ApprovalResponseMessage;
    return response.status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("timed out")) {
      return "timeout";
    }
    console.error(`[mason] approval request failed: ${message}`);
    return "denied";
  }
}
