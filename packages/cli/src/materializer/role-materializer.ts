/**
 * Role-based materializer orchestration.
 *
 * Provides `materializeForAgent()` — the primary entry point for the
 * ROLE_TYPES pipeline to invoke existing materializers. Internally
 * converts a RoleType to a ResolvedAgent via the adapter (Change 4)
 * and delegates to the appropriate RuntimeMaterializer.
 *
 * Also provides a materializer registry for looking up materializers
 * by agent type string.
 */

import type { RoleType } from "@clawmasons/shared";
import { adaptRoleToResolvedAgent } from "@clawmasons/shared";
import type { RuntimeMaterializer, MaterializationResult, MaterializeOptions } from "./types.js";
import { claudeCodeMaterializer } from "./claude-code.js";
import { piCodingAgentMaterializer } from "./pi-coding-agent.js";
import { mcpAgentMaterializer } from "./mcp-agent.js";
import { bashAgentMaterializer } from "./bash-agent.js";

/** Default proxy endpoint used when none is provided. */
const DEFAULT_PROXY_ENDPOINT = "http://mcp-proxy:9090";

/**
 * Error thrown when materialization fails due to registry issues.
 */
export class MaterializerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterializerError";
  }
}

// ---------------------------------------------------------------------------
// Materializer Registry
// ---------------------------------------------------------------------------

const materializerRegistry: Map<string, RuntimeMaterializer> = new Map([
  ["claude-code", claudeCodeMaterializer],
  ["pi-coding-agent", piCodingAgentMaterializer],
  ["mcp-agent", mcpAgentMaterializer],
  ["bash-agent", bashAgentMaterializer],
]);

/**
 * Look up a materializer by agent type.
 *
 * @param agentType - The agent type string (e.g., "claude-code", "mcp-agent")
 * @returns The RuntimeMaterializer for that type, or undefined if not registered
 */
export function getMaterializer(agentType: string): RuntimeMaterializer | undefined {
  return materializerRegistry.get(agentType);
}

/**
 * Get all registered agent types.
 *
 * @returns Array of agent type strings that have materializers registered
 */
export function getRegisteredAgentTypes(): string[] {
  return [...materializerRegistry.keys()];
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Materialize a RoleType for a specific agent runtime.
 *
 * This is the primary entry point for the ROLE_TYPES pipeline. It:
 * 1. Looks up the materializer for the given agent type
 * 2. Converts the RoleType to a ResolvedAgent via the adapter
 * 3. Invokes the materializer's existing workspace generation logic
 *
 * @param role - A validated RoleType from the ROLE_TYPES pipeline
 * @param agentType - The target agent type (e.g., "claude-code", "pi-coding-agent", "mcp-agent")
 * @param proxyEndpoint - The MCP proxy endpoint URL (defaults to "http://mcp-proxy:9090")
 * @param proxyToken - Optional proxy authentication token
 * @param options - Optional materialization options (e.g., ACP mode)
 * @returns A MaterializationResult (Map of relative paths to file content)
 * @throws MaterializerError if no materializer is registered for the agent type
 * @throws AdapterError (from @clawmasons/shared) if the agent type is not a known dialect
 */
export function materializeForAgent(
  role: RoleType,
  agentType: string,
  proxyEndpoint?: string,
  proxyToken?: string,
  options?: MaterializeOptions,
): MaterializationResult {
  const materializer = materializerRegistry.get(agentType);
  if (!materializer) {
    const knownTypes = getRegisteredAgentTypes().join(", ");
    throw new MaterializerError(
      `No materializer registered for agent type "${agentType}". ` +
      `Registered types: ${knownTypes}`,
    );
  }

  // Convert RoleType to ResolvedAgent via the adapter.
  // This may throw AdapterError if the agentType is not a registered dialect.
  const resolvedAgent = adaptRoleToResolvedAgent(role, agentType);

  const endpoint = proxyEndpoint ?? DEFAULT_PROXY_ENDPOINT;

  return materializer.materializeWorkspace(
    resolvedAgent,
    endpoint,
    proxyToken,
    options,
  );
}
