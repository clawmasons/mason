/**
 * Per-cwd discovery cache for ACP session creation.
 *
 * Caches role and agent discovery results so that multiple `session/new`
 * calls for the same project directory reuse existing data rather than
 * re-scanning the filesystem.
 */

import type { Role } from "@clawmasons/shared";
import { discoverRoles, getDialect } from "@clawmasons/shared";
import type { AgentRegistry } from "@clawmasons/agent-sdk";
import {
  createAgentRegistry,
  getRegisteredAgentNames,
  readDefaultAgent,
} from "@clawmasons/agent-sdk";
import { default as mcpAgent } from "@clawmasons/mcp-agent/agent-package";
import { inferAgentType, createDefaultProjectRole } from "../cli/commands/run-agent.js";
import { acpLog } from "./acp-logger.js";

// Built-in agent packages — same as used by the materializer
const BUILTIN_AGENTS = [mcpAgent];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  roles: Role[];
  registry: AgentRegistry;
  agentNames: string[];
  defaultRole: Role;
  defaultAgent: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<string, DiscoveryResult>();

/**
 * Discover roles and agents for the given `cwd`, returning cached results
 * on subsequent calls for the same directory.
 */
export async function discoverForCwd(cwd: string): Promise<DiscoveryResult> {
  const cached = cache.get(cwd);
  if (cached) {
    acpLog("discoverForCwd: cache hit", { cwd });
    return cached;
  }
  acpLog("discoverForCwd: cache miss, discovering", { cwd });

  let roles = await discoverRoles(cwd);

  // If no non-packaged (local) roles, create a default project role
  const hasLocalRole = roles.some((r) => r.source.type === "local");
  if (!hasLocalRole) {
    const agentName = readDefaultAgent(cwd) ?? "claude-code-agent";
    const dialectDir = getDialect(agentName)?.directory ?? "claude";
    acpLog("discoverForCwd: no local roles, creating default", { dialectDir });
    await createDefaultProjectRole(cwd, dialectDir);
    roles = await discoverRoles(cwd);
  }

  // Pick the first non-packaged role as default, falling back to first role
  const defaultRole =
    roles.find((r) => r.source.type === "local") ?? roles[0];

  const registry = await createAgentRegistry(BUILTIN_AGENTS, cwd);
  const agentNames = getRegisteredAgentNames(registry);

  // Infer the default agent from the role's dialect + config
  const configDefault = readDefaultAgent(cwd);
  const defaultAgent = defaultRole
    ? inferAgentType(defaultRole, configDefault)
    : configDefault ?? "claude-code-agent";

  acpLog("discoverForCwd: complete", {
    roles: roles.map((r) => r.metadata.name),
    agentNames,
    defaultRole: defaultRole?.metadata.name,
    defaultAgent,
  });

  const result: DiscoveryResult = {
    roles,
    registry,
    agentNames,
    defaultRole,
    defaultAgent,
  };

  cache.set(cwd, result);
  return result;
}

/**
 * Invalidate the cached discovery results for a given `cwd`.
 * Used when role or agent configuration changes mid-session.
 */
export function invalidateCache(cwd: string): void {
  cache.delete(cwd);
}

